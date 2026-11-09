// Circuit de l'argent public (diagramme de Sankey) de la page d'exploration, lu de gauche à droite
// comme les blocs, à la manière du poster « Où va l'argent public ? » du 1 hebdo tourné d'un quart
// de tour : les ressources ; au centre, un seul bloc, les recettes et le déficit, dont la somme est la
// dépense publique ; puis l'administration qui dépense ; puis la fonction.
// G : donnees/argent-public-AAAA.json ; X : donnees/explications.json (facultatif).
// Renvoie { colonnes: [{ titre, noeuds }], liens: [{ s, t, v, color, secteur, fonction }], R, deficit, total }.
// Montants en milliards d'euros. Les identifiants restent les mêmes d'une année à l'autre.
import { COUL } from './arbres.js';
const sum = (l, f) => l.reduce((s, x) => s + (f(x) || 0), 0);

export function circuitArgentPublic(G, X = {}) {
  const ex = (t, k) => X[t]?.[k];
  const R = G.total_recettes, deficit = -G.solde, total = R + deficit;
  const impots = sum(G.secteurs, s => s.recettes.impots), cotis = sum(G.secteurs, s => s.recettes.cotisations);
  // Fonctions rangées selon l'administration qui les finance surtout, pour limiter les croisements.
  const rangS = Object.fromEntries(G.secteurs.map((s, i) => [s.code, i]));
  const fonctions = G.secteurs[0].fonctions.map((f, i) => ({ id: 'x-f' + f.code, fonction: f.code, label: f.libelle, v: sum(G.secteurs, s => s.fonctions[i].montant), color: 'na',
    explication: ex('fonctions', f.code), b: sum(G.secteurs, s => rangS[s.code] * s.fonctions[i].montant) / (sum(G.secteurs, s => s.fonctions[i].montant) || 1) }))
    .sort((a, b) => a.b - b.b);
  // Les recettes en haut, l'emprunt en bas : il arrive sur la part « déficit » du bloc central.
  const ressources = [
    { id: 'x-r-imp', label: 'Impôts', titre: 'Impôts, nets des impôts non recouvrables', v: impots, color: 'na' },
    { id: 'x-r-cot', label: 'Cotisations sociales', v: cotis, color: 'na' },
    { id: 'x-r-aut', label: 'Autres recettes', titre: "Autres recettes : ventes, revenus de la propriété, transferts reçus de l'extérieur", v: R - impots - cotis, color: 'na', secteur: 'autres' },
    { id: 'x-r-emp', label: 'Emprunt', titre: 'Emprunt, qui couvre le déficit public', v: deficit, color: 'hatch', secteur: 'deficit' }];
  // Le bloc central (dessiné par la page) : les recettes et le déficit ; ensemble, la dépense publique.
  const centre = { id: 'x-total', label: 'Dépenses publiques', titre: 'Dépenses publiques, financées par les recettes et le déficit', v: total, color: 'total', centre: true };
  const admins = G.secteurs.map(s => ({ id: 'x-d' + s.code, label: s.nom, titre: `Dépensé par : ${s.nom}`, v: s.total, color: COUL[s.code], secteur: s.code, explication: ex('secteurs', s.code) }));
  const colonnes = [
    { titre: 'Ressources', noeuds: ressources },
    { titre: "L'argent public", noeuds: [centre] },
    { titre: 'Dépensé par', noeuds: admins },
    { titre: 'Pour quoi faire', noeuds: fonctions }];
  const liens = [
    ...ressources.map(r => ({ s: r.id, t: centre.id, v: r.v, color: r.color, secteur: r.secteur })),
    ...G.secteurs.map(s => ({ s: centre.id, t: 'x-d' + s.code, v: s.total, color: COUL[s.code], secteur: s.code })),
    ...G.secteurs.flatMap(s => s.fonctions.map(f => ({ s: 'x-d' + s.code, t: 'x-f' + f.code, v: f.montant, color: COUL[s.code], secteur: s.code, fonction: f.code })))]
    .filter(k => k.v > 0.0005);
  return { colonnes, liens, R, deficit, total, prelevements: impots + cotis };
}
