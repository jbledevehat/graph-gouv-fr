// Fonctions communes aux tableaux de bord thématiques (pouvoir d'achat, santé, sécurité, école,
// écologie), utilisées à la fois à la construction (textes et cartes écrits dans les pages, lisibles
// sans JavaScript et par les moteurs de recherche) et dans les pages elles-mêmes (graphiques de
// enjeux/tableau.html).

export const ENJEUX = ['pouvoir-achat', 'sante', 'securite', 'ecole', 'ecologie'];

// Adresse de chaque tableau sur le site : un tableau par section, comme les autres ; l'école est
// une page de la section « Éducation et jeunesse », à côté du moral des jeunes.
export const ADRESSES = {
  'pouvoir-achat': { section: 'pouvoir-achat', page: 'tableau', chemin: 'pouvoir-achat/' },
  sante: { section: 'sante', page: 'tableau', chemin: 'sante/' },
  securite: { section: 'securite', page: 'tableau', chemin: 'securite/' },
  ecole: { section: 'jeunes', page: 'ecole', chemin: 'jeunes/ecole.html' },
  ecologie: { section: 'ecologie', page: 'tableau', chemin: 'ecologie/' },
};

// Couleur de chaque enjeu (palette du site, vérifiée pour les daltonismes), et sa variante pour le
// thème sombre, vérifiée contre le fond sombre.
export const SOMBRE = { '#EB6834': '#D95926', '#2A78D6': '#2F8FF0', '#4A3AA7': '#C060C8', '#1BAF7A': '#199E70', '#D99A00': '#C98500' };

export const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Nombre à la française, avec le nombre de décimales de l'indicateur.
export const nombre = (v, d = 0) => v == null ? '–'
  : v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/ /g, ' ').replace('-', '−');

// Valeur avec son unité : « 12,3 % », « 1 234 € », « 82,1 ans ».
export const valeur = (v, ind) => {
  if (v == null) return '–';
  const n = nombre(v, ind.decimales ?? 0);
  // Un indice s'affiche sans son unité (« indice, base 100 en 2015 »), rappelée sous le titre.
  return ind.unite === '%' ? n + '\u00a0%' : ind.unite && !ind.unite.startsWith('indice') ? n + '\u00a0' + ind.unite : n;
};

// Même valeur, l'unité en plus petit (chiffres clés) : « 268 400 logements ».
export const valeurHtml = (v, ind) => {
  const t = valeur(v, ind), n = nombre(v, ind.decimales ?? 0);
  return t.length > n.length && !['%', '€'].includes(ind.unite) ? (t.length - n.length > 12 ? `${n}<small class="u long">${esc(t.slice(n.length).trim())}</small>` : `${n}<small class="u">${esc(t.slice(n.length))}</small>`) : esc(t);
};

// Mode d'évolution d'un indicateur (champ « evolution » du fichier, sinon selon l'unité).
const ABSOLUES = ['%', 'ans', 'an', 'points', 'jours', 'mois', 'semaines', 'élèves', '‰'];
export const modeEvolution = ind => ind.evolution || (ABSOLUES.includes(ind.unite) ? 'absolue' : 'relative');

// L'axe vertical part de zéro, sauf pour une grandeur qui n'en approche jamais (une durée de vie, un
// score) ou si le fichier le demande (« axe_zero »: false) ; la page le signale alors.
export const axeResserre = ind => ind.axe_zero === false || (ind.axe_zero !== true && ['ans', 'points'].includes(ind.unite));

// Dernière valeur publiée de la première série, et point de départ de son évolution : la première
// année publiée après la dernière rupture de série (on ne compare pas à travers une rupture).
export function bilan(ind) {
  const s = ind.series[0], A = ind.annees;
  let k1 = -1;
  for (let k = A.length - 1; k >= 0; k--) if (s.valeurs[k] != null) { k1 = k; break; }
  if (k1 < 0) return null;
  const debut = Math.max(0, ...(ind.ruptures || []).map(r => A.findIndex(a => a >= r.annee)).filter(k => k >= 0 && k <= k1));
  let k0 = -1;
  for (let k = debut; k < k1; k++) if (s.valeurs[k] != null) { k0 = k; break; }
  const v1 = s.valeurs[k1], v0 = k0 >= 0 ? s.valeurs[k0] : null;
  // Évolution : en points pour un pourcentage, dans l'unité pour une durée ou un score, en
  // pourcentage sinon ; aucune pour un taux d'évolution (comparer deux croissances n'a pas de sens).
  const mode = modeEvolution(ind);
  const ecart = v0 == null || mode === 'aucune' ? null : mode === 'relative' ? (v0 !== 0 ? (v1 - v0) / Math.abs(v0) * 100 : null) : v1 - v0;
  // Favorable ou non, selon le sens souhaitable de l'indicateur ; un écart minime reste « stable ».
  const seuil = mode === 'relative' ? 1 : Math.max(10 ** -(ind.decimales ?? 1), Math.abs(v0 ?? 0) * 0.005);
  const sens = ecart == null || ind.sens === 'neutre' || !ind.sens || Math.abs(ecart) < seuil ? 'neutre'
    : (ecart < 0) === (ind.sens === 'baisse') ? 'mieux' : 'moins-bien';
  const suffixe = mode === 'relative' ? '\u00a0%' : ind.unite === '%' ? '\u00a0pt' : ind.unite ? '\u00a0' + ind.unite : '';
  return {
    annee: A[k1], valeur: v1, provisoire: (ind.provisoire || []).includes(A[k1]),
    depuis: k0 >= 0 ? A[k0] : null, ecart, sens,
    ecartTexte: ecart == null ? '' : (ecart > 0 ? '+' : ecart < 0 ? '−' : '')
      + nombre(Math.abs(ecart), mode === 'relative' ? (Math.abs(ecart) < 10 ? 1 : 0) : Math.max(1, ind.decimales ?? 1)) + suffixe,
  };
}

const FLECHE = { mieux: '▲', 'moins-bien': '▼', neutre: '■' };
const MOT = { mieux: 'évolution favorable', 'moins-bien': 'évolution défavorable', neutre: 'stable ou sans sens défini' };

// Chiffre clé d'un indicateur : dernière valeur, année, évolution depuis le début de la série.
export function chiffreCle(ind, { lien = '', classe = '' } = {}) {
  const b = bilan(ind);
  if (!b) return '';
  const evo = b.ecart != null ? `<small class="evo ${b.sens}" title="${MOT[b.sens]}"><span aria-hidden="true">${FLECHE[b.sens]}</span> ${b.ecartTexte} depuis ${b.depuis}<span class="sr"> (${MOT[b.sens]})</span></small>` : '';
  const titre = lien ? `<a href="${lien}">${esc(ind.libelle)}</a>` : esc(ind.libelle);
  // Plusieurs séries : le chiffre est celui de la première, nommée sous le libellé.
  const serie = ind.series.length > 1 ? `<span class="cle-serie">${esc(ind.series[0].nom)}</span>` : '';
  return `<div class="cle${classe ? ' ' + classe : ''}"><span class="cle-lib">${titre}</span>${serie}<b>${valeurHtml(b.valeur, ind)}</b><span class="cle-an">${b.annee}${b.provisoire ? ', provisoire' : ''}</span>${evo}</div>`;
}

// Carte d'un tableau de bord sur l'accueil, au même format que les autres (aperçu, sur-titre,
// titre, phrase, trois chiffres, liens) : l'aperçu est la courbe du premier chiffre clé.
export function porteAccueil(D, { chemin, liens = [['Le tableau de bord', chemin]], chiffres } = {}) {
  const cles = (D.cles || []).map(id => D.indicateurs.find(i => i.id === id)).filter(i => i && bilan(i));
  return `<div class="card door">
        <div class="visual" aria-hidden="true">${apercu(cles[0], D.couleur)}</div>
        <div class="body">
          <span class="eyebrow">${esc(D.eyebrow)}</span>
          <h3><a href="${chemin}">${esc(D.titre)}</a></h3>
          <p>${esc(D.presentation || D.besoin)}</p>
          <div class="figs">
            ${chiffres ?? cles.slice(0, 3).map(chiffreAccueil).join('\n            ')}
          </div>
          <div class="go">${liens.map(([t, h]) => `<a href="${h}">${esc(t)}</a>`).join('')}</div>
        </div>
      </div>`;
}

// Un chiffre de la carte : la valeur en grand, puis ce qu'elle mesure et son année.
export function chiffreAccueil(ind) {
  const b = bilan(ind);
  const n = nombre(b.valeur, ind.decimales ?? 0) + (ind.unite === '%' ? '\u00a0%' : '');
  let lib = ind.libelle_court || ind.libelle;
  if (!ind.libelle_court && ind.unite && ind.unite !== '%' && !lib.toLowerCase().includes(ind.unite.toLowerCase())) lib += `, en ${ind.unite}`;
  if (lib[1] && lib[1] === lib[1].toLowerCase()) lib = lib[0].toLowerCase() + lib.slice(1);
  return `<div><b>${n}</b><span>${esc(lib)} (${b.annee}${b.provisoire ? ', provisoire' : ''})</span></div>`;
}

// Aperçu décoratif : la courbe d'un indicateur depuis 2010, dans le cadre des autres aperçus.
function apercu(ind, couleur) {
  if (!ind) return '';
  const s = ind.series[0].valeurs, A = ind.annees;
  const pts = A.map((a, k) => [a, s[k]]).filter(([a, v]) => v != null && a >= 2010);
  // Échelle resserrée sur la série, comme l'aperçu du moral des jeunes : c'est un motif, pas un graphique.
  const vs = pts.map(p => p[1]), lo = Math.min(...vs), hi = Math.max(...vs);
  const x = a => 20 + (a - pts[0][0]) / ((pts[pts.length - 1][0] - pts[0][0]) || 1) * 260;
  const y = v => 115 - (v - lo) / ((hi - lo) || 1) * 90;
  const p = pts.map(([a, v]) => `${x(a).toFixed(0)},${y(v).toFixed(0)}`).join(' ');
  return `<svg class="courbes" viewBox="0 0 300 150" preserveAspectRatio="none" style="--c:${couleur};--c-sombre:${SOMBRE[couleur] || couleur}"><line x1="20" x2="280" y1="130" y2="130"/><polyline class="t" points="${p}"/></svg>`;
}

// Textes d'une page de sujet, écrits dans le gabarit à la construction.
export function textesPage(D) {
  const ancre = id => `#i-${id}`;
  const essentiel = D.essentiel.map(e => `<li class="card"><b>${esc(e.titre)}</b><span>${esc(e.texte)}${e.indicateur ? ` <a href="${ancre(e.indicateur)}">Voir le chiffre</a>` : ''}</span></li>`).join('\n      ');
  const idees = D.idees_recues.map(e => `<article class="card idee"><p class="affirmation">${esc(e.affirmation)}</p><p class="reponse"><b>Ce que disent les chiffres.</b> ${esc(e.reponse)}</p>${e.indicateur ? `<a class="idee-lien" href="${ancre(e.indicateur)}">Voir l'indicateur</a>` : ''}</article>`).join('\n      ');
  const questions = D.questions_candidats.map(q => `<li>${esc(q)}</li>`).join('\n        ');
  return { essentiel, idees, questions };
}
