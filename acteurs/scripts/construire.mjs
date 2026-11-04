// Assemble les données de la page des acteurs publics, rangées comme la page budget : par
// administration (État, sécurité sociale, collectivités, opérateurs, et un groupe à part pour les
// partenaires hors administrations publiques), puis par fonction (nomenclature COFOG), puis les
// organisations, chacune avec son résumé de mission.
//
// Entrées : acteurs/sources/annuaire.json (scripts/annuaire.mjs), acteurs/config/resumes.json
// (résumés et classement écrits à la main) et, pour les montants par administration et par
// fonction, budget/donnees/argent-public-AAAA.json et explications.json (page budget).
// Argent public : config/argent-public.json, avec le budget de l'État (page budget), les comptes des
// collectivités (sources/ofgl-AAAA.json, scripts/ofgl.mjs) et des montants de rapports officiels.
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
    montant: null, // argent public, en millions d'euros (voir plus bas)
    argent: null,
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

// Argent public (config/argent-public.json) : pour chaque organisation, les lignes qui le
// financent, en millions d'euros, chacune avec sa source :
// - "P156" ou "P308/02" : programme ou action du budget général de l'État. Programme : dépense
//   exécutée ; action : montant prévu par la loi de finances (l'exécution n'est publiée que par
//   programme). « ministere » : tous les programmes d'un ministère, hors pouvoirs publics (5xx).
// - { ofgl: ["Commune", "PARIS"] } : dépenses d'une catégorie de collectivités (OFGL, sources/ofgl-AAAA.json) ;
//   { ofgl_fonctions: ["411"] } : dépenses des départements pour ces fonctions ;
//   { balances: ["11"], categories: [...] } : dépenses par fonction des balances de la DGFiP (collectivités
//   de 3 500 habitants et plus), celles de la page budget.
// - { montant, libelle, source, url } : montant tiré d'un rapport officiel.
// « hors_total » : ligne montrée dans la fiche mais non additionnée (argent déjà compté ailleurs).
// Une « note » remplace le montant quand il n'y a pas d'argent public propre à l'organisation.
// Une ligne utilisée par plusieurs organisations (hors ministères) est signalée comme partagée.
const BE = await lire(`../budget/donnees/budget-etat-${annee}.json`);
const DE = await lire(`../budget/donnees/detail-etat-${annee}.json`);
const OF = await lire(`sources/ofgl-${annee}.json`);
const BAL = await lire(`../budget/sources/collectivites/balances-fonction-${annee}.json`);
const CA = await lire('config/argent-public.json');
const programmeDe = Object.fromEntries(BE.programmes.map(p => [p.programme, p]));
const CATEGORIES = {
  Commune: ['communes', OF.communes.Commune], PARIS: ['Ville de Paris', OF.communes.PARIS], DEPT: ['départements', OF.departements.DEPT],
  REG: ['régions', OF.regions.REG], CTU: ['collectivités uniques de Corse, Guyane et Martinique', OF.regions.CTU],
  GFP: ['intercommunalités à fiscalité propre', OF.gfp.GFP], EPT: ['établissements publics territoriaux du Grand Paris', OF.gfp.EPT], ML: ['Métropole de Lyon', OF.gfp.ML],
  SDIS: ["services départementaux d'incendie et de secours", OF.sdis], CCAS: ["centres communaux et intercommunaux d'action sociale", OF.ccas],
  MDPH: ['maisons départementales des personnes handicapées', OF.syndicats['Maison départementale des personnes handicapées (MDPH)']],
};
const OFGL = `Comptes des collectivités ${annee} (OFGL) : dépenses totales hors remboursements d'emprunts, budgets principaux`;
// Code de fonction des balances sans le chapitre de vote (93222 ou 90222 -> 222), comme la page budget.
const fonctionBal = c => { c = String(c || ''); return c.slice(0, 2) === '90' || c.slice(0, 2) === '93' ? c.slice(2) : c[0] === '9' ? null : c; };
const arrondi = v => Math.round(v * 1000) / 1000;
for (const [cle, c] of Object.entries(CA)) {
  const o = orgs.get(cle);
  if (!o) { erreurs.push(`argent public : organisation inconnue ${cle}`); continue; }
  const lignes = [];
  for (const m of c.ministere || []) {
    const ps = BE.programmes.filter(p => p.ministere === m && !p.programme.startsWith('5'));
    if (!ps.length) erreurs.push(`${cle} : ministère inconnu dans le budget « ${m} »`);
    for (const p of ps) lignes.push({ source: 'etat', cle: `etat:${p.programme}`, programme: p.programme, libelle: `Programme ${p.programme} · ${p.libelle}`, montant: DE.programmes[p.programme]?.cp.depenses ?? p.depenses, base: 'execution' });
  }
  for (const l of c.lignes || []) {
    const ligne = { remarque: l.remarque || null, hors_total: Boolean(l.hors_total) };
    if (typeof l === 'string' || l.etat) {
      const [, pr, ac] = (typeof l === 'string' ? l : l.etat).match(/^P(\d+)(?:\/(\w+))?$/) || [];
      const p = programmeDe[pr], d = DE.programmes[pr];
      if (!p || !d) { erreurs.push(`${cle} : programme inconnu ${JSON.stringify(l)}`); continue; }
      Object.assign(ligne, { source: 'etat', programme: pr, libelle: `Programme ${pr} · ${p.libelle}` });
      if (!ac) Object.assign(ligne, { cle: `etat:${pr}`, montant: d.cp.depenses, base: 'execution' });
      else {
        const a = d.actions.find(x => x.code === ac);
        if (!a) { erreurs.push(`${cle} : action inconnue ${JSON.stringify(l)}`); continue; }
        Object.assign(ligne, { cle: `etat:${pr}/${ac}`, action: ac, detail: `Action ${ac} · ${a.libelle}`, montant: a.cp, base: 'prevision' });
      }
    } else if (l.ofgl) {
      const inconnues = l.ofgl.filter(k => CATEGORIES[k]?.[1] == null);
      if (inconnues.length) { erreurs.push(`${cle} : catégorie OFGL inconnue ${inconnues}`); continue; }
      Object.assign(ligne, { source: 'ofgl', cle: `ofgl:${l.ofgl.join('+')}`, libelle: l.libelle || `Dépenses des ${l.ofgl.map(k => CATEGORIES[k][0]).join(', ')}`,
        montant: l.ofgl.reduce((s, k) => s + CATEGORIES[k][1], 0) / 1e6, base: 'execution', reference: OFGL });
    } else if (l.ofgl_fonctions) {
      const F = l.ofgl_fonctions.map(k => OF.fonctions_departements[k]);
      if (F.some(f => !f)) { erreurs.push(`${cle} : fonction départementale inconnue ${l.ofgl_fonctions}`); continue; }
      Object.assign(ligne, { source: 'ofgl', cle: `ofglf:${l.ofgl_fonctions.join('+')}`, libelle: l.libelle, detail: `Fonctions ${l.ofgl_fonctions.map((k, i) => `${k} (${F[i].libelles[0]})`).join(', ')}`,
        montant: F.reduce((s, f) => s + f.montant, 0) / 1e6, base: 'execution', reference: `${OFGL}, par fonction (départements en nomenclature M57)` });
    } else if (l.balances) {
      const v = BAL.lignes.filter(([cat, , f]) => l.categories.includes(cat) && l.balances.some(p => (fonctionBal(f) || '').startsWith(p))).reduce((s, [, , , fo, inv]) => s + fo + inv, 0);
      Object.assign(ligne, { source: 'balances', cle: `bal:${l.categories}:${l.balances}`, libelle: l.libelle, montant: v / 1e6, base: 'execution',
        reference: `Balances comptables ${annee} des collectivités (DGFiP), par fonction : collectivités de 3 500 habitants et plus, budgets principaux, opérations réelles` });
    } else if (l.montant != null) {
      Object.assign(ligne, { source: 'rapport', cle: `m:${l.libelle}`, libelle: l.libelle, detail: l.detail || null, montant: l.montant, base: l.base || 'execution', annee: l.annee || null, reference: l.source, url: l.url || null });
    } else { erreurs.push(`${cle} : ligne incomprise ${JSON.stringify(l)}`); continue; }
    ligne.montant = arrondi(ligne.montant);
    lignes.push(ligne);
  }
  o.argent = { ministere: Boolean(c.ministere), note: c.note || null, lignes, partage_avec: [] };
  // Une ligne « hors_total » (argent déjà compté ailleurs) est montrée dans la fiche sans être additionnée.
  o.montant = lignes.length ? arrondi(lignes.filter(l => !l.hors_total).reduce((s, l) => s + l.montant, 0)) : null;
}
// Lignes partagées (hors ministères) : même programme de l'État pris entier par l'un, ou même ligne.
const finances = [...orgs.values()].filter(o => o.argent?.lignes.length && !o.argent.ministere);
const recoupe = (a, b) => a.cle === b.cle || (a.source === 'etat' && b.source === 'etat' && a.programme === b.programme && (!a.action || !b.action));
for (const o of finances) {
  o.argent.partage_avec = finances.filter(x => x !== o && x.argent.lignes.some(l => o.argent.lignes.some(m => recoupe(l, m)))).map(x => x.cle);
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
    argent_public: { unite: "millions d'euros", etat: `Budget général de l'État ${annee} : dépenses exécutées par programme (loi d'approbation des comptes) et répartition par action prévue par le projet de loi de finances, reprises de la page budget`, collectivites: OFGL } },
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
