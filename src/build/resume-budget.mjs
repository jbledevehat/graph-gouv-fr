// Résumé en texte des comptes d'une année (argent-public-AAAA.json), écrit dans le HTML des pages
// Exploration et Pilotage au moment de la construction : les moteurs de recherche et les lecteurs
// sans JavaScript y trouvent les chiffres clés, que les pages dessinent ensuite en blocs.

const esc = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const nf = (v, d = 0) => v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/ | /g, ' ');
const md = v => `${nf(v, v >= 100 ? 0 : 1)} Md€`;
const pct = (v, t) => `${nf(v / t * 100, 1)} %`;
const sansCode = s => s.replace(/\s*\((\*\*|[A-Z]\d[^)]*)\)/g, '').trim();
// Fonctions dans une phrase, par ordre décroissant.
const FONCTIONS = { GF01: 'les services généraux, dont les intérêts de la dette', GF02: 'la défense', GF03: "l'ordre et la sécurité",
  GF04: 'les affaires économiques, dont les transports', GF05: "l'environnement", GF06: 'le logement et les équipements collectifs',
  GF07: 'la santé', GF08: 'la culture, les loisirs et le culte', GF09: "l'enseignement", GF10: 'la protection sociale (retraites, famille, chômage, pauvreté)' };
const phraseFonctions = (fs, T) => {
  const [p, ...r] = fs;
  return `${FONCTIONS[p.code].replace(/^./, c => c.toUpperCase())} pèse ${pct(p.v, T)} des dépenses publiques, devant ${r.map((f, i) => `${i === 0 ? '' : i === r.length - 1 ? ' et ' : ', '}${FONCTIONS[f.code]} (${pct(f.v, T)})`).join('')}.`;
};
const NOMS = { 'État': "l'État", 'Sécurité sociale': 'la sécurité sociale', 'Collectivités locales': 'les collectivités locales', "Opérateurs de l'État": "les opérateurs de l'État" };

const tableau = (legende, entetes, lignes) => `<table>
<caption>${esc(legende)}</caption>
<thead><tr>${entetes.map((e, i) => `<th scope="col"${i ? ' class="num"' : ''}>${esc(e)}</th>`).join('')}</tr></thead>
<tbody>
${lignes.map(l => `<tr>${l.map((c, i) => i ? `<td class="num">${c}</td>` : `<th scope="row">${esc(c)}</th>`).join('')}</tr>`).join('\n')}
</tbody>
</table>`;

// h : niveau du titre principal du résumé (2 ou 3), les sous-titres en dessous.
export function resumeArgentPublic(G, { h = 2, titre = true, annees = [] } = {}) {
  const a = G.meta.annee, D = G.total_depenses_par_nature, R = G.total_recettes, def = -G.solde;
  const h2 = h, h3 = h + 1;
  const detail = G.depenses_detaillees !== false;
  let html = `${titre ? `<h${h2}>L'argent public en ${a}, en chiffres</h${h2}>\n` : ''}<p>En ${a}, l'État, la sécurité sociale, les collectivités locales et les opérateurs de l'État ont dépensé <strong>${md(D)}</strong>, soit ${nf(G.part_pib['dépenses'], 1)} % du PIB${G.statut === 'provisoire' ? ' (comptes provisoires de l\'Insee)' : ''}. Les recettes publiques atteignent ${md(R)} (${nf(G.part_pib.recettes, 1)} % du PIB) ; le déficit, ${md(def)}, est financé par l'emprunt. Chaque euro n'est compté qu'une fois, chez l'administration qui le dépense en dernier : une dotation de l'État à une commune est comptée dans les dépenses de la commune.</p>
`;
  if (detail) {
    const secteurs = [...G.secteurs].sort((x, y) => y.total - x.total);
    const T = G.total_depenses;
    html += `<h${h3}>Qui dépense l'argent public</h${h3}>
<p>${secteurs.map((s, i) => `${i ? (i === secteurs.length - 1 ? ' et ' : ', ') : ''}${i ? NOMS[s.nom] || s.nom : (NOMS[s.nom] || s.nom).replace(/^./, c => c.toUpperCase())} ${md(s.total)}`).join('')}.</p>
${tableau(`Dépenses publiques par administration en ${a}`, ['Administration', 'Milliards d\'euros', 'Part'], secteurs.map(s => [s.nom, md(s.total), pct(s.total, T)]))}
`;
    // Fonctions et sous-fonctions, toutes administrations réunies.
    const fonctions = new Map(), sous = new Map();
    for (const s of G.secteurs) for (const f of s.fonctions) {
      fonctions.set(f.code, { libelle: f.libelle, v: (fonctions.get(f.code)?.v || 0) + f.montant });
      for (const x of f.sous) sous.set(x.code, { libelle: x.libelle, v: (sous.get(x.code)?.v || 0) + x.montant });
    }
    const fs = [...fonctions.entries()].map(([code, f]) => ({ code, ...f })).sort((x, y) => y.v - x.v);
    const ss = [...sous.values()].sort((x, y) => y.v - x.v).slice(0, 15);
    html += `<h${h3}>Pour quoi faire : les dépenses par fonction</h${h3}>
<p>${phraseFonctions(fs.slice(0, 5), T)}</p>
${tableau(`Dépenses publiques par fonction en ${a}`, ['Fonction', 'Milliards d\'euros', 'Part'], fs.map(f => [f.libelle, md(f.v), pct(f.v, T)]))}
${tableau(`Les 15 premiers postes de dépense publique en ${a}`, ['Poste', 'Milliards d\'euros'], ss.map(x => [x.libelle, md(x.v)]))}
`;
  }
  const rec = G.recettes.filter(r => r.montant > 0);
  html += `<h${h3}>D'où vient l'argent : recettes et emprunt</h${h3}>
${tableau(`Recettes publiques et déficit en ${a}`, ['Ressource', 'Milliards d\'euros', 'Part'], [...rec.map(r => [r.libelle, md(r.montant), pct(r.montant, R + def)]), ['Déficit, financé par l\'emprunt', md(def), pct(def, R + def)]])}
`;
  // Mêmes impôts que « Les 20 premiers prélèvements » de la page Pilotage.
  const imp = G.impots.filter(i => i.montant > 0 && !/^Cotisations sociales/.test(i.categorie || i.libelle) && (i.niveau === 2 || /TVA/.test(i.libelle)))
    .sort((x, y) => y.montant - x.montant).slice(0, 12);
  html += tableau(`Les principaux impôts en ${a}`, ['Impôt', 'Milliards d\'euros'], imp.map(i => [sansCode(i.libelle), md(i.montant)])) + '\n';
  html += `<p>Source : comptes de la Nation de l'Insee (comptabilité nationale, base 2020). Montants en milliards d'euros courants.${annees.length ? ` Autres années : ${annees.filter(x => +x !== a).map(x => `<a href="?annee=${x}">${x}</a>`).join(', ')}.` : ''}</p>`;
  return html;
}
