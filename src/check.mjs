// Vérification HTTP des sites de la carte V1 et des candidats -> donnees/checks/latest.json.
//
// Modes (--only=) : map (sites de la V1), candidates (candidats), new (candidats jamais vérifiés),
// unknown (URLs restées indéterminées), roots (sites principaux indéterminés ou hors ligne),
// refused (connexions refusées). Sans option : tout. Les résultats non revérifiés sont conservés.
import { lookup } from 'node:dns/promises';
import { writeFile } from 'node:fs/promises';
import { selectCandidates } from './candidates.mjs';
import { FILES, config, jsonLines, path, progress, readJson, readJsonIf, writeOut } from './context.mjs';
import { checkUrl, pool } from './lib/http.mjs';
import { hostOf, isUrl } from './lib/url.mjs';

const RETRY = {
  unknown: r => r.statut === 'Indéterminé',
  roots: r => !r.parentKey && (r.statut === 'Indéterminé' || r.statut === 'Hors ligne'),
  refused: r => r.statut === 'Hors ligne' && /ECONNREFUSED/.test(r.error || '') && !/ENOTFOUND/.test(r.error || ''),
};
const MODES = ['map', 'candidates', 'new', ...Object.keys(RETRY)];
const resultKey = r => `${r.kind} ${r.url}`;

export async function check({ only, limit } = {}) {
  if (only && !MODES.includes(only)) throw new Error(`--only=${only} inconnu (${MODES.join(', ')})`);
  const previous = await readJsonIf(FILES.checks, []);
  let targets = [];
  if (RETRY[only]) {
    targets = previous.filter(RETRY[only]).map(({ statut, code, finalUrl, error, checkedAt, ...t }) => t);
  } else {
    if (!only || only === 'map') {
      const elements = await readJson(FILES.v1Elements);
      const urls = [...new Set(elements.filter(e => isUrl(e.label)).map(e => e.label.trim()))];
      targets.push(...urls.map(url => ({ url, kind: 'map' })));
    }
    if (!only || only === 'candidates' || only === 'new') targets.push(...await candidateTargets(only === 'new' ? previous : null));
  }
  if (limit) targets = targets.slice(0, Number(limit));
  const results = await verify(interleave(targets));

  // Vérification partielle : les résultats précédents de l'autre partie sont conservés.
  let all = results;
  if (only) {
    const redone = new Set(results.map(resultKey));
    const current = await readJsonIf(FILES.checks, []); // mis à jour par candidateTargets
    const keep = only === 'map' || only === 'candidates'
      ? r => r.kind !== (only === 'map' ? 'map' : 'candidate')
      : r => !redone.has(resultKey(r));
    all = [...current.filter(keep), ...results];
  }
  // Pas de copie datée : l'historique Git conserve chaque version.
  await writeOut(FILES.checks, jsonLines(all));
}

// Candidats à vérifier. En mode « new » (previous fourni), les informations des candidats déjà
// vérifiés sont mises à jour (type DINUM, parent, source…), ceux sortis du périmètre retirés, et
// seuls les autres sont vérifiés.
async function candidateTargets(previous) {
  const dinumRows = await readJsonIf(FILES.dinum, null);
  if (!dinumRows) console.warn('  Avertissement : liste DINUM absente, seuls les autres candidats sont vérifiés.');
  let candidates = selectCandidates({
    elements: await readJson(FILES.v1Elements),
    dinumRows: dinumRows || [],
    annuaireRows: await readJson(FILES.annuaire),
    crtsh: await readJsonIf(FILES.crtsh, {}),
    demarches: await readJsonIf(FILES.demarches, []),
  });
  if (previous) {
    const byKey = new Map(candidates.map(c => [c.key, c]));
    const checked = new Set(previous.filter(r => r.kind === 'candidate').map(r => r.key));
    let refreshed = 0;
    const kept = previous.filter(r => r.kind !== 'candidate' || byKey.has(r.key)).map(r => {
      const c = r.kind === 'candidate' && byKey.get(r.key);
      if (!c) return r;
      refreshed++;
      const { dinumType, parentKey, source, siren, ...rest } = r;
      return { ...rest, ...(c.dinumType && { dinumType: c.dinumType }), ...(c.parentKey && { parentKey: c.parentKey }), source: c.source, siren: c.siren || siren };
    });
    await writeFile(path(FILES.checks), jsonLines(kept));
    console.log(`  ${refreshed} candidats déjà vérifiés mis à jour, ${previous.length - kept.length} retirés (hors du périmètre actuel)`);
    candidates = candidates.filter(c => !checked.has(c.key));
  }
  // Les noms issus des certificats n'ont pas de statut connu : ceux absents du DNS sont écartés.
  const toResolve = candidates.filter(c => c.dnsCheck);
  if (toResolve.length) {
    console.log(`Résolution DNS de ${toResolve.length} sous-domaines issus des certificats…`);
    const alive = new Set();
    await pool(toResolve, 64, async c => {
      const host = new URL(c.url).hostname;
      const ok = await Promise.race([lookup(host).then(() => true, () => false), new Promise(r => setTimeout(() => r(false), 10000))]);
      if (ok) alive.add(c.key);
    });
    console.log(`  ${alive.size} existent dans le DNS`);
    candidates = candidates.filter(c => !c.dnsCheck || alive.has(c.key));
  }
  return candidates.map(({ dnsCheck, ...c }) => ({ ...c, kind: 'candidate' }));
}

// Ordre intercalé par domaine : les sous-domaines d'un même organisme (souvent sur un même
// serveur, limité à une requête toutes les 2 s) ne monopolisent pas les vérifications.
function interleave(targets) {
  const groups = new Map();
  for (const t of targets) {
    const g = t.parentKey || hostOf(t.url).split('.').slice(-2).join('.');
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(t);
  }
  const queues = [...groups.values()];
  const longest = Math.max(0, ...queues.map(q => q.length));
  const out = [];
  for (let i = 0; i < longest; i++) for (const q of queues) if (i < q.length) out.push(q[i]);
  return out;
}

async function verify(targets) {
  const { concurrency, timeoutMs, userAgent, perIp, perIpGapMs } = config.check;
  const opts = { timeoutMs, userAgent, perIp, perIpGapMs };
  console.log(`Vérification de ${targets.length} URLs (${concurrency} en parallèle)…`);
  const show = progress('URLs vérifiées');
  const onProgress = (d, n) => { if (d % 50 === 0 || d === n) show(d, n); };

  // Résultats enregistrés toutes les 500 URLs : une vérification interrompue reprend avec --only=new.
  const previous = await readJsonIf(FILES.checks, []);
  const partial = [];
  const checkpoint = async () => {
    const done = new Set(partial.map(resultKey));
    await writeFile(path(FILES.checks), jsonLines([...previous.filter(r => !done.has(resultKey(r))), ...partial]));
  };
  const results = await pool(targets, concurrency, async t => {
    const r = { ...t, ...(await checkUrl(t.url, opts)) };
    partial.push(r);
    if (partial.length % 500 === 0) await checkpoint().catch(() => {});
    return r;
  }, onProgress);

  // Second passage, plus lent, pour écarter les échecs transitoires des sites de la V1 (un
  // candidat qui ne répond pas n'est simplement pas ajouté ; il est revérifié le mois suivant).
  const failed = results.map((r, i) => [r, i]).filter(([r]) => r.kind === 'map' && (r.statut === 'Hors ligne' || r.statut === 'Indéterminé'));
  if (failed.length) {
    console.log(`\n  Nouvel essai pour ${failed.length} URLs en échec…`);
    await pool(failed, Math.max(1, Math.floor(concurrency / 2)), async ([r, i]) => {
      const again = await checkUrl(r.url, { ...opts, timeoutMs: timeoutMs * 2 });
      if (again.statut !== 'Hors ligne') results[i] = { ...r, ...again };
    }, onProgress);
  }
  const count = s => results.filter(r => r.statut === s).length;
  console.log(`\n  En ligne ${count('En ligne')} · Redirigé ${count('Redirigé')} · Hors ligne ${count('Hors ligne')} · Indéterminé ${count('Indéterminé')}`);
  return results;
}
