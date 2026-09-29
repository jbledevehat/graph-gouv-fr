// Téléchargement des sources publiques -> donnees/sources/ (non versionné).
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FILES, config, download, writeOut } from './context.mjs';
import { parseCsv } from './lib/csv.mjs';

// Noms de domaine des organismes publics (DINUM). Le fichier brut peut être remplacé par une page
// anti-robot : on passe alors par un clone git du dépôt, et à défaut la liste précédente est gardée.
const isDinumCsv = text => /^name,/.test(text) && text.split('\n').length > 1000;

async function dinumByGit() {
  const dir = await mkdtemp(join(tmpdir(), 'dinum-'));
  try {
    const repo = config.sources.dinum.replace(/\/-\/raw\/.*$/, '.git');
    await new Promise((ok, ko) => execFile('git', ['clone', '--depth', '1', '--quiet', repo, dir], { timeout: 300000 }, e => e ? ko(e) : ok()));
    return await readFile(join(dir, 'domains.csv'), 'utf8');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function fetchDinum() {
  console.log('Liste DINUM des noms de domaine publics…');
  let text = await download(config.sources.dinum, 'DINUM').then(r => r.text()).catch(() => '');
  if (!isDinumCsv(text)) {
    console.log('  Fichier brut indisponible (page anti-robot), clone git du dépôt…');
    text = await dinumByGit().catch(e => { console.warn(`  Clone impossible : ${e.message}`); return ''; });
  }
  if (!isDinumCsv(text)) throw new Error('DINUM : liste introuvable, liste précédente conservée');
  await writeOut(FILES.dinumCsv, text);
  const rows = parseCsv(text).filter(r => r.name);
  await writeOut(FILES.dinum, rows);
  const suffix = '.' + config.candidates.suffix;
  console.log(`  ${rows.length} domaines, dont ${rows.filter(r => r.name.endsWith(suffix)).length} en ${config.candidates.suffix}`);
}

// Services nationaux (catégorie « SI ») de l'Annuaire de l'administration ayant un site internet.
async function fetchAnnuaire() {
  console.log('Annuaire de l\'administration (services nationaux)…');
  const { url, excludeTypes } = config.sources.annuaire;
  const quote = s => `"${s.replace(/"/g, '\\"')}"`;
  const where = `categorie="SI" and site_internet is not null`
    + (excludeTypes.length ? ` and not type_organisme in (${excludeTypes.map(quote).join(',')})` : '');
  const qs = new URLSearchParams({ select: 'id,nom,sigle,type_organisme,site_internet,hierarchie,siren,url_service_public,adresse', where });
  const res = await download(`${url}/exports/json?${qs}`, 'Annuaire');
  const rows = (await res.json()).map(({ hierarchie, adresse, ...r }) => {
    const a = JSON.parse(adresse || '[]').find(x => x.type_adresse === 'Adresse');
    return {
      ...r,
      site_internet: JSON.parse(r.site_internet || '[]').map(s => s.valeur?.trim()).filter(Boolean),
      // Seuls les liens « Service Fils » décrivent un rattachement hiérarchique.
      enfants: JSON.parse(hierarchie || '[]').filter(h => h.type_hierarchie === 'Service Fils').map(h => h.service),
      adresse: a ? [a.numero_voie, a.code_postal].map(v => (v || '').toLowerCase().replace(/\s+/g, ' ').trim()).join('|') : '',
    };
  });
  await writeOut(FILES.annuaire, rows);
  console.log(`  ${rows.length} services, ${new Set(rows.flatMap(r => r.site_internet)).size} sites déclarés`);
}

// Opérateurs de l'État (annexe « jaune » du PLF) : statut et programme budgétaire chef de file.
async function fetchOperateurs() {
  console.log('Opérateurs de l\'État (PLF)…');
  const res = await download(config.sources.operateurs, 'Opérateurs');
  const text = new TextDecoder('windows-1252').decode(await res.arrayBuffer());
  const raw = parseCsv(text, ';');
  const [nameCol, subCol, statusCol, progCol] = Object.keys(raw[0]);
  const rows = raw.map(r => ({
    nom: (r[subCol] || r[nameCol]).trim(),
    categorie: r[subCol] ? r[nameCol].trim() : '',
    statut: r[statusCol].trim(),
    programme: r[progCol].match(/\b(\d{3})\s*[–-]/)?.[1] || '',
    mission: r[progCol].replace(/\s+/g, ' ').trim(),
  }));
  await writeOut(FILES.operateurs, rows);
  console.log(`  ${rows.length} opérateurs`);
}

// Départements et régions (geo.api.gouv.fr) : sites de préfecture <territoire>.gouv.fr.
async function fetchTerritoires() {
  console.log('Départements et régions (geo.api.gouv.fr)…');
  const lists = await Promise.all(['departements', 'regions'].map(async k => (await download(`https://geo.api.gouv.fr/${k}?fields=nom`, k)).json()));
  const names = lists.flat().map(x => x.nom);
  await writeOut(FILES.territoires, names);
  console.log(`  ${names.length} territoires`);
}

// Démarches essentielles de l'Observatoire de la qualité des démarches en ligne (dernière édition).
async function fetchDemarches() {
  console.log('Démarches essentielles (Observatoire)…');
  const rows = await (await download(config.sources.demarches, 'Observatoire')).json();
  // Indicateurs de qualité, tels que l'Observatoire les affiche (« 7.3 / 10 », « Partiel »…).
  const INDICATORS = ['online', 'satisfaction', 'handicap', 'dlnuf', 'simplicity', 'auth', 'help_reachable', 'usage', 'uptime', 'performance'];
  const list = (Array.isArray(rows) ? rows : rows.docs || []).map(r => ({
    titre: r.title,
    ministere: r.ministere || '',
    administration: r.administration || r.sousorg || '',
    url: (r.fields || []).find(f => f.slug === 'online' && /^https?:\/\//.test(f.value || ''))?.value || '',
    volume: r.volume || null,
    edition: r.edition?.name || '',
    indicateurs: Object.fromEntries((r.fields || []).filter(f => INDICATORS.includes(f.slug)).map(f => [f.slug, f.label || ''])),
  }));
  await writeOut(FILES.demarches, list);
  console.log(`  ${list.length} démarches, ${list.filter(d => d.url).length} en ligne`);
}

// Seul l'annuaire et les opérateurs sont indispensables ; sans les autres sources, la carte est
// construite avec les données précédentes ou sans la règle concernée.
export async function fetchSources() {
  const optional = async (step, effect) => {
    try { await step(); } catch (e) { console.warn(`  Avertissement : ${e.message} (${effect})`); }
  };
  await optional(fetchDinum, 'liste DINUM ignorée');
  await fetchAnnuaire();
  await fetchOperateurs();
  await optional(fetchTerritoires, 'règle des préfectures limitée à la V1');
  await optional(fetchDemarches, 'démarches essentielles ignorées');
}
