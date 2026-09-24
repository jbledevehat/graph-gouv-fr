#!/usr/bin/env node
// Mise à jour de la cartographie Kumu des sites web en gouv.fr.
//
//   node src/cli.mjs fetch-kumu      instantané de la carte Kumu publique (V1)   -> donnees/kumu/
//   node src/cli.mjs fetch-sources   DINUM, Annuaire de l'administration, opérateurs -> donnees/sources/
//   node src/cli.mjs check           vérifie les URLs (carte + candidats)         -> donnees/checks/
//   node src/cli.mjs build           jeu de données complet V2 + rapport          -> out/
//   node src/cli.mjs all             enchaîne les quatre étapes
//
// Options : --limit=N (limite le nombre d'URLs vérifiées, pour tester)
//           --only=map|candidates|unknown (ne vérifie qu'une partie, le reste est repris du dernier
//           passage ; « unknown » = seulement les URLs restées indéterminées)
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCsv, parseConfigCsv, toCsv } from './lib/csv.mjs';
import { checkUrl, pool } from './lib/http.mjs';
import { hostOf, isUrl, registrable, siteKey } from './lib/url.mjs';
import { buildGraph, toGexf, toWebData } from './graph.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const p = (...parts) => join(ROOT, ...parts);
const config = JSON.parse(await readFile(p('config/config.json'), 'utf8'));
const args = Object.fromEntries(process.argv.slice(3).map(a => a.replace(/^--/, '').split('=')));
const today = new Date().toISOString().slice(0, 10);

const OFF = 'Site off/archivé';

async function readJson(file) {
  if (!existsSync(file)) throw new Error(`${file} introuvable : lancez d'abord l'étape précédente.`);
  return JSON.parse(await readFile(file, 'utf8'));
}

async function writeOut(file, content) {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, typeof content === 'string' ? content : JSON.stringify(content, null, 2) + '\n');
  console.log(`  -> ${file.replace(ROOT + '/', '')}`);
}

// ---------------------------------------------------------------- fetch-kumu

async function fetchKumu() {
  const base = `https://kumu.io/${config.kumu.project}/couch/_design/resources/_view/all?key=`;
  const get = async type => {
    const res = await fetch(base + encodeURIComponent(JSON.stringify(type)));
    if (!res.ok) throw new Error(`Kumu ${type}: HTTP ${res.status}`);
    return (await res.json()).rows.map(r => r.value).sort((a, b) => a._id.localeCompare(b._id));
  };
  console.log(`Lecture de la carte Kumu ${config.kumu.project}…`);
  const [elements, connections, maps, perspectives] = await Promise.all([get('Element'), get('Connection'), get('Map'), get('Perspective')]);
  const simplify = ({ _id, attributes, from_id, to_id, direction }) =>
    ({ id: _id, ...(from_id && { from: from_id, to: to_id, direction }), ...attributes });
  await writeOut(p('donnees/kumu/elements.json'), elements.map(simplify));
  await writeOut(p('donnees/kumu/connections.json'), connections.map(simplify));
  await writeOut(p('donnees/kumu/maps.json'), maps.map(({ _id, name, description, updated_at }) => ({ id: _id, name, updated_at, description })));
  // Feuille de style de la vue (couleurs, légende) à reprendre dans la carte V2.
  await writeOut(p('donnees/kumu/perspective.css'), perspectives.map(v => v.style || '').join('\n\n'));
  console.log(`  ${elements.length} éléments, ${connections.length} connexions`);
}

// ------------------------------------------------------------- fetch-sources

async function fetchDinum() {
  console.log('Téléchargement de la liste DINUM des noms de domaine publics…');
  const res = await fetch(config.sources.dinum);
  if (!res.ok) throw new Error(`DINUM: HTTP ${res.status}`);
  const text = await res.text();
  await writeOut(p('donnees/sources/dinum-domains.csv'), text);
  const suffix = '.' + config.candidates.suffix;
  const rows = parseCsv(text).filter(r => r.name.endsWith(suffix));
  await writeOut(p('donnees/sources/dinum-gouvfr.json'), rows);
  console.log(`  ${rows.length} domaines en ${config.candidates.suffix}`);
}

// Services nationaux (catégorie « SI ») de l'Annuaire de l'administration ayant un site internet.
async function fetchAnnuaire() {
  console.log('Téléchargement de l\'Annuaire de l\'administration (services nationaux)…');
  const { url, excludeTypes } = config.sources.annuaire;
  const quote = s => `"${s.replace(/"/g, '\\"')}"`;
  const where = `categorie="SI" and site_internet is not null`
    + (excludeTypes.length ? ` and not type_organisme in (${excludeTypes.map(quote).join(',')})` : '');
  const qs = new URLSearchParams({ select: 'id,nom,sigle,type_organisme,site_internet,hierarchie,siren,url_service_public', where });
  const res = await fetch(`${url}/exports/json?${qs}`);
  if (!res.ok) throw new Error(`Annuaire: HTTP ${res.status}`);
  const rows = (await res.json()).map(({ hierarchie, ...r }) => ({
    ...r,
    site_internet: JSON.parse(r.site_internet || '[]').map(s => s.valeur?.trim()).filter(Boolean),
    enfants: JSON.parse(hierarchie || '[]').map(h => h.service),
  }));
  await writeOut(p('donnees/sources/annuaire.json'), rows);
  console.log(`  ${rows.length} services, ${new Set(rows.flatMap(r => r.site_internet)).size} sites déclarés`);
}

// Liste des opérateurs de l'État (annexe « jaune » du PLF) : statut et programme chef de file.
async function fetchOperateurs() {
  console.log('Téléchargement de la liste des opérateurs de l\'État (PLF)…');
  const res = await fetch(config.sources.operateurs);
  if (!res.ok) throw new Error(`Opérateurs: HTTP ${res.status}`);
  const text = new TextDecoder('windows-1252').decode(await res.arrayBuffer());
  const [nameCol, subCol, statusCol, progCol] = Object.keys(parseCsv(text, ';')[0]);
  const rows = parseCsv(text, ';').map(r => ({
    nom: (r[subCol] || r[nameCol]).trim(),
    categorie: r[subCol] ? r[nameCol].trim() : '',
    statut: r[statusCol].trim(),
    programme: r[progCol].match(/\b(\d{3})\s*[–-]/)?.[1] || '',
    mission: r[progCol].replace(/\s+/g, ' ').trim(),
  }));
  await writeOut(p('donnees/sources/operateurs.json'), rows);
  console.log(`  ${rows.length} opérateurs`);
}

async function fetchSources() {
  await fetchDinum();
  await fetchAnnuaire();
  await fetchOperateurs();
}

// ---------------------------------------------------------------- candidats

// Comparaison d'intitulés : casse, apostrophes et sigle final « (XXX) » ignorés.
const norm = s => (s || '').toLowerCase().replace(/[’`]/g, "'").replace(/\s*\([^)]*\)\s*$/, '').replace(/\s+/g, ' ').trim();
// Clés de rapprochement d'un intitulé entre sources : nom sans accents ni mots vides, sigle entre
// parenthèses, et chaque partie autour d'un tiret (« ADEME - Agence de la transition écologique »).
function nameKeys(name) {
  const keys = new Set();
  const add = (str, min) => {
    const k = str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ')
      .replace(/\b(l|la|le|les|de|des|du|d|et|en|pour|a|au|aux)\b/g, ' ').replace(/\s+/g, ' ').trim();
    if (k.length >= min) keys.add(k);
  };
  const acronym = s => /^[A-Z0-9&.]{3,}$/.test(s.trim());
  const sigle = name.match(/\(([^)]+)\)\s*$/)?.[1];
  const base = name.replace(/\s*\([^)]*\)\s*$/, '');
  add(base, 6);
  if (sigle && acronym(sigle)) add(sigle, 3);
  for (const part of base.split(/\s+[-–]\s+/)) if (acronym(part) || part.length > 12) add(part, 3);
  return keys;
}

const isMinistry = name => /^(ministère|premier ministre)/i.test(name);

// Index de l'annuaire : pour chaque site déclaré, le service qui le déclare (voir priorité
// ci-dessous) et sa tutelle, c'est-à-dire le plus proche ancêtre qui est un ministère.
function annuaireIndex(rows) {
  const byId = new Map(rows.map(r => [r.id, r]));
  const parent = new Map();
  for (const r of rows) for (const child of r.enfants) parent.set(child, r.id);
  const ancestors = id => {
    const chain = [];
    while (parent.has(id) && chain.length < 20) chain.push(id = parent.get(id));
    return chain;
  };
  // Intitulés portés par plusieurs services (« Secrétariat général »…) : on précise la tutelle.
  const homonyms = new Map();
  for (const r of rows) homonyms.set(norm(r.nom), (homonyms.get(norm(r.nom)) || 0) + 1);
  // Priorité au service qui déclare la racine du site (et non une sous-page), puis au plus haut
  // placé, puis au siège plutôt qu'à une antenne (« Arcom - Nouvelle-Calédonie »).
  const rankOf = (r, url = '') => [/^https?:\/\/[^/]+\/?$/i.test(url) ? 0 : 1, ancestors(r.id).length, / - /.test(r.nom) ? 1 : 0];
  const better = (rank, prev) => !prev || rank.reduce((acc, v, i) => acc || Math.sign(v - prev.rank[i]), 0) < 0;

  const info = r => {
    const tutelle = [r, ...ancestors(r.id).map(id => byId.get(id))].find(x => x && isMinistry(x.nom));
    const t = tutelle && tutelle.id !== r.id ? tutelle.nom : '';
    return {
      organisme: homonyms.get(norm(r.nom)) > 1 && t ? `${r.nom} (${t})` : r.nom,
      typeOrganisme: r.type_organisme || '',
      tutelle: t,
      urlAnnuaire: r.url_service_public || '',
      siren: r.siren || '',
    };
  };

  const sites = new Map(), bySiren = new Map();
  for (const r of rows) {
    for (const url of r.site_internet) {
      const host = hostOf(url);
      if (!host || !host.includes('.')) continue;
      const key = siteKey(host), rank = rankOf(r, url);
      if (better(rank, sites.get(key))) sites.set(key, { host, record: r, rank });
    }
    const rank = rankOf(r);
    if (r.siren && better(rank, bySiren.get(r.siren))) bySiren.set(r.siren, { record: r, rank });
  }
  return {
    sites: [...sites.entries()].map(([key, { host, record }]) => ({
      key, url: `https://${host}`, ...info(record), source: 'Annuaire de l\'administration',
    })),
    site: key => { const s = sites.get(key); return s && info(s.record); },
    siren: siren => { const s = bySiren.get(siren); return s && info(s.record); },
  };
}

// Domaines absents de la carte : sites des services nationaux de l'annuaire (tous domaines)
// et *.gouv.fr de la liste DINUM qui répondent (d'après la DINUM).
function selectCandidates(elements, dinumRows, annuaireRows) {
  const { suffix, includeSubdomains, excludePatterns } = config.candidates;
  const excludes = excludePatterns.map(re => new RegExp(re, 'i'));
  const known = new Set(elements.filter(e => isUrl(e.label)).map(e => siteKey(hostOf(e.label))));
  const answered = s => /^([23]\d\d|401|403)\b/.test(s || '');
  const candidates = new Map();

  for (const c of annuaireIndex(annuaireRows).sites) {
    if (known.has(c.key) || excludes.some(re => re.test(c.key))) continue;
    candidates.set(c.key, c);
  }

  const dinum = new Map();
  for (const r of dinumRows) {
    const key = siteKey(r.name);
    if (!key || known.has(key)) continue;
    if (!includeSubdomains && key !== registrable(key, suffix)) continue;
    if (excludes.some(re => re.test(key))) continue;
    if (!answered(r.http_status) && !answered(r.https_status)) continue;
    const prev = dinum.get(key);
    // On préfère l'entrée « www. » si elle répond en HTTPS.
    if (!prev || (answered(r.https_status) && !answered(prev.https_status))) dinum.set(key, r);
  }
  for (const [key, r] of dinum) {
    const fromAnnuaire = candidates.get(key);
    if (fromAnnuaire) { fromAnnuaire.source += ' + DINUM'; continue; }
    candidates.set(key, {
      key,
      url: `${answered(r.https_status) ? 'https' : 'http'}://${r.name}`,
      siren: r.SIREN || '',
      source: `DINUM (${r.sources})`,
    });
  }
  return [...candidates.values()].sort((a, b) => a.key.localeCompare(b.key));
}

// --------------------------------------------------------------------- check

async function check() {
  const elements = await readJson(p('donnees/kumu/elements.json'));
  const only = args.only;
  let targets = [];
  if (only === 'unknown') {
    // Revérifie seulement les URLs restées indéterminées au dernier passage.
    targets = (await readJson(p('donnees/checks/latest.json'))).filter(r => r.statut === 'Indéterminé')
      .map(({ statut, code, finalUrl, error, checkedAt, ...t }) => t);
  } else if (only !== 'candidates') {
    const urls = [...new Set(elements.filter(e => isUrl(e.label)).map(e => e.label.trim()))];
    targets.push(...urls.map(url => ({ url, kind: 'map' })));
  }
  if (only !== 'map' && only !== 'unknown') {
    const dinum = await readJson(p('donnees/sources/dinum-gouvfr.json'));
    const annuaire = await readJson(p('donnees/sources/annuaire.json'));
    targets.push(...selectCandidates(elements, dinum, annuaire).map(c => ({ ...c, kind: 'candidate' })));
  }
  if (args.limit) targets = targets.slice(0, Number(args.limit));

  const { concurrency, timeoutMs, userAgent, perIp, perIpGapMs } = config.check;
  const opts = { timeoutMs, userAgent, perIp, perIpGapMs };
  console.log(`Vérification de ${targets.length} URLs (${concurrency} en parallèle)…`);
  const progress = (d, n) => { if (d % 50 === 0 || d === n) process.stdout.write(`\r  ${d}/${n}`); };
  const results = await pool(targets, concurrency, async t => ({ ...t, ...(await checkUrl(t.url, opts)) }), progress);

  // Second passage, plus lent, pour écarter les échecs transitoires.
  const failed = results.map((r, i) => [r, i]).filter(([r]) => r.statut === 'Hors ligne' || r.statut === 'Indéterminé');
  if (failed.length) {
    console.log(`\n  Nouvel essai pour ${failed.length} URLs en échec…`);
    await pool(failed, Math.max(1, Math.floor(concurrency / 2)), async ([r, i]) => {
      const again = await checkUrl(r.url, { ...opts, timeoutMs: timeoutMs * 2 });
      if (again.statut !== 'Hors ligne') results[i] = { ...r, ...again };
    }, progress);
  }
  console.log();
  const count = s => results.filter(r => r.statut === s).length;
  console.log(`  En ligne ${count('En ligne')} · Redirigé ${count('Redirigé')} · Hors ligne ${count('Hors ligne')} · Indéterminé ${count('Indéterminé')}`);

  // Vérification partielle : on conserve les résultats précédents de l'autre partie.
  let all = results;
  if (only && existsSync(p('donnees/checks/latest.json'))) {
    const redone = new Set(results.map(r => `${r.kind} ${r.url}`));
    const keep = r => only === 'unknown' ? !redone.has(`${r.kind} ${r.url}`) : r.kind !== (only === 'map' ? 'map' : 'candidate');
    all = [...(await readJson(p('donnees/checks/latest.json'))).filter(keep), ...results];
  }
  await writeOut(p(`donnees/checks/${today}.json`), all);
  await writeOut(p('donnees/checks/latest.json'), all);
}

// --------------------------------------------------------------------- build

async function build() {
  const elements = await readJson(p('donnees/kumu/elements.json'));
  const connections = await readJson(p('donnees/kumu/connections.json'));
  const checks = await readJson(p('donnees/checks/latest.json'));
  const readConfigCsv = async name => existsSync(p('config', name)) ? parseConfigCsv(await readFile(p('config', name), 'utf8')) : [];
  const links = await readConfigCsv('rattachements.csv');
  const renames = new Map((await readConfigCsv('correspondances-2019.csv')).map(r => [norm(r.ancien), r.actuel.trim()]));
  const ann = annuaireIndex(existsSync(p('donnees/sources/annuaire.json')) ? await readJson(p('donnees/sources/annuaire.json')) : []);

  const byUrl = new Map(checks.filter(c => c.kind === 'map').map(c => [c.url, c]));
  const checkedOn = checks[0]?.checkedAt?.slice(0, 10) || today;
  const verif = c => ({
    'Statut': c.statut,
    'Code HTTP': c.code ?? '',
    'URL finale': c.finalUrl || '',
    'Erreur': c.error || '',
    'Vérifié le': c.checkedAt.slice(0, 10),
  });

  // 1. Éléments de la V1 : administrations renommées selon leur intitulé actuel, sites avec leur
  //    statut et un éventuel changement de type.
  const v2Elements = [], byLabel = new Map(), labelById = new Map(), renamed = [];
  const changes = { archived: [], revived: [], redirected: [], unknown: [] };
  for (const e of elements) {
    const { id, label: v1Label, 'element type': type, tags, ...rest } = e;
    const label = !isUrl(v1Label) && renames.get(norm(v1Label)) || v1Label;
    labelById.set(id, label);
    if (label !== v1Label) renamed.push([v1Label, label]);
    const merged = byLabel.get(label);
    if (merged) { merged['Intitulé 2019'] += ` ; ${v1Label}`; continue; } // ex. DINSIC et Etalab -> DINUM
    const el = { label, type: type || '', tags: tags || [], ...rest, ...(label !== v1Label && { 'Intitulé 2019': v1Label }) };
    v2Elements.push(el);
    byLabel.set(label, el);
    const c = isUrl(label) && byUrl.get(label.trim());
    if (!c) continue;
    // Un service en ligne qui redirige (authentification, portail) reste un service actif.
    const down = c.statut === 'Hors ligne' || (c.statut === 'Redirigé' && type !== 'Service web');
    let newType = type;
    if (c.statut === 'Indéterminé') {
      changes.unknown.push({ e, c }); // pas de conclusion : type inchangé
    } else if (down && type !== OFF) {
      newType = OFF;
      (c.statut === 'Redirigé' ? changes.redirected : changes.archived).push({ e, c });
    } else if (!down && type === OFF) {
      newType = 'Site web';
      changes.revived.push({ e, c });
    }
    Object.assign(el, { type: newType, ...(newType !== type && { 'Type précédent': type || '' }), ...verif(c) });
  }
  const checked = v2Elements.filter(e => e.Statut);

  // Connexions de la V1 (identifiants -> libellés), puis ajouts sans doublon.
  const v2Connections = [], connKeys = new Set();
  const connect = (from, to, type, extra = {}) => {
    const k = `${from}\u0000${to}\u0000${type}`;
    if (from === to || connKeys.has(k)) return;
    connKeys.add(k);
    v2Connections.push({ from, to, type, direction: 'undirected', ...extra });
  };
  for (const { from, to, direction, 'connection type': type, id, ...rest } of connections) {
    connect(labelById.get(from), labelById.get(to), type || '', { direction, ...rest });
  }
  const v1ConnectionCount = v2Connections.length;

  // Administrations : un intitulé déjà présent (V1 ou renommé) est réutilisé, sinon on le crée.
  const labelByNorm = new Map(v2Elements.filter(e => !isUrl(e.label)).map(e => [norm(e.label), e.label]));
  const newOrgs = [];
  const ensureOrg = (name, extra = {}) => {
    const existing = labelByNorm.get(norm(name));
    if (existing) return existing;
    const el = {
      label: name,
      type: 'Organization',
      tags: ['Organization', isMinistry(name) ? 'Ministère' : 'Administration publique', 'Nouveau'],
      ...extra,
      'Source': 'Annuaire de l\'administration',
      'Ajouté le': today,
    };
    newOrgs.push(el);
    labelByNorm.set(norm(name), name);
    return name;
  };
  // Rattache un site à son organisme, et l'organisme à son ministère de tutelle.
  const attach = (info, siteLabel) => {
    const org = ensureOrg(info.organisme, { 'Type d\'organisme': info.typeOrganisme, 'URL annuaire': info.urlAnnuaire, 'SIREN': info.siren });
    connect(org, siteLabel, 'Site web/Administration');
    if (info.tutelle) connect(ensureOrg(info.tutelle, { 'Type d\'organisme': 'Administration centrale (ou Ministère)' }), org, 'Administration/Administration');
  };

  // 2. Nouveaux sites (Annuaire de l'administration et liste DINUM).
  const adminByDomain = new Map(links.map(l => [siteKey(l.domaine.trim().toLowerCase()), l.administration.trim()]));
  const sites = new Map(elements.filter(e => isUrl(e.label) && e['element type'] !== OFF)
    .map(e => [siteKey(hostOf(e.label)), e.label]));
  const known = new Set(elements.filter(e => isUrl(e.label)).map(e => siteKey(hostOf(e.label))));
  const additions = [], warnings = [], skippedRedirects = [];
  for (const c of checks.filter(c => c.kind === 'candidate')) {
    if (c.statut === 'Redirigé') { skippedRedirects.push(c); continue; }
    if (c.statut !== 'En ligne') continue;
    const finalHost = hostOf(c.finalUrl);
    if (known.has(siteKey(finalHost))) continue;
    known.add(siteKey(finalHost));
    const label = new URL(c.finalUrl).origin;
    const isSub = c.key.endsWith('.gouv.fr') && c.key !== registrable(c.key);
    const parent = isSub ? sites.get(registrable(c.key)) : null;
    // Organisme : déclaré dans l'annuaire pour ce site, sinon retrouvé par le SIREN de la DINUM.
    const info = ann.site(c.key) || (c.siren && ann.siren(c.siren));
    const admin = adminByDomain.get(c.key);
    const tags = [isSub ? 'Sous-domaine' : 'Site web', 'Nouveau'];
    if (admin) {
      if (!labelByNorm.has(norm(admin))) warnings.push(`Rattachement de ${c.key} : « ${admin} » absente de la carte, créée.`);
      connect(ensureOrg(admin), label, 'Site web/Administration');
    } else if (info) attach(info, label);
    else if (parent) connect(parent, label, 'Site web/Sous-domaine');
    else tags.push('À rattacher');
    additions.push({
      label,
      type: isSub ? 'Sous-domaine' : 'Site web',
      tags,
      'Organisme': info?.organisme || '',
      'Tutelle': info?.tutelle || '',
      'SIREN': info?.siren || c.siren || '',
      'Source': c.source || '',
      'Ajouté le': today,
      ...verif(c),
    });
  }
  // L'annuaire ne relie pas les établissements publics à leur ministère : on passe par la liste
  // des opérateurs de l'État (programme budgétaire chef de file -> ministère).
  const withParent = new Set(v2Connections.filter(c => c.type === 'Administration/Administration').map(c => c.to));
  const operateurs = existsSync(p('donnees/sources/operateurs.json')) ? await readJson(p('donnees/sources/operateurs.json')) : [];
  const ministryOf = new Map((await readConfigCsv('programmes-ministeres.csv')).map(r => [r.programme.trim(), r.ministere.trim()]));
  const opByKey = new Map();
  for (const op of operateurs) for (const k of nameKeys(op.nom)) opByKey.set(k, op);
  const matchedOps = new Set(), tutelleByOrg = new Map();
  for (const o of [...newOrgs]) {
    const op = [...nameKeys(o.label)].map(k => opByKey.get(k)).find(Boolean);
    if (!op) continue;
    matchedOps.add(op.nom);
    Object.assign(o, { 'Opérateur de l\'État': op.nom, 'Statut juridique': op.statut, 'Programme chef de file': op.mission });
    if (!o.tags.includes('Opérateur de l\'État')) o.tags.push('Opérateur de l\'État');
    const ministry = ministryOf.get(op.programme);
    if (!ministry) { if (op.programme) warnings.push(`Programme ${op.programme} (${op.nom}) absent de config/programmes-ministeres.csv.`); continue; }
    if (withParent.has(o.label) || isMinistry(o.label)) continue;
    connect(ensureOrg(ministry, { 'Type d\'organisme': 'Administration centrale (ou Ministère)' }), o.label, 'Administration/Administration');
    withParent.add(o.label);
    tutelleByOrg.set(o.label, ministry);
  }
  for (const a of additions) if (!a.Tutelle && tutelleByOrg.has(a.Organisme)) a.Tutelle = tutelleByOrg.get(a.Organisme);
  for (const o of newOrgs) if (!isMinistry(o.label) && !withParent.has(o.label)) o.tags.push('Tutelle à préciser');
  v2Elements.push(...newOrgs, ...additions);

  // 3. Jeu de données complet pour la carte V2.
  console.log('Génération du jeu de données V2…');
  await writeOut(p('out/kumu-v2.json'), { elements: v2Elements, connections: v2Connections });
  const cols = ['Label', 'Type', 'Tags', 'Nb liens', 'Détails', 'Statut', 'Code HTTP', 'URL finale', 'Erreur', 'Vérifié le',
    'Type précédent', 'Intitulé 2019', 'Organisme', 'Tutelle', 'Type d\'organisme', 'Opérateur de l\'État', 'Statut juridique',
    'Programme chef de file', 'URL annuaire', 'SIREN', 'Source', 'Ajouté le'];
  const header = r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k[0].toUpperCase() + k.slice(1), v]));
  await writeOut(p('out/elements.csv'), toCsv(v2Elements.map(header), cols));
  await writeOut(p('out/connections.csv'), toCsv(v2Connections.map(header), ['From', 'To', 'Type', 'Direction']));
  const orphans = additions.filter(a => a.tags.includes('À rattacher'));
  await writeOut(p('out/a-rattacher.csv'), toCsv(
    orphans.map(a => ({ domaine: siteKey(hostOf(a.label)), source: a.Source })), ['domaine', 'source']));

  // 4. Graphe : GEXF (Gephi, Gephi Lite, Retina) et page web sigma.js.
  console.log('Calcul du placement du graphe…');
  const graph = buildGraph({ elements: v2Elements, connections: v2Connections });
  await writeOut(p('out/sites-gouv-fr-v2.gexf'), toGexf(graph));
  const meta = {
    date: today,
    verifie: checkedOn,
    elements: v2Elements.length,
    connexions: v2Connections.length,
    nouveaux: additions.length + newOrgs.length,
  };
  await writeOut(p('out/web/graph.json'), JSON.stringify(toWebData(graph, meta)));
  // Domaine personnalisé de GitHub Pages.
  if (config.site?.domain) await writeOut(p('out/web/CNAME'), config.site.domain + '\n');
  const page = await readFile(p('web/carte.html'), 'utf8');
  await writeOut(p('out/web/index.html'), `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
</head>
<body>
${page}
</body>
</html>
`);

  // 5. Rapport.
  const cell = s => String(s ?? '').replace(/\|/g, '\\|');
  const line = ({ e, c }) => `| ${e.label} | ${e['element type']} | ${cell(c.code ?? c.error)} | ${c.finalUrl || ''} |`;
  const table = (title, rows) => rows.length
    ? `\n## ${title} (${rows.length})\n\n| URL | Type V1 | Code / erreur | URL finale |\n|---|---|---|---|\n${rows.map(line).join('\n')}\n`
    : `\n## ${title} (0)\n`;
  const count = s => checked.filter(u => u.Statut === s).length;
  const fromSource = s => additions.filter(a => a.Source.includes(s)).length;
  const ministries = newOrgs.filter(o => isMinistry(o.label));
  const addLine = a => `| ${a.label} | ${cell(a.Organisme)} | ${cell(a.Tutelle)} | ${a.Source.replace(/ \(.*\)/, '')} |`;
  const report = `# Carte Kumu des sites web publics — V2 (${today})

Carte V1 : https://kumu.io/${config.kumu.project}#${config.kumu.map}
Vérifications HTTP du ${checkedOn}.

## Synthèse

- V1 : **${elements.length}** éléments, **${connections.length}** connexions
- URLs de la V1 vérifiées : **${checked.length}** (en ligne ${count('En ligne')}, redirigées ${count('Redirigé')}, hors ligne ${count('Hors ligne')}, indéterminées ${count('Indéterminé')})
- Passent en « ${OFF} » : **${changes.archived.length + changes.redirected.length}** (${changes.archived.length} inaccessibles, ${changes.redirected.length} redirigées vers un autre site)
- Réactivés (« ${OFF} » → « Site web ») : **${changes.revived.length}**
- Administrations de la V1 renommées selon l'intitulé actuel : **${renamed.length}**
- Nouveaux sites : **${additions.length}** (annuaire ${fromSource('Annuaire')}, DINUM ${fromSource('DINUM')}), dont **${orphans.length}** sans rattachement
- Nouvelles administrations (annuaire) : **${newOrgs.length}**, dont ${ministries.length} ministères et ${newOrgs.filter(o => o.tags.includes('Tutelle à préciser')).length} sans ministère de tutelle connu
- Opérateurs de l'État (PLF) reconnus : **${matchedOps.size}** sur ${operateurs.length} ; ${tutelleByOrg.size} administrations rattachées à leur ministère grâce au programme budgétaire
- V2 : **${v2Elements.length}** éléments, **${v2Connections.length}** connexions (${v2Connections.length - v1ConnectionCount} nouvelles)
${warnings.length ? `\n### Avertissements\n\n${warnings.map(w => `- ${w}`).join('\n')}\n` : ''}
## Administrations renommées (${renamed.length})

| Intitulé 2019 | Intitulé actuel |
|---|---|
${renamed.map(([a, b]) => `| ${a} | ${b} |`).join('\n')}

## Nouveaux ministères (${ministries.length})

${ministries.map(o => `- ${o.label}`).join('\n')}
${table('Sites devenus inaccessibles', changes.archived)}${table('Sites redirigés vers un autre site', changes.redirected)}${table('Sites archivés de nouveau en ligne', changes.revived)}${table('Statut indéterminé — type inchangé, à revérifier', changes.unknown)}
## Nouveaux sites (${additions.length})

| URL | Organisme | Tutelle | Source |
|---|---|---|---|
${additions.map(addLine).join('\n')}

## Candidats écartés car redirigés vers un autre site (${skippedRedirects.length})

${skippedRedirects.map(c => `- ${c.url} → ${c.finalUrl}`).join('\n')}
`;
  await writeOut(p('out/rapport.md'), report);
  console.log(`  ${v2Elements.length} éléments (${newOrgs.length} administrations et ${additions.length} sites nouveaux), ${v2Connections.length} connexions`);
}

// ---------------------------------------------------------------------- main

const steps = { 'fetch-kumu': fetchKumu, 'fetch-sources': fetchSources, check, build };
const cmd = process.argv[2];
try {
  if (cmd === 'all') for (const step of Object.values(steps)) await step();
  else if (steps[cmd]) await steps[cmd]();
  else {
    console.log(`Usage : node src/cli.mjs <${[...Object.keys(steps), 'all'].join('|')}> [--limit=N] [--only=map|candidates|unknown]`);
    process.exitCode = 1;
  }
} catch (e) {
  console.error(`Erreur : ${e.message}`);
  process.exitCode = 1;
}
