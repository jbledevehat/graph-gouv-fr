// Assemble les données de la page des acteurs publics, rangées comme la page budget : par
// administration (État, sécurité sociale, collectivités, opérateurs, et un groupe à part pour les
// partenaires hors administrations publiques), puis par fonction (nomenclature COFOG), puis les
// organisations, chacune avec son résumé de mission.
//
// Entrées : acteurs/sources/annuaire.json (scripts/annuaire.mjs), acteurs/config/resumes.json
// (résumés et classement écrits à la main) et, pour les montants par administration et par
// fonction, budget/donnees/argent-public-AAAA.json et explications.json (page budget).
// Sortie : acteurs/donnees/acteurs.json, et acteurs/donnees/services.json pour les services
// rattachés aux fiches nationales (sources/hierarchie.json, scripts/hierarchie.mjs).
// Une organisation sans résumé ou sans classement, ou un résumé qui ne correspond plus à rien,
// arrête la construction.
//
//   node acteurs/scripts/construire.mjs
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = async f => JSON.parse(await readFile(join(RACINE, f), 'utf8'));
const SITE = 'https://lannuaire.service-public.gouv.fr';

// Nature de l'organisme (son statut), affichée dans la fiche.
const NATURES = {
  etat: "Service de l'État",
  operateur: "Agence ou établissement de l'État",
  secu: 'Organisme de sécurité sociale',
  collectivite: 'Collectivité territoriale ou service qui en dépend',
  juridiction: 'Juridiction',
  consulaire: 'Chambre ou ordre professionnel',
  association: "Association ou réseau d'intérêt général",
  institution: 'Institution de la République',
  ministere: 'Ministère',
  aai: 'Autorité indépendante',
  ambassade: "Représentation de la France à l'étranger",
};
// Administrations, dans l'ordre et avec les codes de la page budget (secteurs de l'Insee).
const ADMINISTRATIONS = [
  { id: 'etat', code: 'S13111' },
  { id: 'secu', code: 'S1314' },
  { id: 'coll', code: 'S1313' },
  { id: 'op', code: 'S13112' },
  { id: 'hors', code: null, nom: 'Partenaires hors administrations publiques',
    quoi: "Associations, chambres et ordres professionnels, et quelques institutions financières publiques : ils assurent une mission d'intérêt général, souvent avec un agrément ou un financement public, mais ne sont pas des administrations publiques au sens de la comptabilité nationale. Leurs dépenses ne sont pas comptées dans la dépense publique.",
    exemples: ['les missions locales', 'les chambres de commerce et d\'industrie', 'les ordres des médecins et des avocats', 'la Banque de France'] },
];
const SECTION_NATIONALE = { 'institutions-juridictions': 'institution', ministeres: 'ministere', 'autorites-independantes': 'aai', ambassades: 'ambassade' };

const A = await lire('sources/annuaire.json');
const R = await lire('config/resumes.json');
const annees = await lire('../budget/donnees/annees.json');
const annee = annees.insee.at(-1);
const G = await lire(`../budget/donnees/argent-public-${annee}.json`);
const X = await lire('../budget/donnees/explications.json');
const erreurs = [];

// Organisations uniques ; une organisation présente dans plusieurs thèmes de l'annuaire garde la
// liste de ces thèmes.
const orgs = new Map();
function ajouter(cle, brut, theme) {
  const r = R[cle];
  if (!r) { erreurs.push(`pas de résumé pour « ${brut.nom} » (${cle})`); return; }
  if (orgs.has(cle)) { orgs.get(cle).themes.push(theme); return; }
  if (!NATURES[r.famille]) erreurs.push(`${cle} : nature inconnue « ${r.famille} »`);
  if (!ADMINISTRATIONS.some(a => a.id === r.administration)) erreurs.push(`${cle} : administration inconnue « ${r.administration} »`);
  if (!G.secteurs[0].fonctions.some(f => f.code === r.fonction)) erreurs.push(`${cle} : fonction inconnue « ${r.fonction} »`);
  orgs.set(cle, {
    cle, nom: r.nom, sigle: r.sigle || null,
    administration: r.administration, fonction: r.fonction, nature: r.famille,
    resume: r.resume, source_resume: r.source,
    implantations: brut.implantations ?? null,
    type_organisme: brut.type_organisme || null,
    url: brut.url,
    // Texte de l'annuaire, seulement s'il a servi au résumé : certaines fiches reprennent le texte
    // d'une autre structure (Maison départementale de l'autonomie, aide aux victimes…).
    mission_annuaire: r.source === 'annuaire' ? brut.mission || null : null,
    themes: [theme],
    montant: null, // millions d'euros, pour les services de l'État (voir plus bas)
    budget: null,
    effectifs: null, // à venir
  });
}
for (const t of A.themes) for (const ty of t.types) {
  if (ty.fiches_nationales) {
    for (const f of ty.fiches_nationales) ajouter(f.id, { nom: f.nom, type_organisme: f.type_organisme, url: f.url, mission: f.mission }, t.nom);
  } else {
    ajouter(ty.code, { nom: ty.nom, implantations: ty.fiches, url: `${SITE}/navigation/${ty.code}`, mission: ty.mission, type_organisme: ty.types_organisme?.[0]?.type }, t.nom);
  }
}
for (const cle of Object.keys(R)) if (!orgs.has(cle)) erreurs.push(`résumé sans organisation dans l'annuaire : ${cle}`);

// Budget de l'État (config/budget-etat.json) : chaque service de l'État est rattaché à des
// programmes du budget général, ou à des actions quand l'une lui correspond (CNIL, tribunaux
// administratifs…) ; un ministère reçoit tous ses programmes, hors pouvoirs publics (5xx), qui vont
// aux institutions. Programme entier : dépense exécutée ; action : montant prévu par la loi de
// finances (l'exécution n'est publiée que par programme). Une ligne utilisée par plusieurs services
// est signalée comme partagée.
const BE = await lire(`../budget/donnees/budget-etat-${annee}.json`);
const DE = await lire(`../budget/donnees/detail-etat-${annee}.json`);
const CB = await lire('config/budget-etat.json');
const programmeDe = Object.fromEntries(BE.programmes.map(p => [p.programme, p]));
for (const [cle, c] of Object.entries(CB)) {
  const o = orgs.get(cle);
  if (!o) { erreurs.push(`budget de l'État : organisation inconnue ${cle}`); continue; }
  if (o.administration !== 'etat') erreurs.push(`budget de l'État : ${cle} n'est pas un service de l'État`);
  const lignes = [];
  for (const m of c.ministere || []) {
    const ps = BE.programmes.filter(p => p.ministere === m && !p.programme.startsWith('5'));
    if (!ps.length) erreurs.push(`${cle} : ministère inconnu dans le budget « ${m} »`);
    for (const p of ps) lignes.push({ programme: p.programme, libelle: p.libelle, montant: DE.programmes[p.programme]?.cp.depenses ?? p.depenses, base: 'execution' });
  }
  for (const l of c.lignes || []) {
    const [, pr, ac] = l.match(/^P(\d+)(?:\/(\w+))?$/) || [];
    const p = programmeDe[pr], d = DE.programmes[pr];
    if (!p || !d) { erreurs.push(`${cle} : programme inconnu ${l}`); continue; }
    if (!ac) { lignes.push({ programme: pr, libelle: p.libelle, montant: d.cp.depenses, base: 'execution' }); continue; }
    const a = d.actions.find(x => x.code === ac);
    if (!a) { erreurs.push(`${cle} : action inconnue ${l}`); continue; }
    lignes.push({ programme: pr, libelle: p.libelle, action: ac, action_libelle: a.libelle, montant: a.cp, base: 'prevision' });
  }
  o.budget = { ministere: Boolean(c.ministere), note: c.note || null, lignes, partage_avec: [] };
  o.montant = lignes.length ? Math.round(lignes.reduce((s, l) => s + l.montant, 0) * 1000) / 1000 : null;
}
// Lignes partagées entre services (hors ministères) : même programme, et l'un des deux le prend
// entier ou les deux la même action.
const servicesEtat = [...orgs.values()].filter(o => o.budget?.lignes.length && !o.budget.ministere);
const recoupe = (a, b) => a.programme === b.programme && (!a.action || !b.action || a.action === b.action);
for (const o of servicesEtat) {
  o.budget.partage_avec = servicesEtat.filter(x => x !== o && x.budget.lignes.some(l => o.budget.lignes.some(m => recoupe(l, m)))).map(x => x.cle);
}
if (erreurs.length) { console.error(erreurs.join('\n')); process.exit(1); }

// Administrations avec leur dépense totale et par fonction (milliards d'euros, comme la page budget).
const administrations = ADMINISTRATIONS.map(a => {
  const s = a.code && G.secteurs.find(x => x.code === a.code);
  const ex = a.code ? X.secteurs[a.code] : a;
  return {
    id: a.id, code: a.code, nom: s ? s.nom : a.nom, quoi: ex.quoi, exemples: ex.exemples,
    depense: s ? s.total : null,
    depense_par_fonction: s ? Object.fromEntries(s.fonctions.map(f => [f.code, f.montant])) : null,
  };
});
const fonctions = G.secteurs[0].fonctions.map((f, k) => ({
  code: f.code, libelle: f.libelle, quoi: X.fonctions[f.code]?.quoi || null, exemples: X.fonctions[f.code]?.exemples || [],
  depense: G.secteurs.reduce((s, x) => s + x.fonctions[k].montant, 0),
}));

const sortie = join(RACINE, 'donnees/acteurs.json');
await mkdir(dirname(sortie), { recursive: true });
await writeFile(sortie, JSON.stringify({
  lu_le: A.lu_le, source: A.source,
  montants: { annee: Number(annee), unite: "milliards d'euros", source: `Insee, comptes de la Nation ${annee} : dépenses consolidées des administrations publiques par fonction (tableau 3.307), reprises de la page budget`,
    budget_etat: { unite: "millions d'euros", source: `Budget général de l'État ${annee} : dépenses exécutées par programme (loi d'approbation des comptes) et répartition par action prévue par le projet de loi de finances, reprises de la page budget` } },
  administrations, fonctions, natures: NATURES,
  organisations: [...orgs.values()],
}) + '\n');
console.log(`${orgs.size} organisations, ${administrations.length} administrations, ${fonctions.length} fonctions (dépenses ${annee}) -> ${sortie}`);

// Services rattachés, sous forme compacte : chaque service est une ligne
// [nom, sigle, n° de type, n° de section du lien de l'annuaire (-1 sans lien), identifiant, [n° des services fils]],
// et « racines » donne, pour chaque organisation, les numéros de ses services de premier niveau.
const HI = await lire('sources/hierarchie.json');
const ids = Object.keys(HI.services), numero = new Map(ids.map((id, i) => [id, i]));
const types = [], sections = [];
const indice = (l, v) => { if (v == null) return -1; let i = l.indexOf(v); if (i < 0) i = l.push(v) - 1; return i; };
const services = ids.map(id => {
  const v = HI.services[id];
  const section = v.url ? v.url.replace(`${SITE}/`, '').replace(`/${id}`, '') : null;
  return [v.nom || '(sans nom)', v.sigle || 0, indice(types, v.type), indice(sections, section), id, v.fils.map(f => numero.get(f))];
});
const racines = Object.fromEntries(Object.entries(HI.racines).filter(([cle, l]) => orgs.has(cle) && l.length).map(([cle, l]) => [cle, l.map(f => numero.get(f))]));
const sortieS = join(RACINE, 'donnees/services.json');
await writeFile(sortieS, JSON.stringify({ lu_le: HI.lu_le, site: SITE, types, sections, services, racines }) + '\n');
console.log(`${services.length} services rattachés à ${Object.keys(racines).length} organisations -> ${sortieS}`);
