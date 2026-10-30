// Lit l'Annuaire de l'administration (lannuaire.service-public.gouv.fr) pour la page des acteurs
// publics : les thèmes et les types d'organismes de la page « Tous les organismes », puis, pour
// chaque type, le nombre de fiches et le texte de mission publié dans l'API ; pour
// l'administration nationale, chaque ministère, autorité indépendante ou institution.
//
// Résultat : acteurs/sources/annuaire.json (textes officiels, non retouchés). Les résumés lisibles
// sont écrits à la main dans acteurs/config/resumes.json.
//
//   node acteurs/scripts/annuaire.mjs
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://lannuaire.service-public.gouv.fr';
const API = 'https://api-lannuaire.service-public.fr/api/explore/v2.1/catalog/datasets/api-lannuaire-administration/records';
// Sections nationales de la page « Tous les organismes » (thème « Administration nationale »).
const NATIONAL = ['institutions-juridictions', 'ministeres', 'autorites-independantes'];

const pause = ms => new Promise(r => setTimeout(r, ms));
const texte = s => s.replace(/<[^>]+>/g, '').replace(/&#39;|&rsquo;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"')
  .replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

async function lire(url, essais = 3) {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(url, { headers: { 'user-agent': 'gouvfr.jbledevehat.fr (acteurs publics)' } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r;
    } catch (e) {
      if (i >= essais) throw new Error(`${url} : ${e.message}`);
      await pause(2000 * i);
    }
  }
}

const api = async params => (await lire(`${API}?${new URLSearchParams(params)}`)).json();

// Thèmes de la page « Tous les organismes » : un accordéon par thème, un lien par type.
async function themes() {
  const html = await (await lire(`${SITE}/themes`)).text();
  return [...html.matchAll(/<section class="fr-accordion"[\s\S]*?<\/section>/g)].map(([bloc]) => ({
    id: bloc.match(/<a id="([^"]+)" data-test="theme-anchor"/)[1],
    nom: texte(bloc.match(/<button[^>]*>([\s\S]*?)<\/button>/)[1]),
    types: [...bloc.matchAll(/<a href="https:\/\/lannuaire\.service-public\.gouv\.fr\/navigation\/([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map(([, code, t]) => {
      const m = texte(t).match(/^(.*?)(?: \((\d+)\))?$/);
      return { code, nom: m[1], fiches: m[2] ? Number(m[2]) : null };
    }),
  }));
}

// Texte de mission le plus fréquent parmi les fiches d'un type (les fiches d'un même réseau
// reprennent en général le même texte), et types d'organisme déclarés.
async function typeLocal(code) {
  const d = await api({ where: `pivot like "${code}"`, select: 'nom,mission,type_organisme,pivot', limit: 50 });
  // « like » trouve aussi les codes qui contiennent celui-ci (ars_antenne pour ars) : on garde
  // les fiches dont le pivot porte exactement ce code.
  const fiches = d.results.filter(r => JSON.parse(r.pivot || '[]').some(p => p.type_service_local === code));
  const compte = cle => {
    const n = new Map();
    for (const r of fiches) if (r[cle]) n.set(r[cle].trim(), (n.get(r[cle].trim()) || 0) + 1);
    return [...n].sort((a, b) => b[1] - a[1]);
  };
  return {
    mission: compte('mission')[0]?.[0] || null,
    types_organisme: compte('type_organisme').map(([t, n]) => ({ type: t, fiches: n })),
    exemple: fiches[0]?.nom || null,
  };
}

// Fiches d'une section nationale : liens de la page de navigation, puis la fiche de l'API.
async function sectionNationale(section) {
  const html = await (await lire(`${SITE}/navigation/${section}`)).text();
  const main = html.match(/<main[\s\S]*?<\/main>/)[0];
  const liens = [...main.matchAll(/<a href="https:\/\/lannuaire\.service-public\.gouv\.fr\/[a-z-]+\/([0-9a-f-]{36})"[^>]*>([\s\S]*?)<\/a>/g)];
  const fiches = [];
  for (const [, id, nom] of liens) {
    const r = (await api({ where: `id="${id}"`, select: 'nom,sigle,mission,type_organisme,url_service_public,site_internet', limit: 1 })).results[0] || {};
    fiches.push({
      id, nom: texte(nom), sigle: r.sigle || null, mission: r.mission?.trim() || null,
      type_organisme: r.type_organisme || null, url: r.url_service_public || null,
      site: JSON.parse(r.site_internet || '[]')[0]?.valeur || null,
    });
    await pause(300);
  }
  return fiches;
}

const T = await themes();
console.log(`${T.length} thèmes, ${T.reduce((n, t) => n + t.types.length, 0)} entrées`);
const vus = new Map();
for (const t of T) {
  for (const ty of t.types) {
    if (NATIONAL.includes(ty.code)) { ty.fiches_nationales = await sectionNationale(ty.code); continue; }
    if (ty.code === 'ambassades') continue;
    if (!vus.has(ty.code)) { vus.set(ty.code, await typeLocal(ty.code)); await pause(300); }
    Object.assign(ty, vus.get(ty.code));
    process.stdout.write('.');
  }
}
const sortie = join(RACINE, 'sources/annuaire.json');
await mkdir(dirname(sortie), { recursive: true });
await writeFile(sortie, JSON.stringify({ lu_le: new Date().toISOString().slice(0, 10), source: `${SITE}/themes`, themes: T }, null, 1) + '\n');
console.log(`\n-> ${sortie}`);
