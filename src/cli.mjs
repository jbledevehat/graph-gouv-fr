#!/usr/bin/env node
// Mise à jour de la cartographie Kumu des sites web en gouv.fr.
//
//   node src/cli.mjs fetch-kumu      instantané de la carte Kumu publique (V1)   -> donnees/kumu/
//   node src/cli.mjs fetch-sources   DINUM, Annuaire de l'administration, opérateurs -> donnees/sources/
//   node src/cli.mjs fetch-hierarchie hiérarchie de l'annuaire (fil d'Ariane)       -> donnees/annuaire/
//   node src/cli.mjs fetch-subdomains sous-domaines hors gouv.fr (crt.sh)         -> donnees/sources/
//   node src/cli.mjs check           vérifie les URLs (carte + candidats)         -> donnees/checks/
//   node src/cli.mjs build           jeu de données complet V2 + rapport          -> out/
//   node src/cli.mjs fetch-marques   bloc-marque DSFR des sites sans ministère      -> donnees/checks/
//   node src/cli.mjs all             enchaîne toutes les étapes (build, blocs-marques, build)
//
// Options : --limit=N (limite le nombre d'URLs vérifiées, pour tester)
//           --only=map|candidates|unknown|new (ne vérifie qu'une partie, le reste est repris du
//           dernier passage ; « unknown » = URLs restées indéterminées, « new » = candidats jamais vérifiés)
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCsv, parseConfigCsv, toCsv } from './lib/csv.mjs';
import { checkUrl, fetchMarque, pool } from './lib/http.mjs';
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

// Résultats de vérification : un objet par ligne (fichier compact, différences lisibles dans Git).
const checksJson = rows => '[\n' + rows.map(r => JSON.stringify(r)).join(',\n') + '\n]\n';

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

// Téléchargement avec trois essais (les serveurs sources sont parfois lents à répondre).
async function download(url, label) {
  let last;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(120000), headers: { 'user-agent': config.check.userAgent } });
      if (res.ok) return res;
      last = new Error(`${label}: HTTP ${res.status}`);
    } catch (e) {
      last = new Error(`${label}: ${e.cause?.code || e.cause?.message || e.message}`);
    }
    if (attempt < 3) await new Promise(r => setTimeout(r, 5000 * attempt));
  }
  throw last;
}

async function fetchDinum() {
  console.log('Téléchargement de la liste DINUM des noms de domaine publics…');
  const res = await download(config.sources.dinum, 'DINUM');
  const text = await res.text();
  await writeOut(p('donnees/sources/dinum-domains.csv'), text);
  const all = parseCsv(text);
  await writeOut(p('donnees/sources/dinum.json'), all);
  console.log(`  ${all.length} domaines, dont ${all.filter(r => r.name.endsWith('.' + config.candidates.suffix)).length} en ${config.candidates.suffix}`);
}

// Services nationaux (catégorie « SI ») de l'Annuaire de l'administration ayant un site internet.
async function fetchAnnuaire() {
  console.log('Téléchargement de l\'Annuaire de l\'administration (services nationaux)…');
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
  await writeOut(p('donnees/sources/annuaire.json'), rows);
  console.log(`  ${rows.length} services, ${new Set(rows.flatMap(r => r.site_internet)).size} sites déclarés`);
}

// Liste des opérateurs de l'État (annexe « jaune » du PLF) : statut et programme chef de file.
async function fetchOperateurs() {
  console.log('Téléchargement de la liste des opérateurs de l\'État (PLF)…');
  const res = await download(config.sources.operateurs, 'Opérateurs');
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

// Noms des départements et régions (geo.api.gouv.fr) : sites de préfecture <territoire>.gouv.fr.
async function fetchTerritoires() {
  console.log('Téléchargement des départements et régions (geo.api.gouv.fr)…');
  const [d, r] = await Promise.all(['departements', 'regions'].map(async k => (await download(`https://geo.api.gouv.fr/${k}?fields=nom`, k)).json()));
  const names = [...d, ...r].map(x => x.nom);
  await writeOut(p('donnees/sources/territoires.json'), names);
  console.log(`  ${names.length} territoires`);
}

async function fetchSources() {
  // La liste DINUM ne sert qu'à trouver de nouveaux candidats : son absence n'empêche pas la carte.
  try { await fetchDinum(); } catch (e) { console.warn(`  Avertissement : ${e.message} (liste DINUM ignorée)`); }
  await fetchAnnuaire();
  await fetchOperateurs();
  try { await fetchTerritoires(); } catch (e) { console.warn(`  Avertissement : ${e.message} (règle des préfectures limitée à la V1)`); }
}

// ------------------------------------------------------- fetch-hierarchie

// Hiérarchie de l'Annuaire de l'administration telle que le site la présente (fil d'Ariane de
// chaque fiche : Ministères > Ministère… > Direction… > service), plus complète que le champ
// « hierarchie » de l'API. Une page par seconde ; cache versionné dans donnees/annuaire/.
export function parseBreadcrumb(html) {
  const list = html.match(/<ol class="fr-breadcrumb__list">([\s\S]*?)<\/ol>/)?.[1];
  if (!list) return null;
  const decode = t => t.replace(/<[^>]+>/g, '').replace(/&#39;|&rsquo;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  const items = [...list.matchAll(/<li>([\s\S]*?)<\/li>/g)].map(m => {
    const href = m[1].match(/href="([^"]+)"/)?.[1] || '';
    return { nom: decode(m[1]), id: href.match(/\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/)?.[1] || null };
  });
  // Accueil > Annuaire > Section > [parents…] > fiche
  return { section: items[2]?.nom || '', parents: items.slice(3, -1).filter(i => i.id) };
}

async function fetchHierarchie() {
  const rows = await readJson(p('donnees/sources/annuaire.json'));
  const file = p('donnees/annuaire/hierarchie.json');
  const cache = existsSync(file) ? await readJson(file) : {};
  const maxAge = (config.sources.annuaire.hierarchieMaxAgeDays || 90) * 864e5;
  const todo = rows.filter(r => r.url_service_public && !(cache[r.id] && Date.now() - Date.parse(cache[r.id].lu) < maxAge));
  console.log(`Hiérarchie de l'annuaire : ${rows.length} fiches, ${todo.length} à lire (une par seconde)…`);
  const started = Date.now();
  let done = 0, failed = 0;
  for (const r of todo) {
    try {
      const res = await download(r.url_service_public, 'Annuaire');
      const bc = parseBreadcrumb(await res.text());
      if (bc) cache[r.id] = { ...bc, lu: new Date().toISOString() };
      else failed++;
    } catch { failed++; }
    if (++done % 100 === 0 || done === todo.length) {
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, JSON.stringify(cache, null, 1) + '\n');
      const left = Math.round((Date.now() - started) / done * (todo.length - done) / 60000);
      process.stdout.write(`\r  ${done}/${todo.length}`);
      await writeFile(p('out/progression.txt'), `${new Date().toLocaleTimeString('fr-FR')} : ${done}/${todo.length} fiches lues, environ ${left} min restantes\n`).catch(() => {});
    }
    await new Promise(res => setTimeout(res, 1000));
  }
  await writeOut(file, JSON.stringify(cache, null, 1) + '\n');
  console.log(`\n  ${Object.keys(cache).length} fiches en cache${failed ? `, ${failed} illisibles` : ''}`);
}

// --------------------------------------------------------- fetch-subdomains

// Sous-domaines des domaines hors gouv.fr de la carte, lus dans les journaux de certificats
// (base PostgreSQL publique de crt.sh, comme le script import-from-ct-logs.py de la DINUM, qui
// ne couvre que gouv.fr). Résultats mis en cache dans donnees/sources/crtsh.json.
async function fetchSubdomains() {
  const { default: pg } = await import('pg');
  const elements = await readJson(p('donnees/kumu/elements.json'));
  const annuaire = existsSync(p('donnees/sources/annuaire.json')) ? await readJson(p('donnees/sources/annuaire.json')) : [];
  const suffix = '.' + config.candidates.suffix;
  const keys = new Set([
    ...elements.filter(e => isUrl(e.label)).map(e => siteKey(hostOf(e.label))),
    ...annuaireIndex(annuaire).sites.map(s => s.key),
  ].filter(k => k && !k.endsWith(suffix)));
  // Inutile d'interroger un domaine dont un parent est déjà interrogé.
  const hasQueriedParent = k => k.split('.').some((_, i, parts) => i > 0 && i < parts.length - 1 && keys.has(parts.slice(i).join('.')));
  const domains = [...keys].filter(k => !hasQueriedParent(k)).sort();

  const cacheFile = p('donnees/sources/crtsh.json');
  const cache = existsSync(cacheFile) ? await readJson(cacheFile) : {};
  const fresh = d => cache[d] && Date.now() - Date.parse(cache[d].fetchedAt) < config.subdomains.maxAgeDays * 864e5;
  const todo = domains.filter(d => !fresh(d));
  console.log(`Journaux de certificats (crt.sh) : ${domains.length} domaines hors ${config.candidates.suffix}, ${todo.length} à interroger…`);

  let client = null;
  const connect = async () => {
    client = new pg.Client({ ...config.subdomains.crtsh, port: 5432, query_timeout: 300000 });
    client.on('error', () => {});
    await client.connect();
  };
  const query = d => client.query(`SELECT DISTINCT lower(a.name) AS name
      FROM certificate, LATERAL (SELECT * FROM x509_altnames(certificate)) a(name)
     WHERE plainto_tsquery($1) @@ identities(certificate)
       AND COALESCE(x509_notafter(certificate), 'infinity') > now() - interval '1 year'`, [d]);
  let done = 0, failed = 0;
  for (const d of todo) {
    let rows = null;
    for (let attempt = 1; attempt <= 2 && !rows; attempt++) {
      try {
        if (!client) await connect();
        rows = (await query(d)).rows;
      } catch (e) {
        await client?.end().catch(() => {});
        client = null;
        if (attempt === 2) { failed++; console.warn(`\n  ${d} : ${e.message}`); }
        else await new Promise(r => setTimeout(r, 10000));
      }
    }
    if (rows) {
      const names = [...new Set(rows.map(r => r.name.replace(/^\*\./, '')).filter(n => n.endsWith('.' + d)))].sort();
      cache[d] = { fetchedAt: new Date().toISOString(), names };
    }
    if (++done % 10 === 0 || done === todo.length) {
      process.stdout.write(`\r  ${done}/${todo.length}`);
      await writeFile(cacheFile, JSON.stringify(cache));
    }
  }
  await client?.end().catch(() => {});
  await writeOut(cacheFile, cache);
  const total = domains.reduce((n, d) => n + (cache[d]?.names.length || 0), 0);
  console.log(`\n  ${total} sous-domaines connus${failed ? `, ${failed} domaines en échec (relancer plus tard)` : ''}`);
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

// Index de l'annuaire. Pour chaque service, sa tutelle ministérielle :
// 1. le plus proche ancêtre ministériel dans la hiérarchie de l'annuaire ;
// 2. à défaut, le ministère majoritaire parmi les services installés à la même adresse.
// Pour chaque site déclaré : le service retenu (voir priorité ci-dessous) et la tutelle
// majoritaire parmi tous les services qui le déclarent. Un site déclaré par plusieurs services
// d'un même ministère (ex. info.gouv.fr) est rattaché directement à ce ministère.
function annuaireIndex(rows, hier = {}) {
  const byId = new Map(rows.map(r => [r.id, r]));
  // Parents : fil d'Ariane du site de l'annuaire en priorité (donnees/annuaire/hierarchie.json),
  // à défaut le champ « hierarchie » de l'API.
  const parent = new Map(), nameOf = new Map(rows.map(r => [r.id, r.nom])), sectionOf = new Map();
  for (const r of rows) for (const child of r.enfants) parent.set(child, r.id);
  for (const [id, h] of Object.entries(hier)) {
    h.parents.forEach((p, k) => {
      nameOf.set(p.id, nameOf.get(p.id) || p.nom);
      sectionOf.set(p.id, sectionOf.get(p.id) || h.section);
      if (hier[p.id]) return; // fiche lue elle-même : son propre fil d'Ariane fait foi
      if (k > 0) parent.set(p.id, h.parents[k - 1].id); else parent.delete(p.id);
    });
    sectionOf.set(id, h.section);
    const last = h.parents.at(-1);
    if (last) parent.set(id, last.id); else parent.delete(id);
  }
  const ancestors = id => {
    const chain = [];
    while (parent.has(id) && chain.length < 20) chain.push(id = parent.get(id));
    return chain;
  };
  const ministryByHierarchy = r => {
    const top = ancestors(r.id).at(-1);
    if (top && isMinistry(nameOf.get(top) || '')) return { id: top, nom: nameOf.get(top) };
    return isMinistry(r.nom) ? r : null;
  };

  // Tutelle déduite de l'adresse (seulement sans fil d'Ariane) : au moins 2 services rattachés,
  // dont 60 % au même ministère.
  const byAddress = new Map();
  for (const r of rows) {
    const m = ministryByHierarchy(r);
    if (!m || !r.adresse || !/^\d/.test(r.adresse)) continue;
    if (!byAddress.has(r.adresse)) byAddress.set(r.adresse, new Map());
    const votes = byAddress.get(r.adresse);
    votes.set(m.nom, (votes.get(m.nom) || 0) + 1);
  }
  const ministryByAddress = r => {
    const votes = byAddress.get(r.adresse);
    if (!votes) return null;
    const total = [...votes.values()].reduce((a, b) => a + b, 0);
    const [name, n] = [...votes].sort((a, b) => b[1] - a[1])[0];
    return total >= 2 && n / total >= 0.6 ? name : null;
  };
  const tutelleOf = r => {
    const m = ministryByHierarchy(r);
    if (m) return { name: m.id === r.id ? '' : m.nom, via: hier[r.id] ? 'annuaire (fil d\'Ariane)' : 'hiérarchie' };
    if (hier[r.id]) return { name: '', via: 'annuaire (fil d\'Ariane)' };
    const a = ministryByAddress(r);
    return a ? { name: a, via: 'adresse' } : { name: '', via: '' };
  };

  // Intitulés portés par plusieurs services (« Secrétariat général »…) : on précise la tutelle.
  const homonyms = new Map();
  for (const nom of nameOf.values()) homonyms.set(norm(nom), (homonyms.get(norm(nom)) || 0) + 1);
  const labelOf = (id, ministry) => {
    const nom = nameOf.get(id) || byId.get(id)?.nom || '';
    return homonyms.get(norm(nom)) > 1 && ministry && norm(ministry) !== norm(nom) ? `${nom} (${ministry})` : nom;
  };
  const MEAE = 'Ministère de l\'Europe et des Affaires étrangères';
  // Priorité au service qui déclare la racine du site (et non une sous-page), puis au plus haut
  // placé, puis au siège plutôt qu'à une antenne (« Arcom - Nouvelle-Calédonie »).
  // Affinité : le libellé du domaine (« inrae » pour inrae.fr) figure dans le sigle ou le nom du service.
  const flat = s => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  // Initiales des mots significatifs : « Office français de la biodiversité » -> « ofb ».
  const initials = nom => nom.replace(/\([^)]*\)/g, ' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .split(/[^a-z0-9]+/).filter(w => w && !/^(de|la|le|les|des|du|d|l|et|en|pour|a|au|aux|sur)$/.test(w)).map(w => w[0]).join('');
  const affinity = (r, url) => {
    const label = flat((hostOf(url) || '').replace(/^www\./, '').split('.')[0]);
    if (label.length < 3) return 1;
    const sigle = flat(r.sigle || r.nom.match(/\(([^)]+)\)\s*$/)?.[1]);
    return sigle === label || initials(r.nom) === label || flat(r.nom).includes(label) ? 0 : 1;
  };
  // Propriétaire manifeste : sigle ou initiales identiques au domaine (ofb.gouv.fr -> OFB).
  const owns = (r, host) => {
    const label = flat(host.replace(/^www\./, '').split('.')[0]);
    const sigle = flat(r.sigle || r.nom.match(/\(([^)]+)\)\s*$/)?.[1]);
    return label.length >= 3 && (sigle === label || initials(r.nom) === label);
  };
  const rankOf = (r, url = '') => [/^https?:\/\/[^/]+\/?$/i.test(url) ? 0 : 1, affinity(r, url), ancestors(r.id).length, / - /.test(r.nom) ? 1 : 0];
  const better = (rank, prev) => !prev || rank.reduce((acc, v, i) => acc || Math.sign(v - prev.rank[i]), 0) < 0;

  // Chaîne de rattachement, du ministère (ou de la section) jusqu'au parent direct du service.
  const info = r => {
    const t = tutelleOf(r);
    const section = sectionOf.get(r.id) || '';
    const chain = ancestors(r.id).reverse().map(id => labelOf(id, t.name));
    // Les ambassades relèvent du ministère de l'Europe et des Affaires étrangères.
    if (/ambassade/i.test(section) && norm(chain[0] || '') !== norm(MEAE)) chain.unshift(MEAE);
    return {
      organisme: labelOf(r.id, t.name),
      chain,
      section,
      typeOrganisme: r.type_organisme || '',
      tutelle: t.name || (/ambassade/i.test(section) ? MEAE : ''),
      tutelleVia: t.via,
      urlAnnuaire: r.url_service_public || '',
      siren: r.siren || '',
    };
  };

  const sites = new Map(), declarers = new Map(), bySiren = new Map();
  for (const r of rows) {
    for (const url of r.site_internet) {
      const host = hostOf(url);
      if (!host || !host.includes('.')) continue;
      const key = siteKey(host), rank = rankOf(r, url);
      if (better(rank, sites.get(key))) sites.set(key, { host, record: r, rank });
      if (!declarers.has(key)) declarers.set(key, new Set());
      declarers.get(key).add(r);
    }
    const rank = rankOf(r);
    if (r.siren && better(rank, bySiren.get(r.siren))) bySiren.set(r.siren, { record: r, rank });
  }
  const siteInfo = key => {
    const s = sites.get(key);
    if (!s) return null;
    const base = info(s.record);
    const all = [...declarers.get(key)];
    // Le déclarant retenu est manifestement le propriétaire du site (sigle, initiales ou nom) :
    // le site lui est rattaché, sans passer par le vote des autres services déclarants.
    if (all.length < 2 || owns(s.record, s.host)) return base;
    // Tutelle majoritaire parmi les services qui déclarent ce site.
    const votes = new Map();
    for (const r of all) {
      const t = tutelleOf(r).name || (isMinistry(r.nom) ? r.nom : '');
      if (t) votes.set(t, (votes.get(t) || 0) + 1);
    }
    const [top, n] = [...votes].sort((a, b) => b[1] - a[1])[0] || [];
    if (!top || n / all.length < 0.5) return base;
    // Site commun à plusieurs services d'un ministère : rattaché au ministère lui-même.
    if (n >= 3) return { ...base, organisme: top, chain: [], typeOrganisme: 'Administration centrale (ou Ministère)', tutelle: '', tutelleVia: 'déclaré par ' + n + ' services', urlAnnuaire: '' };
    return base.tutelle ? base : { ...base, tutelle: top, tutelleVia: 'services déclarants' };
  };
  return {
    sites: [...sites.entries()].map(([key, { host }]) => ({
      key, url: `https://${host}`, ...siteInfo(key), source: 'Annuaire de l\'administration',
    })),
    site: siteInfo,
    siren: siren => { const s = bySiren.get(siren); return s && info(s.record); },
  };
}

// Domaines absents de la carte :
// - sites des services nationaux de l'annuaire (tous domaines) ;
// - domaines *.gouv.fr de la liste DINUM qui répondent (d'après la DINUM) ;
// - sous-domaines d'un site de la carte ou d'un de ces nouveaux sites : liste DINUM (tous domaines,
//   s'ils répondent d'après elle) et journaux de certificats (crt.sh, filtrés ensuite par le DNS).
function selectCandidates(elements, dinumRows, annuaireRows, crtsh) {
  const { suffix, includeSubdomains, excludePatterns } = config.candidates;
  const excludes = excludePatterns.map(re => new RegExp(re, 'i'));
  const excludedDomains = new Set(config.candidates.excludeDomains || []);
  const excluded = key => excludes.some(re => re.test(key)) || key.split('.').some((_, i, parts) => excludedDomains.has(parts.slice(i).join('.')));
  const known = new Set(elements.filter(e => isUrl(e.label)).map(e => siteKey(hostOf(e.label))));
  const answered = s => /^([23]\d\d|401|403)\b/.test(s || '');
  const candidates = new Map();

  for (const c of annuaireIndex(annuaireRows).sites) {
    if (known.has(c.key) || excluded(c.key)) continue;
    candidates.set(c.key, c);
  }

  // Une entrée par domaine ; on préfère l'entrée « www. » si elle répond en HTTPS.
  const dinum = new Map();
  for (const r of dinumRows) {
    const key = siteKey(r.name);
    if (!key || known.has(key) || excluded(key)) continue;
    if (!answered(r.http_status) && !answered(r.https_status)) continue;
    const prev = dinum.get(key);
    if (!prev || (answered(r.https_status) && !answered(prev.https_status))) dinum.set(key, r);
  }
  const dinumCandidate = (key, r) => ({
    key,
    url: `${answered(r.https_status) ? 'https' : 'http'}://${r.name}`,
    siren: r.SIREN || '',
    source: `DINUM (${r.sources})`,
  });
  for (const [key, r] of dinum) {
    if (!key.endsWith('.' + suffix) || key !== registrable(key, suffix)) continue;
    const fromAnnuaire = candidates.get(key);
    if (fromAnnuaire) fromAnnuaire.source += ' + DINUM';
    else candidates.set(key, dinumCandidate(key, r));
  }
  // Domaines de l'État typés par la DINUM (ambassades, académies, universités…), tous domaines.
  const stateTypes = config.candidates.dinumTypes || {};
  for (const [key, r] of dinum) {
    if (!(r.type in stateTypes) || candidates.has(key)) continue;
    candidates.set(key, { ...dinumCandidate(key, r), dinumType: r.type });
  }
  if (!includeSubdomains) return [...candidates.values()].sort((a, b) => a.key.localeCompare(b.key));

  // Sous-domaines : rattachés au site connu le plus proche en remontant les labels.
  const parents = new Set([...known, ...candidates.keys()]);
  const parentOf = key => {
    const labels = key.split('.');
    for (let i = 1; i < labels.length - 1; i++) {
      const up = labels.slice(i).join('.');
      if (up === suffix) break; // « gouv.fr » est un suffixe, pas un site parent
      if (parents.has(up)) return up;
    }
    return null;
  };
  const addSub = (key, make) => {
    if (!key || known.has(key) || candidates.has(key) || excluded(key)) return;
    const parentKey = parentOf(key);
    if (parentKey) candidates.set(key, { ...make(), parentKey });
    // Sous-domaine gouv.fr dont aucun parent n'est sur la carte : ajouté seul (rattachement par
    // config/rattachements.csv, l'annuaire ou le bloc-marque).
    else if (key.endsWith('.' + suffix) && key !== registrable(key, suffix)) candidates.set(key, make());
  };
  for (const [key, r] of dinum) addSub(key, () => dinumCandidate(key, r));
  for (const [domain, { names }] of Object.entries(crtsh || {})) {
    for (const name of names) {
      const key = siteKey(name);
      addSub(key, () => ({ key, url: `https://${name}`, source: `crt.sh (${domain})`, dnsCheck: true }));
    }
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
  } else if (only !== 'candidates' && only !== 'new') {
    const urls = [...new Set(elements.filter(e => isUrl(e.label)).map(e => e.label.trim()))];
    targets.push(...urls.map(url => ({ url, kind: 'map' })));
  }
  if (only !== 'map' && only !== 'unknown') {
    const previous = only === 'new' && existsSync(p('donnees/checks/latest.json'))
      ? new Set((await readJson(p('donnees/checks/latest.json'))).filter(r => r.kind === 'candidate').map(r => r.key)) : null;
    const dinumFile = p('donnees/sources/dinum.json'), crtFile = p('donnees/sources/crtsh.json');
    if (!existsSync(dinumFile)) console.warn('  Avertissement : liste DINUM absente, seuls les candidats de l\'annuaire sont vérifiés.');
    const dinum = existsSync(dinumFile) ? await readJson(dinumFile) : [];
    const crtsh = existsSync(crtFile) ? await readJson(crtFile) : {};
    const annuaire = await readJson(p('donnees/sources/annuaire.json'));
    let candidates = selectCandidates(elements, dinum, annuaire, crtsh);
    // Informations des candidats déjà vérifiés mises à jour (type DINUM, parent, source…).
    if (previous) {
      const latest = await readJson(p('donnees/checks/latest.json'));
      const byKey = new Map(candidates.map(c => [c.key, c]));
      const current = new Set(byKey.keys());
      let refreshed = 0;
      const kept = latest.filter(r => r.kind !== 'candidate' || current.has(r.key)).map(r => {
        const c = r.kind === 'candidate' && byKey.get(r.key);
        if (!c) return r;
        refreshed++;
        const { dinumType, parentKey, source, siren, ...rest } = r;
        return { ...rest, ...(c.dinumType && { dinumType: c.dinumType }), ...(c.parentKey && { parentKey: c.parentKey }), source: c.source, siren: c.siren || siren };
      });
      await writeFile(p('donnees/checks/latest.json'), checksJson(kept));
      console.log(`  ${refreshed} candidats déjà vérifiés mis à jour, ${latest.length - kept.length} retirés (hors du périmètre actuel)`);
    }
    if (previous) candidates = candidates.filter(c => !previous.has(c.key));
    // Les noms issus des certificats n'ont pas de statut connu : on écarte d'abord ceux absents du DNS.
    const toResolve = candidates.filter(c => c.dnsCheck);
    if (toResolve.length) {
      console.log(`Résolution DNS de ${toResolve.length} sous-domaines issus des certificats…`);
      const { lookup } = await import('node:dns/promises');
      const alive = new Set();
      await pool(toResolve, 64, async c => {
        const host = new URL(c.url).hostname;
        const ok = await Promise.race([lookup(host).then(() => true, () => false), new Promise(r => setTimeout(() => r(false), 10000))]);
        if (ok) alive.add(c.key);
      });
      console.log(`  ${alive.size} existent dans le DNS`);
      candidates = candidates.filter(c => !c.dnsCheck || alive.has(c.key));
    }
    targets.push(...candidates.map(({ dnsCheck, ...c }) => ({ ...c, kind: 'candidate' })));
  }
  if (args.limit) targets = targets.slice(0, Number(args.limit));

  // Ordre intercalé par domaine : les sous-domaines d'un même organisme (souvent sur un même
  // serveur, limité à une requête toutes les 2 s) ne monopolisent pas toutes les vérifications.
  const groups = new Map();
  for (const t of targets) {
    const g = t.parentKey || hostOf(t.url).split('.').slice(-2).join('.');
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(t);
  }
  const queues = [...groups.values()];
  const longest = Math.max(0, ...queues.map(q => q.length));
  targets = [];
  for (let i = 0; i < longest; i++) for (const q of queues) if (i < q.length) targets.push(q[i]);

  const { concurrency, timeoutMs, userAgent, perIp, perIpGapMs } = config.check;
  const opts = { timeoutMs, userAgent, perIp, perIpGapMs };
  console.log(`Vérification de ${targets.length} URLs (${concurrency} en parallèle)…`);
  // Avancement affiché et écrit dans out/progression.txt (lisible pendant une longue vérification).
  const started = Date.now();
  const progress = (d, n) => {
    if (d % 50 !== 0 && d !== n) return;
    process.stdout.write(`\r  ${d}/${n}`);
    const left = d ? Math.round((Date.now() - started) / d * (n - d) / 60000) : '?';
    writeFile(p('out/progression.txt'), `${new Date().toLocaleTimeString('fr-FR')} : ${d}/${n} URLs vérifiées, environ ${left} min restantes\n`).catch(() => {});
  };
  // Résultats enregistrés toutes les 500 URLs : une vérification interrompue reprend avec --only=new.
  const previousAll = existsSync(p('donnees/checks/latest.json')) ? await readJson(p('donnees/checks/latest.json')) : [];
  const partial = [];
  const checkpoint = async () => {
    const doneKeys = new Set(partial.map(r => `${r.kind} ${r.url}`));
    await writeFile(p('donnees/checks/latest.json'), checksJson([...previousAll.filter(r => !doneKeys.has(`${r.kind} ${r.url}`)), ...partial]));
  };
  const results = await pool(targets, concurrency, async t => {
    const r = { ...t, ...(await checkUrl(t.url, opts)) };
    partial.push(r);
    if (partial.length % 500 === 0) await checkpoint().catch(() => {});
    return r;
  }, progress);

  // Second passage, plus lent, pour écarter les échecs transitoires des sites déjà sur la carte
  // (un nouveau candidat qui ne répond pas n'est simplement pas ajouté ; revérifié le mois suivant).
  const failed = results.map((r, i) => [r, i]).filter(([r]) => r.kind === 'map' && (r.statut === 'Hors ligne' || r.statut === 'Indéterminé'));
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
    const keep = r => only === 'unknown' || only === 'new' ? !redone.has(`${r.kind} ${r.url}`) : r.kind !== (only === 'map' ? 'map' : 'candidate');
    all = [...(await readJson(p('donnees/checks/latest.json'))).filter(keep), ...results];
  }
  // Pas de copie datée : l'historique Git conserve chaque version.
  await writeOut(p('donnees/checks/latest.json'), checksJson(all));
}

// ------------------------------------------------------------ fetch-marques

// Bloc-marque DSFR des sites restés sans ministère (liste écrite par build). Cache versionné
// dans donnees/checks/marques.json, relu au bout de maxAgeDays.
async function fetchMarques() {
  const todoFile = p('out/marques-a-lire.json'), file = p('donnees/checks/marques.json');
  const urls = existsSync(todoFile) ? await readJson(todoFile) : [];
  const cache = existsSync(file) ? await readJson(file) : {};
  const stale = u => !cache[u] || cache[u].v !== 2 || Date.now() - Date.parse(cache[u].checkedAt) > config.subdomains.maxAgeDays * 864e5;
  const todo = urls.filter(stale);
  console.log(`Bloc-marque : ${urls.length} sites sans ministère, ${todo.length} pages à lire…`);
  const { timeoutMs, userAgent, perIp, perIpGapMs, concurrency } = config.check;
  await pool(todo, concurrency, async u => {
    const r = await fetchMarque(u, { timeoutMs, userAgent, perIp, perIpGapMs });
    cache[u] = { marque: r.marque, mentions: r.mentions || [], checkedAt: new Date().toISOString(), v: 2 };
  }, (d, n) => { if (d % 25 === 0 || d === n) process.stdout.write(`\r  ${d}/${n}`); });
  if (todo.length) console.log();
  await writeOut(file, Object.fromEntries(Object.entries(cache).sort()));
  console.log(`  ${urls.filter(u => cache[u]?.marque).length} blocs-marques lus`);
}

// Ministère désigné par un bloc-marque : « Gouvernement » ou « Premier ministre » -> Premier
// ministre ; sinon l'intitulé (actuel ou de 2019) dont les mots couvrent ceux du bloc-marque.
const STOP = new Set(['de', 'la', 'le', 'les', 'des', 'du', 'et', 'l', 'd', 'a', 'au', 'aux', 'en', 'pour', 'ministere', 'ministre', 'charge', 'chargee']);
const words = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w && !STOP.has(w));
function ministryMatcher(names) {
  const entries = names.map(([name, label]) => ({ label, w: new Set(words(name)) }));
  const pm = names.find(([, label]) => norm(label) === 'premier ministre')?.[1];
  return marque => {
    if (!marque) return null;
    if (/gouvernement|premier ministre/i.test(marque)) return pm || null;
    if (!/minist/i.test(marque)) return null;
    const t = words(marque);
    if (!t.length) return null;
    // Le bloc-marque est couvert par l'intitulé, ou l'intitulé entier figure dans le bloc-marque
    // (anciens intitulés composés : « ministère de l'Intérieur et des Outre-mer »).
    const tw = new Set(t);
    let best = null;
    for (const e of entries) {
      if (!e.w.size) continue;
      const inName = t.filter(w => e.w.has(w)).length / t.length;
      const inMarque = [...e.w].filter(w => tw.has(w)).length / e.w.size;
      const score = Math.max(inName, inMarque), tie = inName + inMarque;
      if (score >= 0.75 && (!best || score > best.score || (score === best.score && tie > best.tie))) best = { label: e.label, score, tie };
    }
    return best?.label || null;
  };
}

// --------------------------------------------------------------------- build

async function build() {
  const elements = await readJson(p('donnees/kumu/elements.json'));
  const connections = await readJson(p('donnees/kumu/connections.json'));
  const checks = await readJson(p('donnees/checks/latest.json'));
  const readConfigCsv = async name => existsSync(p('config', name)) ? parseConfigCsv(await readFile(p('config', name), 'utf8')) : [];
  const links = await readConfigCsv('rattachements.csv');
  const renames = new Map((await readConfigCsv('correspondances-2019.csv')).map(r => [norm(r.ancien), r.actuel.trim()]));
  const hier = existsSync(p('donnees/annuaire/hierarchie.json')) ? await readJson(p('donnees/annuaire/hierarchie.json')) : {};
  const ann = annuaireIndex(existsSync(p('donnees/sources/annuaire.json')) ? await readJson(p('donnees/sources/annuaire.json')) : [], hier);
  // Domaines déclarés dans l'annuaire qui redirigent vers un autre site (ex. l'ANCT déclare
  // agence-cohesion-territoires.gouv.fr, qui redirige vers anct.gouv.fr) : la fiche vaut pour le
  // site d'arrivée si son nom ou son sigle correspond à ce domaine.
  const flatTxt = t => (t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const viaRedirect = new Map();
  for (const c of checks) {
    if (c.kind !== 'candidate' || c.statut !== 'Redirigé' || !c.finalUrl) continue;
    const i = ann.site(c.key);
    if (i) viaRedirect.set(siteKey(hostOf(c.finalUrl)), i);
  }
  const annSite = key => {
    const direct = ann.site(key), red = viaRedirect.get(key);
    const label = flatTxt(key.split('.')[0]);
    const matches = i => i && label.length >= 3 && flatTxt(i.organisme).includes(label);
    // Fiche du domaine redirigé retenue si elle correspond au domaine, ou si plusieurs services
    // d'un même ministère la déclarent, face à un déclarant direct sans rapport avec le domaine.
    const strong = i => matches(i) || /^déclaré par/.test(i?.tutelleVia || '');
    if (red && strong(red) && !matches(direct)) return { ...red, tutelleVia: 'annuaire (domaine redirigé)' };
    return direct || null;
  };

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
  const v2Connections = [], connKeys = new Set(), adj = new Map();
  const neighbour = (a, b) => { if (!adj.has(a)) adj.set(a, new Set()); adj.get(a).add(b); };
  const connect = (from, to, type, extra = {}) => {
    const k = `${from}\u0000${to}\u0000${type}`;
    if (from === to || connKeys.has(k)) return;
    connKeys.add(k);
    neighbour(from, to); neighbour(to, from);
    v2Connections.push({ from, to, type, direction: 'undirected', ...extra });
  };
  // Sites de la V1 dont l'annuaire donne le rattachement (fil d'Ariane) : leurs liens de 2019 vers
  // des administrations sont remplacés par la chaîne de l'annuaire (voir plus bas).
  const inAnnuaire = label => isUrl(label) && !!annSite(siteKey(hostOf(label)))?.section;
  let reorganized = 0;
  for (const { from, to, direction, 'connection type': type, id, ...rest } of connections) {
    const a = labelById.get(from), b = labelById.get(to);
    if ((inAnnuaire(a) && !isUrl(b)) || (inAnnuaire(b) && !isUrl(a))) { reorganized++; continue; }
    connect(a, b, type || '', { direction, ...rest });
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
  // Rattache un site à son organisme et crée la chaîne de l'annuaire au-dessus de lui
  // (ministère > direction > … > organisme) ; à défaut de chaîne, relie l'organisme à sa tutelle.
  const attach = (info, siteLabel) => {
    const section = info.section ? { 'Section annuaire': info.section } : {};
    let above = null;
    for (const name of info.chain || []) {
      const lbl = ensureOrg(name, { 'Type d\'organisme': isMinistry(name) ? 'Administration centrale (ou Ministère)' : '', ...section });
      if (above) connect(above, lbl, 'Administration/Administration');
      above = lbl;
    }
    const org = ensureOrg(info.organisme, { 'Type d\'organisme': info.typeOrganisme, 'URL annuaire': info.urlAnnuaire, 'SIREN': info.siren, ...section });
    if (above) connect(above, org, 'Administration/Administration');
    else if (info.tutelle) connect(ensureOrg(info.tutelle, { 'Type d\'organisme': 'Administration centrale (ou Ministère)' }), org, 'Administration/Administration');
    connect(org, siteLabel, 'Site web/Administration');
  };

  // 2. Nouveaux sites (Annuaire de l'administration et liste DINUM).
  const adminByDomain = new Map(links.map(l => [siteKey(l.domaine.trim().toLowerCase()), l.administration.trim()]));
  const sites = new Map(elements.filter(e => isUrl(e.label) && e['element type'] !== OFF)
    .map(e => [siteKey(hostOf(e.label)), e.label]));
  const known = new Set(elements.filter(e => isUrl(e.label)).map(e => siteKey(hostOf(e.label))));
  const additions = [], warnings = [], skippedRedirects = [];
  // Sites d'abord, sous-domaines ensuite (leur parent doit déjà être connu), du plus court au plus long.
  const ordered = checks.filter(c => c.kind === 'candidate')
    .sort((a, b) => (!!a.parentKey - !!b.parentKey) || a.key.split('.').length - b.key.split('.').length || a.key.localeCompare(b.key));
  for (const c of ordered) {
    if (c.statut === 'Redirigé') { skippedRedirects.push(c); continue; }
    // Un serveur qui répond par une erreur 5xx existe : le site est ajouté, à revérifier.
    // Exception : un sous-domaine en 500, 502 ou 503 n'est pas ajouté.
    const serverError = c.statut === 'Indéterminé' && c.code >= 500;
    if (c.statut !== 'En ligne' && !serverError) continue;
    if (serverError && [500, 502, 503].includes(c.code) && (c.parentKey || c.key !== registrable(c.key))) continue;
    const finalHost = hostOf(c.finalUrl || c.url);
    if (known.has(siteKey(finalHost))) continue;
    known.add(siteKey(finalHost));
    const label = new URL(c.finalUrl || c.url).origin;
    const isSub = !!c.parentKey || (c.key.endsWith('.gouv.fr') && c.key !== registrable(c.key));
    const parentKey = c.parentKey === config.candidates.suffix ? null : c.parentKey;
    const parent = parentKey ? sites.get(parentKey) : isSub ? sites.get(registrable(c.key)) : null;
    // Organisme : déclaré dans l'annuaire pour ce site, sinon retrouvé par le SIREN de la DINUM.
    const info = annSite(c.key) || (c.siren && ann.siren(c.siren));
    // Rattachement déclaré pour ce domaine ou l'un de ses domaines parents.
    // Priorité : site parent (bulle), annuaire, config/rattachements.csv, type DINUM.
    const admin = !parent && !info && c.key.split('.').map((_, i, parts) => adminByDomain.get(parts.slice(i).join('.'))).find(Boolean);
    const typeMinistry = !admin && !parent && !info && c.dinumType ? (config.candidates.dinumTypes || {})[c.dinumType] : '';
    const tags = [isSub ? 'Sous-domaine' : 'Site web', 'Nouveau', ...(serverError ? ['À revérifier'] : [])];
    if (admin) {
      if (!labelByNorm.has(norm(admin))) warnings.push(`Rattachement de ${c.key} : « ${admin} » absente de la carte, créée.`);
      connect(ensureOrg(admin), label, 'Site web/Administration');
    } else if (parent) connect(parent, label, 'Site web/Sous-domaine');
    else if (typeMinistry) connect(ensureOrg(typeMinistry, { 'Type d\'organisme': 'Administration centrale (ou Ministère)' }), label, 'Site web/Administration');
    else if (info) attach(info, label);
    else tags.push('À rattacher');
    sites.set(c.key, label);
    additions.push({
      label,
      type: isSub ? 'Sous-domaine' : 'Site web',
      tags,
      ...(parentKey && { 'Site parent': parentKey }),
      ...(c.dinumType && { 'Type DINUM': c.dinumType }),
      'Organisme': info?.organisme || '',
      'Tutelle': info?.tutelle || '',
      ...(info?.tutelleVia && info.tutelleVia !== 'hiérarchie' && { 'Rattachement déduit de': info.tutelleVia }),
      'SIREN': info?.siren || c.siren || '',
      'Source': c.source || '',
      'Ajouté le': today,
      ...verif(c),
    });
  }
  // Sites sans aucun rattachement, V1 comprise : un site est rattaché s'il est relié à une
  // administration (directement ou via un site voisin) ou s'il appartient à la bulle d'un site parent.
  const allUrlKeys = new Set([...v2Elements, ...additions].filter(e => isUrl(e.label)).map(e => siteKey(hostOf(e.label))));
  const hasParentSite = label => {
    const labels = siteKey(hostOf(label)).split('.');
    for (let i = 1; i < labels.length - 1; i++) {
      const up = labels.slice(i).join('.');
      if (up === config.candidates.suffix) break;
      if (allUrlKeys.has(up)) return true;
    }
    return false;
  };
  const nonUrlNeighbour = label => [...(adj.get(label) || [])].some(n => !isUrl(n));
  const unattached = label => isUrl(label) && !hasParentSite(label) && !nonUrlNeighbour(label)
    && ![...(adj.get(label) || [])].some(n => isUrl(n) && nonUrlNeighbour(n));
  const adminFor = key => key.split('.').map((_, i, parts) => adminByDomain.get(parts.slice(i).join('.'))).find(Boolean);
  let viaV1 = 0;
  for (const e of v2Elements) {
    // Site déclaré dans l'annuaire : sa chaîne s'applique toujours (liens de 2019 retirés plus haut).
    if (!inAnnuaire(e.label) && !unattached(e.label)) continue;
    const key = siteKey(hostOf(e.label));
    // L'annuaire d'abord, puis config/rattachements.csv.
    const info = annSite(key), admin = !info && adminFor(key);
    if (admin) {
      connect(ensureOrg(admin), e.label, 'Site web/Administration');
      e['Rattachement déduit de'] = 'config/rattachements.csv';
    } else if (info) {
      attach(info, e.label);
      Object.assign(e, {
        Organisme: info.organisme,
        Tutelle: info.tutelle || '',
        'Rattachement déduit de': info.tutelleVia && info.tutelleVia !== 'hiérarchie' ? info.tutelleVia : 'Annuaire de l\'administration',
      });
    } else continue;
    viaV1++;
  }

  // L'annuaire ne relie pas les établissements publics à leur ministère : on passe par la liste
  // des opérateurs de l'État (programme budgétaire chef de file -> ministère).
  const withParent = new Set(v2Connections.filter(c => c.type === 'Administration/Administration').map(c => c.to));
  const operateurs = existsSync(p('donnees/sources/operateurs.json')) ? await readJson(p('donnees/sources/operateurs.json')) : [];
  const ministryOf = new Map((await readConfigCsv('programmes-ministeres.csv')).map(r => [r.programme.trim(), r.ministere.trim()]));
  const opByKey = new Map();
  for (const op of operateurs) for (const k of nameKeys(op.nom)) opByKey.set(k, op);
  const matchedOps = new Set(), tutelleByOrg = new Map();
  // À défaut d'intitulé identique : tous les mots significatifs du nom le plus court (3 au moins)
  // figurent dans le plus long.
  const opWords = operateurs.map(op => ({ op, w: new Set(words(op.nom.replace(/^[A-Z0-9 ]{2,12} - /, ''))) }));
  const fuzzyOp = name => {
    const w = new Set(words(name.replace(/\s*\([^)]*\)\s*$/, '')));
    let best = null;
    for (const { op, w: ow } of opWords) {
      const [small, big] = w.size <= ow.size ? [w, ow] : [ow, w];
      if (small.size < 3) continue;
      const covered = [...small].filter(x => big.has(x)).length / small.size;
      if (covered === 1 && (!best || big.size - small.size < best.gap)) best = { op, gap: big.size - small.size };
    }
    return best?.op;
  };
  // Par sigle : « Centre de recherche INRAE - Occitanie » -> opérateur « INRAE - … ».
  const opBySigle = new Map();
  for (const op of operateurs) {
    const sigle = op.nom.match(/^([A-Z][A-Z0-9&]{2,11})\s+[-–]\s/)?.[1];
    if (sigle) opBySigle.set(sigle, op);
  }
  const sigleOp = name => (name.match(/\b[A-Z][A-Z0-9]{3,11}\b/g) || []).map(t => opBySigle.get(t)).find(Boolean);
  for (const o of [...newOrgs]) {
    const op = [...nameKeys(o.label)].map(k => opByKey.get(k)).find(Boolean) || fuzzyOp(o.label) || sigleOp(o.label);
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

  // Tutelles déclarées à la main (config/tutelles.csv) pour les organismes encore sans ministère.
  const manual = (await readConfigCsv('tutelles.csv')).map(r => ({ re: new RegExp(r.motif, 'i'), ministry: r.ministere.trim() }));
  let viaManual = 0;
  for (const o of newOrgs) {
    if (withParent.has(o.label) || isMinistry(o.label)) continue;
    const rule = manual.find(r => r.re.test(o.label));
    if (!rule) continue;
    connect(ensureOrg(rule.ministry, { 'Type d\'organisme': 'Administration centrale (ou Ministère)' }), o.label, 'Administration/Administration');
    withParent.add(o.label);
    tutelleByOrg.set(o.label, rule.ministry);
    o['Rattachement déduit de'] = 'config/tutelles.csv';
    viaManual++;
  }
  for (const a of additions) if (!a.Tutelle && tutelleByOrg.has(a.Organisme)) a.Tutelle = tutelleByOrg.get(a.Organisme);

  // Sites de préfecture : <département ou région>.gouv.fr, reliés au nœud « Préfecture » de la V1.
  const slug = t => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const territoires = existsSync(p('donnees/sources/territoires.json')) ? await readJson(p('donnees/sources/territoires.json')) : [];
  const prefecture = labelByNorm.get('prefecture') || labelByNorm.get('préfecture');
  const prefectureKeys = new Set(territoires.map(t => `${slug(t)}.gouv.fr`));
  if (prefecture) {
    const prefId = elements.find(e => e.label === prefecture)?.id;
    for (const c of connections) {
      const other = c.from === prefId ? c.to : c.to === prefId ? c.from : null;
      const label = other && labelById.get(other);
      if (label && isUrl(label)) prefectureKeys.add(siteKey(hostOf(label)));
    }
  }
  let viaPrefecture = 0;
  for (const a of additions) {
    if (!prefecture || !a.tags.includes('À rattacher') || !prefectureKeys.has(siteKey(hostOf(a.label)))) continue;
    connect(prefecture, a.label, 'Site web/Administration');
    a.tags = a.tags.filter(t => t !== 'À rattacher');
    a['Rattachement déduit de'] = 'nom de département ou de région';
    viaPrefecture++;
  }

  // Bloc-marque DSFR des sites encore sans ministère (lu par fetch-marques).
  const marques = existsSync(p('donnees/checks/marques.json')) ? await readJson(p('donnees/checks/marques.json')) : {};
  const ministryNames = [];
  for (const e of [...v2Elements, ...newOrgs]) {
    if (!isMinistry(e.label) && norm(e.label) !== 'premier ministre') continue;
    ministryNames.push([e.label, e.label]);
    for (const old of String(e['Intitulé 2019'] || '').split(' ; ').filter(Boolean)) ministryNames.push([old, e.label]);
  }
  for (const [old, current] of renames) ministryNames.push([old, current]);
  const ministryOfMarque = ministryMatcher(ministryNames);
  const orgLabels = new Set(newOrgs.map(o => o.label));
  const needsMinistry = a => a.tags.includes('À rattacher') || (orgLabels.has(a.Organisme) && !withParent.has(a.Organisme) && !isMinistry(a.Organisme));
  const toRead = [];
  let viaMarque = 0;
  for (const a of [...additions.filter(needsMinistry), ...v2Elements.filter(e => unattached(e.label))]) {
    toRead.push(a.label);
    const entry = marques[a.label] || {};
    let marque = entry.marque, ministry = ministryOfMarque(marque);
    // Sinon, ministère cité au moins deux fois dans la page (pied de page, mentions légales…).
    if (!ministry && entry.mentions?.length) {
      const votes = new Map();
      for (const m of entry.mentions) {
        const found = ministryOfMarque(m);
        if (found) votes.set(found, (votes.get(found) || 0) + 1);
      }
      const [top, n] = [...votes].sort((x, y) => y[1] - x[1])[0] || [];
      // Cité au moins deux fois, ou seul ministère reconnu parmi les mentions.
      if (n >= 2 || (n === 1 && votes.size === 1)) { ministry = top; marque = `${n} mention${n > 1 ? 's' : ''} dans la page`; }
    }
    if (!ministry) continue;
    a['Bloc-marque'] = marque;
    a['Rattachement déduit de'] = marque.endsWith('dans la page') ? 'mentions dans la page' : 'bloc-marque';
    a.Tutelle = ministry;
    viaMarque++;
    if (orgLabels.has(a.Organisme) && !withParent.has(a.Organisme)) {
      connect(ministry, a.Organisme, 'Administration/Administration');
      withParent.add(a.Organisme);
    } else {
      connect(ministry, a.label, 'Site web/Administration');
      a.tags = (a.tags || []).filter(t => t !== 'À rattacher');
    }
  }
  await writeOut(p('out/marques-a-lire.json'), toRead);

  // Dernier recours : mot-clé du nom de domaine (config/mots-cles-ministeres.csv).
  const keywordRules = (await readConfigCsv('mots-cles-ministeres.csv')).map(r => ({ re: new RegExp(r.motif, 'i'), ministry: r.ministere.trim() }));
  let viaKeyword = 0;
  for (const e of [...v2Elements, ...additions]) {
    if (!unattached(e.label)) continue;
    const name = siteKey(hostOf(e.label)).replace(new RegExp(`\\.${config.candidates.suffix.replace('.', '\\.')}$|\\.[a-z]+$`), '');
    const rule = keywordRules.find(r => r.re.test(name));
    if (!rule) continue;
    connect(ensureOrg(rule.ministry, { 'Type d\'organisme': 'Administration centrale (ou Ministère)' }), e.label, 'Site web/Administration');
    e.Tutelle = rule.ministry;
    e['Rattachement déduit de'] = 'nom de domaine';
    e.tags = (e.tags || []).filter(t => t !== 'À rattacher');
    viaKeyword++;
  }
  // Même règle pour les organismes encore sans tutelle, d'après le domaine de leurs sites.
  const domainName = label => siteKey(hostOf(label)).replace(new RegExp(`\\.${config.candidates.suffix.replace('.', '\\.')}$|\\.[a-z]+$`), '');
  for (const o of newOrgs) {
    if (withParent.has(o.label) || isMinistry(o.label)) continue;
    const names = [...(adj.get(o.label) || [])].filter(isUrl).map(domainName);
    const rule = keywordRules.find(r => names.some(n => r.re.test(n)));
    if (!rule) continue;
    connect(ensureOrg(rule.ministry, { 'Type d\'organisme': 'Administration centrale (ou Ministère)' }), o.label, 'Administration/Administration');
    withParent.add(o.label);
    o['Rattachement déduit de'] = 'nom de domaine de ses sites';
    viaKeyword++;
  }
  for (const o of newOrgs) if (!isMinistry(o.label) && !withParent.has(o.label)) o.tags.push('Tutelle à préciser');
  // Plus de « Service web », de « Consultation web » ni de site sans type : sous-domaine s'ils
  // dépendent d'un site de la carte, site web sinon (type d'origine gardé dans « Type V1 »).
  let retyped = 0;
  const KNOWN_TYPES = new Set(['Site web', 'Sous-domaine', OFF, 'Organization', 'Person']);
  for (const e of v2Elements) {
    // Services, consultations et sites sans type (« Non défini ») de la V1.
    if (!isUrl(e.label) || KNOWN_TYPES.has(e.type)) continue;
    e['Type V1'] = e.type || 'non défini';
    e.type = hasParentSite(e.label) ? 'Sous-domaine' : 'Site web';
    e.tags = [...(e.tags || []).filter(t => !/^(Service web|Consultation web)$/i.test(t)), e.type];
    retyped++;
  }
  v2Elements.push(...newOrgs, ...additions);

  // 3. Jeu de données complet pour la carte V2.
  console.log('Génération du jeu de données V2…');
  await writeOut(p('out/kumu-v2.json'), { elements: v2Elements, connections: v2Connections });
  const cols = ['Label', 'Type', 'Tags', 'Nb liens', 'Détails', 'Statut', 'Code HTTP', 'URL finale', 'Erreur', 'Vérifié le',
    'Type précédent', 'Intitulé 2019', 'Site parent', 'Bloc-marque', 'Rattachement déduit de', 'Organisme', 'Tutelle', 'Type d\'organisme', 'Opérateur de l\'État', 'Statut juridique',
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
    regroupes: [...graph.members.values()].reduce((n, l) => n + l.length, 0),
    bulles: graph.members.size,
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
  const subCount = additions.filter(a => a.type === 'Sous-domaine').length;
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
- Nouveaux sites : **${additions.length}**, dont ${subCount} sous-domaines (annuaire ${fromSource('Annuaire')}, DINUM ${fromSource('DINUM')}, certificats ${fromSource('crt.sh')}) ; **${orphans.length}** sans rattachement
- Nouvelles administrations (annuaire) : **${newOrgs.length}**, dont ${ministries.length} ministères et ${newOrgs.filter(o => o.tags.includes('Tutelle à préciser')).length} sans ministère de tutelle connu
- Sites de la V1 réorganisés selon l'annuaire : ${reorganized} liens de 2019 remplacés
- Services en ligne et consultations de la V1 reclassés en site ou sous-domaine : ${retyped}
- Rattachements complémentaires : ${viaV1} sites de la V1 sans lien (annuaire, config/rattachements.csv), ${viaManual} organismes par config/tutelles.csv, ${viaPrefecture} sites de préfecture, ${viaMarque} sites par leur bloc-marque DSFR ou les ministères cités dans la page, ${viaKeyword} sites par leur nom de domaine
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

const steps = { 'fetch-kumu': fetchKumu, 'fetch-sources': fetchSources, 'fetch-hierarchie': fetchHierarchie, 'fetch-subdomains': fetchSubdomains, check, build, 'fetch-marques': fetchMarques, rebuild: build };
const cmd = process.argv[2];
try {
  if (cmd === 'all') for (const step of Object.values(steps)) await step();
  else if (steps[cmd]) await steps[cmd]();
  else {
    console.log(`Usage : node src/cli.mjs <${[...Object.keys(steps), 'all'].join('|')}> [--limit=N] [--only=map|candidates|unknown|new]`);
    process.exitCode = 1;
  }
} catch (e) {
  console.error(`Erreur : ${e.message}`);
  process.exitCode = 1;
}
