// Lit, sur le portail de l'Observatoire des finances et de la gestion publique locales (OFGL), les
// dépenses d'une année des collectivités et de leurs établissements, pour la page des acteurs
// publics : dépenses totales hors remboursements d'emprunts, budgets principaux, par catégorie
// (communes, départements, régions, intercommunalités, SDIS, CCAS, MDPH) et, pour les départements,
// par fonction.
//
// Résultat : acteurs/sources/ofgl-AAAA.json (sommes en euros, non retouchées).
//
//   node acteurs/scripts/ofgl.mjs 2024
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORTAIL = 'https://data.ofgl.fr/api/explore/v2.1/catalog/datasets';
const annee = process.argv[2] || '2024';
const AGREGAT = "agregat='Dépenses totales hors remb'";

async function somme(jeu, where, groupe) {
  const params = new URLSearchParams({ select: `${groupe ? groupe + ',' : ''}sum(montant) as m`, where: `year(exer)=${annee} and ${AGREGAT}${where ? ' and ' + where : ''}`, limit: groupe ? '1000' : '1' });
  if (groupe) params.set('group_by', groupe);
  const r = await fetch(`${PORTAIL}/${jeu}/records?${params}`, { headers: { 'user-agent': 'gouvfr.jbledevehat.fr (acteurs publics)' } });
  const d = await r.json();
  if (!d.results) throw new Error(`${jeu} : ${JSON.stringify(d).slice(0, 200)}`);
  return d.results;
}
const principal = "type_de_budget='Budget principal'";
const parCateg = async jeu => Object.fromEntries((await somme(jeu, principal, 'categ')).map(r => [r.categ, r.m]));

const communes = await parCateg('ofgl-base-communes');
const departements = await parCateg('ofgl-base-departements');
const regions = await parCateg('ofgl-base-regions');
const gfp = await parCateg('ofgl-base-gfp');
const sdis = (await somme('ofgl-base-sdis', '', ''))[0].m;
const ccas = (await somme('ofgl-base-ccas-cias', principal, ''))[0].m;
const syndicats = Object.fromEntries((await somme('ofgl-base-syndicats', principal, 'categorie_synd')).map(r => [r.categorie_synd, r.m]));
// Départements par fonction (codes M57 ou M52, aux niveaux 1 à 3).
const fonctions = {};
for (const r of await somme('ofgl-base-departements-fonctionnelle', principal, 'fonction,nom_fonction')) {
  if (!r.fonction) continue;
  (fonctions[r.fonction] ||= { libelles: [], montant: 0 });
  fonctions[r.fonction].libelles.push(r.nom_fonction);
  fonctions[r.fonction].montant += r.m || 0;
}

const sortie = join(RACINE, `sources/ofgl-${annee}.json`);
await writeFile(sortie, JSON.stringify({
  lu_le: new Date().toISOString().slice(0, 10), annee: Number(annee),
  source: 'https://data.ofgl.fr', definition: 'Dépenses totales hors remboursements d\'emprunts, budgets principaux, en euros',
  communes, departements, regions, gfp, sdis, ccas, syndicats, fonctions_departements: fonctions,
}, null, 1) + '\n');
console.log(`communes ${Math.round(communes.Commune / 1e9)} Md€, départements ${Math.round(departements.DEPT / 1e9)} Md€, ${Object.keys(fonctions).length} fonctions départementales -> ${sortie}`);
