// Circuit de l'argent public (diagramme de Sankey) de la page d'exploration : cinq colonnes de même
// total, lues de gauche à droite, comme les blocs (recettes à gauche, dépenses à droite) :
//   ressources → administration qui les perçoit → passage d'une administration à l'autre →
//   administration qui dépense → fonction.
// Comptes de l'Insee, sauf les versements de l'État aux autres administrations, tirés de son budget
// (loi d'approbation des comptes, catégories de dépenses) quand l'année est disponible : l'Insee ne
// publie pas qui verse à qui. Le reste (autres recettes, transferts non détaillés) passe par un
// réservoir commun. Chaque administration est calculée exactement : dépense = perçu + reçu − versé − excédent.
// G : donnees/argent-public-AAAA.json ; annee : son année ; etat : { BE: budget-etat-AAAA.json, DE: detail-etat-AAAA.json } ou null.
// Renvoie { colonnes: [{ titre, noeuds }], liens: [{ s, t, v, color, secteur }], SECT, versements, AUTRES }.
// Montants en milliards d'euros. Les identifiants restent les mêmes d'une année à l'autre.
import { COUL } from './arbres.js';
const sum = (l, f) => l.reduce((s, x) => s + (f(x) || 0), 0);

export function circuitArgentPublic(G, etat, X = {}, annee = '') {
  const ex = (t, k) => X[t]?.[k];
  // Versements de l'État, d'après son budget : collectivités (transferts et prélèvements sur
  // recettes), sécurité sociale et autres organismes publics, opérateurs (subventions).
  const direct = {};
  if (etat?.BE && etat?.DE) {
    const PB = etat.BE.programmes.filter(p => p.programme !== '200');
    const cat = ks => sum(PB, p => sum(ks, k => etat.DE.programmes[p.programme]?.categories?.[k])) / 1000;
    direct.S1313 = cat(['63']) - etat.BE.recettes.sections.find(x => x.section.startsWith('31')).net / 1000;
    direct.S1314 = cat(['64']);
    direct.S13112 = cat(['32', '53']);
  }
  const SECT = G.secteurs.map(s => {
    const emprunt = Math.max(0, -s.recettes.solde), excedent = Math.max(0, s.recettes.solde);
    const percu = s.recettes.impots + s.recettes.cotisations + emprunt;
    return { s, c: COUL[s.code], emprunt, excedent, percu, recuEtat: 0, versEtat: 0 };
  });
  const ETAT = SECT.find(x => x.s.code === 'S13111');
  for (const x of SECT) {
    // Ce que l'administration reçoit d'ailleurs que de ses impôts, cotisations et emprunt.
    const besoin = x.s.total + x.excedent - x.percu;
    if (x !== ETAT && direct[x.s.code] > 0) x.recuEtat = Math.max(0, Math.min(direct[x.s.code], besoin));
    x.besoin = besoin;
  }
  ETAT.versEtat = sum(SECT, x => x.recuEtat);
  for (const x of SECT) {
    // Solde avec le réservoir, une fois comptés les versements directs de l'État.
    const net = x === ETAT ? x.besoin + x.versEtat : x.besoin - x.recuEtat;
    x.recoit = Math.max(0, net); x.verse = Math.max(0, -net);
    x.garde = x.percu - x.verse - (x === ETAT ? x.versEtat : 0);
  }
  const AUTRES = G.autres_recettes_consolidees;
  const reservoir = AUTRES + sum(SECT, x => x.verse);
  // Fonctions rangées selon l'administration qui les finance surtout, pour limiter les croisements.
  const rangS = Object.fromEntries(SECT.map((x, i) => [x.s.code, i]));
  const fonctions = G.secteurs[0].fonctions.map((f, i) => ({ id: 'x-f' + f.code, fonction: f.code, label: f.libelle, v: sum(G.secteurs, s => s.fonctions[i].montant), color: 'na',
    explication: ex('fonctions', f.code), b: sum(G.secteurs, s => rangS[s.code] * s.fonctions[i].montant) / (sum(G.secteurs, s => s.fonctions[i].montant) || 1) }))
    .sort((a, b) => a.b - b.b);
  // L'emprunt d'abord : il va surtout à l'État, placé en haut ; son ruban hachuré ne traverse pas le dessin.
  const ressources = [
    { id: 'x-r-emp', label: 'Emprunt (déficit)', titre: 'Emprunt des administrations en déficit', v: sum(SECT, x => x.emprunt), color: 'hatch', secteur: 'deficit' },
    { id: 'x-r-imp', label: 'Impôts', titre: 'Impôts, nets des impôts non recouvrables', v: sum(SECT, x => x.s.recettes.impots), color: 'na' },
    { id: 'x-r-cot', label: 'Cotisations sociales', v: sum(SECT, x => x.s.recettes.cotisations), color: 'na' },
    { id: 'x-r-aut', label: 'Autres recettes', titre: "Autres recettes : ventes, revenus de la propriété, transferts reçus de l'extérieur", v: AUTRES, color: 'na', secteur: 'autres' }];
  const autresSect = SECT.filter(x => x !== ETAT);
  const versements = autresSect.filter(x => x.recuEtat > 0.0005);
  const COURT = { S1314: 'à la sécurité sociale et autres organismes', S1313: 'aux collectivités locales', S13112: 'aux opérateurs' };
  const FLECHE = { S1314: '→ Sécurité sociale', S1313: '→ Collectivités', S13112: '→ Opérateurs' };
  const admin = (p, x, titre) => ({ id: `x-${p}${x.s.code}`, label: x.s.nom, titre, v: p === 'p' ? x.percu : x.s.total, color: x.c, secteur: x.s.code, explication: ex('secteurs', x.s.code) });
  const colonnes = [
    { titre: 'Ressources', noeuds: ressources },
    { titre: 'Perçues par', noeuds: [admin('p', ETAT, `Perçu par : ${ETAT.s.nom} (impôts, cotisations et emprunt, selon l'Insee)`), { id: 'x-pass-aut', v: AUTRES, invisible: true },
      ...autresSect.map(x => admin('p', x, `Perçu par : ${x.s.nom}`))] },
    { titre: "D'une administration à l'autre", noeuds: [{ id: 'x-g' + ETAT.s.code, v: ETAT.garde, invisible: true },
      ...versements.map(x => ({ id: 'x-v' + x.s.code, label: `État ${FLECHE[x.s.code]}`, titre: `Versé par l'État ${COURT[x.s.code]} (budget de l'État ${annee})`, v: x.recuEtat, color: 'etat', secteur: x.s.code })),
      { id: 'x-reservoir', label: 'Réservoir commun', titre: etat ? 'Réservoir commun : autres recettes (ventes, revenus, dividendes…) et transferts entre administrations que les comptes publiés ne détaillent pas' : "Réservoir commun : ce qu'une administration perçoit en plus de ce qu'elle dépense, et les autres recettes ; il finance les autres administrations", v: reservoir, color: 'na' },
      ...autresSect.map(x => ({ id: 'x-g' + x.s.code, v: x.garde, invisible: true }))] },
    { titre: 'Dépensées par', noeuds: [...SECT.map(x => admin('d', x, `Dépensé par : ${x.s.nom}`)),
      ...SECT.filter(x => x.excedent > 0.0005).map(x => ({ id: 'x-e' + x.s.code, label: `Excédent : ${x.s.nom}`, titre: `Excédent de ${x.s.nom} (non dépensé)`, v: x.excedent, color: x.c, secteur: x.s.code }))] },
    { titre: 'Pour quoi faire', noeuds: fonctions }];
  const l = (s, t, v, color, secteur) => ({ s: 'x-' + s, t: 'x-' + t, v, color, secteur });
  const liens = [
    ...SECT.flatMap(x => [l('r-imp', 'p' + x.s.code, x.s.recettes.impots, x.c, x.s.code), l('r-cot', 'p' + x.s.code, x.s.recettes.cotisations, x.c, x.s.code), l('r-emp', 'p' + x.s.code, x.emprunt, 'hatch', 'deficit')]),
    l('r-aut', 'pass-aut', AUTRES, 'na', 'autres'), l('pass-aut', 'reservoir', AUTRES, 'na', 'autres'),
    ...versements.flatMap(x => [l('p' + ETAT.s.code, 'v' + x.s.code, x.recuEtat, 'etat', ETAT.s.code), l('v' + x.s.code, 'd' + x.s.code, x.recuEtat, 'etat', ETAT.s.code)]),
    ...SECT.flatMap(x => [l('p' + x.s.code, 'g' + x.s.code, x.garde, x.c, x.s.code), l('p' + x.s.code, 'reservoir', x.verse, x.c, x.s.code),
      l('g' + x.s.code, 'd' + x.s.code, x.garde - x.excedent, x.c, x.s.code), l('g' + x.s.code, 'e' + x.s.code, x.excedent, x.c, x.s.code),
      l('reservoir', 'd' + x.s.code, x.recoit, x.c, x.s.code)]),
    ...SECT.flatMap(x => x.s.fonctions.map(f => ({ ...l('d' + x.s.code, 'f' + f.code, f.montant, x.c, x.s.code), fonction: f.code })))]
    .filter(k => k.v > 0.0005);
  return { colonnes, liens, SECT, ETAT, versements, AUTRES, COURT };
}
