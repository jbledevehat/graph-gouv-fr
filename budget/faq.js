// Questions fréquentes sur l'argent public d'une année, communes à la page d'exploration, à la page
// de pilotage et à la construction du site : le HTML de chaque page contient déjà les réponses de
// l'année de référence (moteurs de recherche, lecteurs sans JavaScript), puis la page les réécrit
// pour l'année choisie. Chaque réponse est calculée à partir des comptes de l'Insee.
// G : donnees/argent-public-AAAA.json ; AN : donnees/annees.json (déficit année par année, écarts).
// Montants en milliards d'euros.
const esc = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const nf = (v, d = 0) => v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/ | /g, ' ');
const md = v => `${nf(v, v >= 100 ? 0 : 1)} Md€`;
const pc = v => `${nf(v, 1)} %`;
const pct = (v, t) => pc(v / t * 100);
const sansCode = s => s.replace(/\s*\((\*\*|[A-Z]\d[^)]*)\)/g, '').trim();
const maj = s => s.replace(/^./, c => c.toUpperCase());
const liste = l => l.length < 2 ? l.join('') : l.slice(0, -1).join(', ') + ' et ' + l[l.length - 1];
const NOMS = { S13111: "l'État", S1314: 'la sécurité sociale', S1313: 'les collectivités locales', S13112: "les opérateurs de l'État" };
const FONCTIONS = { GF01: 'les services généraux', GF02: 'la défense', GF03: "l'ordre et la sécurité", GF04: 'les affaires économiques',
  GF05: "l'environnement", GF06: 'le logement', GF07: 'la santé', GF08: 'la culture et les loisirs', GF09: "l'enseignement", GF10: 'la protection sociale' };

const tableau = (legende, entetes, lignes) => `<table>
<caption>${esc(legende)}</caption>
<thead><tr>${entetes.map((e, i) => `<th scope="col"${i ? ' class="num"' : ''}>${esc(e)}</th>`).join('')}</tr></thead>
<tbody>
${lignes.map(l => `<tr>${l.map((c, i) => i ? `<td class="num">${c}</td>` : `<th scope="row">${esc(c)}</th>`).join('')}</tr>`).join('\n')}
</tbody>
</table>`;

// Liste des questions : [{ q, r (HTML), texte (réponse en texte simple, pour les données structurées) }].
export function questionsArgentPublic(G, AN = {}) {
  const a = G.meta.annee, D = G.total_depenses_par_nature, R = G.total_recettes, def = -G.solde;
  const detail = G.depenses_detaillees !== false, provisoire = G.statut === 'provisoire';
  const ecart = (AN.insee_ecart || []).includes(String(a));
  const pib = D / (G.part_pib['dépenses'] / 100);
  const Q = [];
  const ajouter = (q, r) => Q.push({ q, r });

  ajouter(`Combien la France dépense-t-elle d'argent public en ${a} ?`,
    `<p>En ${a}, l'État, la sécurité sociale, les collectivités locales et les opérateurs de l'État ont dépensé <strong>${md(D)}</strong>, soit ${pc(G.part_pib['dépenses'])} du PIB${provisoire ? " (comptes provisoires de l'Insee)" : ''}. Chaque euro n'est compté qu'une fois, chez l'administration qui le dépense en dernier : une dotation de l'État à une commune est comptée dans les dépenses de la commune.</p>`);

  if (detail) {
    const T = G.total_depenses, etat = G.secteurs.find(s => s.code === 'S13111');
    const secteurs = [...G.secteurs].sort((x, y) => y.total - x.total);
    ajouter(`Quelle différence entre le budget de l'État et les dépenses publiques ?`,
      `<p>Le budget de l'État, voté chaque année dans la loi de finances, ne couvre qu'une partie de l'argent public. En ${a}, l'État a dépensé ${md(etat.total)} (${pct(etat.total, T)} des dépenses publiques, hors sommes qu'il verse aux autres administrations). La sécurité sociale, dont le budget est voté à part dans la loi de financement de la sécurité sociale, en dépense davantage, et les collectivités locales votent leurs propres budgets. Les dépenses publiques réunissent toutes ces administrations : ${md(T)} en ${a}.</p>`);
    ajouter(`Qui dépense l'argent public ?`,
      `<p>${maj(liste(secteurs.map(s => `${NOMS[s.code]} ${md(s.total)}`)))}.</p>
${tableau(`Dépenses publiques par administration en ${a}`, ['Administration', "Milliards d'euros", 'Part'], secteurs.map(s => [s.nom, md(s.total), pct(s.total, T)]))}`);

    // Fonctions et sous-fonctions, toutes administrations réunies.
    const fonctions = new Map(), sous = new Map();
    for (const s of G.secteurs) for (const f of s.fonctions) {
      fonctions.set(f.code, { code: f.code, libelle: f.libelle, v: (fonctions.get(f.code)?.v || 0) + f.montant });
      for (const x of f.sous) sous.set(x.code, { libelle: x.libelle, v: (sous.get(x.code)?.v || 0) + x.montant });
    }
    const fs = [...fonctions.values()].sort((x, y) => y.v - x.v), ss = [...sous.values()].sort((x, y) => y.v - x.v);
    const f = c => fonctions.get(c)?.v || 0, s = c => sous.get(c)?.v || 0;
    ajouter(`Quel est le premier poste de dépense publique ? Combien coûtent les retraites ?`,
      `<p>Les retraites : les dépenses liées à la vieillesse atteignent <strong>${md(s('GF1002'))}</strong> en ${a}, ${pct(s('GF1002'), T)} des dépenses publiques. Avec la famille, le chômage, l'invalidité et la lutte contre la pauvreté, la protection sociale pèse ${md(f('GF10'))}, ${pct(f('GF10'), T)} du total. ${maj(liste(fs.slice(0, 5).map(x => `${FONCTIONS[x.code]} (${pct(x.v, T)})`)))} sont les cinq premières fonctions, les services généraux comprenant les intérêts de la dette.</p>
${tableau(`Dépenses publiques par fonction en ${a}`, ['Fonction', "Milliards d'euros", 'Part'], fs.map(x => [x.libelle, md(x.v), pct(x.v, T)]))}`);
    ajouter(`Combien coûtent la santé, l'école, la défense et la sécurité ?`,
      `<p>En ${a}, la santé représente ${md(f('GF07'))} de dépenses publiques (hôpitaux ${md(s('GF0703'))}, soins de ville ${md(s('GF0702'))}), l'enseignement ${md(f('GF09'))}, la défense ${md(f('GF02'))} et l'ordre et la sécurité (police, justice, prisons, pompiers) ${md(f('GF03'))}.</p>
${tableau(`Les 15 premiers postes de dépense publique en ${a}`, ['Poste', "Milliards d'euros"], ss.slice(0, 15).map(x => [x.libelle, md(x.v)]))}`);
    ajouter(`Combien coûte la dette publique ?`,
      `<p>Les opérations liées à la dette publique, pour l'essentiel ses intérêts, coûtent ${md(s('GF0107'))} en ${a}, ${pct(s('GF0107'), T)} des dépenses publiques, dont ${md(etat.fonctions.flatMap(x => x.sous).find(x => x.code === 'GF0107')?.montant || 0)} pour l'État. Le remboursement du capital emprunté n'est pas une dépense : une dette arrivée à échéance est en général refinancée par un nouvel emprunt.</p>`);
  }

  const rec = G.recettes.filter(r => r.montant > 0);
  const cot = rec.find(r => r.groupe === 'cotisations')?.montant || 0, impots = G.recettes.filter(r => r.groupe === 'production' || r.groupe === 'revenu').reduce((t, r) => t + r.montant, 0);
  ajouter(`D'où vient l'argent public ?`,
    `<p>En ${a}, les recettes publiques atteignent ${md(R)}, ${pc(G.part_pib.recettes)} du PIB : ${md(impots)} d'impôts, ${md(cot)} de cotisations sociales, et le reste en ventes de services (cantines, hôpitaux, péages), revenus du patrimoine et transferts. Il manque ${md(def)} pour couvrir les dépenses : ce déficit est financé par l'emprunt.</p>
${tableau(`Recettes publiques et déficit en ${a}`, ['Ressource', "Milliards d'euros", 'Part'], [...rec.map(r => [r.libelle, md(r.montant), pct(r.montant, R + def)]), ["Déficit, financé par l'emprunt", md(def), pct(def, R + def)]])}`);

  // Mêmes impôts que « Les 20 premiers prélèvements » de la page de pilotage.
  const imp = G.impots.filter(i => i.montant > 0 && !/^Cotisations sociales/.test(i.categorie || i.libelle) && (i.niveau === 2 || /TVA/.test(i.libelle)))
    .sort((x, y) => y.montant - x.montant);
  const trouve = re => imp.find(i => re.test(i.libelle))?.montant;
  const cite = [['la TVA', /TVA/], ['la CSG', /CSG/], ["l'impôt sur le revenu", /IRPP/], ["l'impôt sur les sociétés", /\(IS\)/], ['la taxe foncière', /^Taxe foncière/]]
    .map(([n, re]) => [n, trouve(re)]).filter(([, v]) => v > 0);
  ajouter(`Combien rapportent la TVA, la CSG et l'impôt sur le revenu ?`,
    `<p>En ${a}, ${liste(cite.map(([n, v]) => `${n} ${md(v)}`))}. L'impôt sur le revenu et l'impôt sur les sociétés sont comptés avant crédits d'impôt. Un même impôt finance souvent plusieurs administrations : la TVA va à l'État, à la sécurité sociale et aux collectivités.</p>
${tableau(`Les principaux impôts en ${a}`, ['Impôt', "Milliards d'euros"], imp.slice(0, 12).map(i => [sansCode(i.libelle), md(i.montant)]))}`);

  const serie = Object.entries(AN.deficit_pib || {}).filter(([x]) => +x <= a);
  const pire = serie.length ? serie.reduce((m, x) => x[1] > m[1] ? x : m) : null;
  ajouter(`Quel est le déficit public de la France en ${a} ?`,
    `<p>Le déficit public atteint <strong>${md(def)}</strong> en ${a}, soit ${pc(def / pib * 100)} du PIB${provisoire ? ' (comptes provisoires)' : ''}. ${serie.length > 1 ? `Il était de ${liste(serie.filter(([x]) => +x !== a).map(([x, v]) => `${pc(v)} en ${x}`))}${pire && +pire[0] !== a ? ` ; le plus haut, ${pc(pire[1])} en ${pire[0]}` : ''}. ` : ''}Les règles européennes visent un déficit inférieur à 3 % du PIB.</p>`);

  if (detail) {
    const c = G.secteurs.find(x => x.code === 'S1313');
    ajouter(`Pourquoi les collectivités dépensent-elles plus qu'elles ne lèvent d'impôts ?`,
      `<p>En ${a}, les collectivités locales dépensent ${md(c.total)} et lèvent ${md(c.recettes.impots)} d'impôts (taxe foncière, droits de mutation, part de TVA…). Le reste vient surtout des dotations versées par l'État, puis des ventes de services (cantines, transports, eau) ; elles n'empruntent que pour investir${c.recettes.solde < 0 ? ` (${md(-c.recettes.solde)} de déficit en ${a})` : ''}. Leurs dépenses sont comptées chez elles, pas dans le budget de l'État qui leur verse les dotations.</p>`);
  }

  ajouter(`D'où viennent ces chiffres ?`,
    `<p>Des comptes de la Nation de l'Insee (comptabilité nationale, base 2020), qui réunissent toutes les administrations publiques selon des règles communes à l'Union européenne. Les comptes des années récentes peuvent encore être révisés.${provisoire ? ` Pour ${a}, les comptes sont provisoires : la répartition des dépenses entre administrations et par fonction n'est pas encore publiée.` : ''}${ecart ? ` Pour ${a}, l'Insee publie deux totaux de dépenses qui ne concordent pas : ${md(G.total_depenses)} dans le tableau par fonction et ${md(D)} dans le tableau général.` : ''}</p>`);

  return Q.map(x => ({ ...x, texte: x.r.replace(/<table>[\s\S]*?<\/table>/g, '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() }));
}

// Questions en HTML : chaque question est un bloc repliable, la question en titre.
export const faqHtml = (Q, h = 3) => Q.map(({ q, r }) => `<details class="faq-q"><summary><h${h}>${esc(q)}</h${h}></summary>
<div class="faq-r">${r}</div></details>`).join('\n');

// Données structurées FAQPage (schema.org).
export const faqJsonLd = Q => ({ '@type': 'FAQPage', mainEntity: Q.map(({ q, texte }) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: texte } })) });
