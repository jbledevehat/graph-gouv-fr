// Arbres des dépenses et des recettes publiques, communs à la page d'exploration, à la page de
// pilotage et aux PDF de l'exploration : les mêmes blocs partout, pour une même année.
//   dépenses : administration › fonction › sous-fonction, ou fonction › administration › sous-fonction ;
//   recettes : administration › impôts (par grande famille) et cotisations (versées ou imputées),
//              ou type de recette › impôt un par un ; puis les autres recettes et le déficit.
// G : donnees/argent-public-AAAA.json ; X : donnees/explications.json (facultatif).
// modeDep : 'admin' ou 'fonction' ; modeRec : 'admin' ou 'type'. Montants en milliards d'euros.
const sum = (l, f) => l.reduce((s, x) => s + (f(x) || 0), 0);
const md2 = v => Math.abs(v).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' Md€';
export const COUL = { S13111: 'etat', S1314: 'secu', S1313: 'coll', S13112: 'op' };

export function arbresArgentPublic(G, X = {}, modeDep = 'admin', modeRec = 'admin') {
  const ex = (t, k) => X[t]?.[k];
  const R = X.recettes || {};
  const D = G.total_depenses, S = G.solde;
  const sous = (s, f) => f.sous.map(x => ({ id: `d-${s.code}-${x.code}`, label: x.libelle, titre: `${x.libelle} (${s.nom})`, v: x.montant, color: COUL[s.code], secteur: s.code, fonction: f.code, explication: ex('sous_fonctions', x.code) }));
  const fonc = (s, f, label) => ({ id: `d-${s.code}-${f.code}`, label, titre: `${f.libelle} (${s.nom})`, v: f.montant, color: COUL[s.code], secteur: s.code, fonction: f.code, explication: ex('fonctions', f.code), children: sous(s, f) });
  const dep = modeDep === 'admin'
    ? { id: 'dep', label: 'Dépenses', v: D, children: G.secteurs.map(s => ({ id: 'd-' + s.code, label: s.nom, v: s.total, color: COUL[s.code], secteur: s.code, explication: ex('secteurs', s.code), children: s.fonctions.map(f => fonc(s, f, f.libelle)) })) }
    : { id: 'dep', label: 'Dépenses', v: D, children: G.secteurs[0].fonctions.map((f0, k) => ({ id: 'd-' + f0.code, label: f0.libelle, v: sum(G.secteurs, s => s.fonctions[k].montant), color: 'na', fonction: f0.code, explication: ex('fonctions', f0.code), children: G.secteurs.map(s => fonc(s, s.fonctions[k], s.nom)) })) };
  const autres = G.recettes.filter(r => r.groupe === 'autres' && r.montant > 0);
  const CLE_AUTRES = { 'Recettes de production': 'ventes', 'Revenus de la propriété': 'propriete', 'Autres transferts': 'transferts_recus' };
  const blocAutres = () => ({ id: 'r-autres', label: 'Autres recettes', titre: 'Autres recettes, toutes administrations', v: G.autres_recettes_consolidees, color: 'na', secteur: 'autres', explication: R.autres,
    children: autres.map(r => ({ id: 'r-autres-' + CLE_AUTRES[r.ligne_insee], label: r.libelle, v: r.montant, color: 'na', secteur: 'autres', explication: R[CLE_AUTRES[r.ligne_insee]] })) });
  const blocDeficit = { id: 'r-deficit', label: 'Déficit (emprunt)', titre: 'Déficit public, financé par l\'emprunt', v: -S, color: 'hatch', secteur: 'deficit', explication: R.deficit };
  let financement;
  if (modeRec === 'admin') {
    // Par administration : ses impôts (par grande famille) et ses cotisations (versées ou imputées).
    financement = [...G.secteurs.map(s => {
      const d = s.recettes.detail, c = COUL[s.code], id = 'r-' + s.code;
      const negatifs = [d.transferts < 0 && `${md2(d.transferts)} reversés à d'autres administrations`, d.non_recouvrables < 0 && `${md2(d.non_recouvrables)} qui ne seront sans doute jamais encaissés`].filter(Boolean);
      const impots = [['production', 'Impôts sur la consommation et la production', R.impots_production], ['revenu', 'Impôts sur le revenu et le patrimoine', R.impots_revenu],
        ['capital', 'Droits de succession et de donation', R.impots_capital], ['transferts', "Impôts reversés par d'autres administrations", R.transferts_fiscaux]]
        .filter(([k]) => d[k] > 0).map(([k, l, e]) => ({ id: `${id}-i-${k}`, label: l, titre: `${l} (${s.nom})`, v: d[k], color: c, secteur: s.code, explication: e }));
      const cot = [['v', 'Cotisations versées', s.recettes.cotisations - d.cotisations_imputees, R.cotisations_versees], ['m', 'Cotisations imputées', d.cotisations_imputees, R.cotisations_imputees]]
        .filter(x => x[2] > 0.05).map(([k, l, v, e]) => ({ id: `${id}-c-${k}`, label: l, titre: `${l} (${s.nom})`, v, color: c, secteur: s.code, explication: e }));
      return { id, label: s.nom, titre: `Recettes de : ${s.nom}`, v: s.recettes.impots + s.recettes.cotisations, color: c, secteur: s.code, explication: ex('secteurs', s.code), children: [
        { id: `${id}-i`, label: 'Impôts', titre: `Impôts perçus par : ${s.nom}`, v: s.recettes.impots, color: c, secteur: s.code, explication: R.impots, children: impots,
          note: negatifs.length ? `Ce total est net : il tient compte de ${negatifs.join(' et de ')}. Les blocs du détail sont avant ces déductions.` : '' },
        cot.length === 1 ? cot[0]
          : { id: `${id}-c`, label: 'Cotisations', titre: `Cotisations perçues par : ${s.nom}`, v: s.recettes.cotisations, color: c, secteur: s.code, explication: R.cotisations, children: cot },
      ] };
    }), blocAutres(), blocDeficit];
  } else {
    // Par type : les impôts un par un (Insee, tableau 3.217), toutes administrations confondues.
    const net = l => l.replace(/\s*\(\*\*\)/g, '').replace(/,? avant crédits d'impôt/, '').replace(/ \(D\d+\w*\)$/, '').trim();
    const NOMS = { 'Taxe sur la valeur ajoutée (TVA) (D211)': 'TVA', 'Impôts et droits sur les importations (D212)': 'Droits de douane (part française)',
      'Impôts sur les produits (D214)': 'Taxes sur des produits', "Impôts sur les salaires et la main d'œuvre (D291)": 'Impôts sur les salaires',
      'Impôts divers sur la production (D292)': 'Impôts sur la production', 'Impôts courants sur le revenu (D51)': 'Impôts sur le revenu',
      'Autres impôts courants (D59)': 'Autres impôts courants', 'Impôts en capital (D91r)': 'Successions et donations' };
    const familles = G.impots.filter(i => i.niveau === 1 && NOMS[i.libelle]).map(f => {
      let enfants = G.impots.filter(i => i.niveau === 2 && i.categorie === f.libelle && !/Union Européenne/.test(i.libelle)).map(i => ({ ...i }));
      // Les crédits d'impôt (négatifs) sont retranchés de l'impôt qu'ils réduisent.
      for (const cr of enfants.filter(i => i.montant < 0)) {
        const cible = enfants.find(i => i.montant > 0 && (/IRPP/.test(cr.libelle) ? /\(IRPP\)/ : /\(IS\)/).test(i.libelle));
        if (cible) { cible.montant += cr.montant; cible.credits = (cible.credits || 0) + cr.montant; }
      }
      enfants = enfants.filter(i => i.montant > 0);
      const ue = G.impots.find(i => i.categorie === f.libelle && /Union Européenne/.test(i.libelle));
      const v = f.montant - (ue ? ue.montant : 0);
      const reste = v - sum(enfants, i => i.montant);
      const id = 'r-t-' + f.libelle.match(/\((D\w+)\)/)[1];
      const ch = enfants.map((i, k) => ({ id: `${id}-${k}`, label: net(i.libelle), titre: net(i.libelle) + (i.credits ? ' (après crédits d\'impôt)' : ''), v: i.montant, color: 'na', secteur: 'impots', explication: ex('impots', i.libelle),
        note: i.credits ? `Montant après ${md2(i.credits)} de crédits d'impôt (services à la personne, recherche…).` : '' }));
      if (ch.length && reste > 0.05) ch.push({ id: `${id}-autres`, label: `Autres (${NOMS[f.libelle].toLowerCase()})`, titre: `Autres ${NOMS[f.libelle].toLowerCase()}`, v: reste, color: 'na', secteur: 'impots' });
      return { id, label: NOMS[f.libelle], titre: NOMS[f.libelle], v, color: 'na', secteur: 'impots', explication: ex('impots', f.libelle), children: ch.length ? ch : undefined };
    });
    const brut = sum(familles, f => f.v), impotsNets = sum(G.secteurs, s => s.recettes.impots);
    const cotT = G.impots.find(i => i.niveau === 1 && i.libelle === 'Cotisations sociales');
    const imputees = G.impots.find(i => i.categorie === 'Cotisations sociales' && /imputées/.test(i.libelle)).montant;
    financement = [
      { id: 'r-t-impots', label: 'Impôts', titre: 'Impôts, toutes administrations', v: impotsNets, color: 'na', secteur: 'impots', explication: R.impots, children: familles,
        note: `Les impôts un par un totalisent ${md2(brut)} ; ${md2(brut - impotsNets)} ne seront sans doute jamais encaissés, d'où ce total net. Les blocs du détail sont avant cette déduction.` },
      { id: 'r-t-cotis', label: 'Cotisations sociales', titre: 'Cotisations sociales, toutes administrations', v: cotT.montant, color: 'na', secteur: 'impots', explication: R.cotisations, children: [
        { id: 'r-t-cotis-v', label: 'Cotisations versées', v: cotT.montant - imputees, color: 'na', secteur: 'impots', explication: R.cotisations_versees },
        { id: 'r-t-cotis-m', label: 'Cotisations imputées', v: imputees, color: 'na', secteur: 'impots', explication: R.cotisations_imputees } ] },
      blocAutres(), blocDeficit];
  }
  // Total du financement : recettes et déficit, soit les dépenses du tableau 3.201 de l'Insee.
  return [dep, { id: 'rec', label: 'Recettes et emprunt', v: sum(financement, c => c.v), children: financement }];
}
