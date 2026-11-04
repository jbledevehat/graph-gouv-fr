// Lit, dans l'Annuaire de l'administration, les services rattachés à chaque fiche nationale
// (ministères, institutions et juridictions, autorités indépendantes) : directions, puis
// sous-directions, bureaux… en suivant les « services fils » publiés par l'API, niveau par niveau.
//
// Entrée : acteurs/sources/annuaire.json (scripts/annuaire.mjs).
// Résultat : acteurs/sources/hierarchie.json, { lu_le, services: { id: { nom, sigle, type, url, fils: [id…] } }, racines: { id: [id…] } }.
//
//   node acteurs/scripts/hierarchie.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://api-lannuaire.service-public.fr/api/explore/v2.1/catalog/datasets/api-lannuaire-administration/records';
const PROFONDEUR_MAX = 12;
const pause = ms => new Promise(r => setTimeout(r, ms));

async function lire(url, essais = 4) {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(url, { headers: { 'user-agent': 'gouvfr.jbledevehat.fr (acteurs publics)' } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      if (i >= essais) throw new Error(`${url.slice(0, 120)}… : ${e.message}`);
      await pause(2000 * i);
    }
  }
}

// Fiches de l'API par lots de 50 identifiants.
async function fiches(ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += 50) {
    const where = ids.slice(i, i + 50).map(id => `id="${id}"`).join(' or ');
    const d = await lire(`${API}?${new URLSearchParams({ where, select: 'id,nom,sigle,type_organisme,url_service_public,hierarchie', limit: 100 })}`);
    out.push(...d.results);
    await pause(200);
  }
  return out;
}
const fils = r => JSON.parse(r.hierarchie || '[]').filter(h => h.type_hierarchie === 'Service Fils').map(h => h.service);

const A = JSON.parse(await readFile(join(RACINE, 'sources/annuaire.json'), 'utf8'));
const nationales = [...new Set(A.themes.flatMap(t => t.types).filter(t => t.fiches_nationales).flatMap(t => t.fiches_nationales.map(f => f.id)))];
const services = {}, racines = {}, vus = new Set(nationales);
let niveau = await fiches(nationales);
for (const r of niveau) racines[r.id] = fils(r);
for (let n = 1; n <= PROFONDEUR_MAX; n++) {
  // Un service déjà rencontré (rattaché à deux parents, ou boucle) n'est lu qu'une fois.
  const ids = [...new Set(niveau.flatMap(fils))].filter(id => !vus.has(id));
  if (!ids.length) break;
  ids.forEach(id => vus.add(id));
  niveau = await fiches(ids);
  for (const r of niveau) {
    services[r.id] = { nom: r.nom?.trim(), sigle: r.sigle || null, type: r.type_organisme || null, url: r.url_service_public || null, fils: fils(r) };
  }
  console.log(`niveau ${n} : ${niveau.length} services`);
}
// Liens vers des services absents de l'API (fiches retirées) : on les enlève.
for (const s of Object.values(services)) s.fils = s.fils.filter(id => services[id]);
for (const k of Object.keys(racines)) racines[k] = racines[k].filter(id => services[id]);
const sortie = join(RACINE, 'sources/hierarchie.json');
await writeFile(sortie, JSON.stringify({ lu_le: new Date().toISOString().slice(0, 10), services, racines }) + '\n');
console.log(`${Object.keys(services).length} services -> ${sortie}`);
