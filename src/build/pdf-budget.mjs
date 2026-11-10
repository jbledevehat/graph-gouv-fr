// Exploration du budget en PDF vectoriel, un fichier par année, par regroupement (dépenses par
// administration ou par fonction, recettes par administration ou par type) et par représentation :
//   en blocs : out/web/budget/pdf/argent-public-AAAA-<dépenses>-<recettes>.pdf ;
//   en flux :  out/web/budget/pdf/argent-public-AAAA-<dépenses>-<recettes>-flux.pdf.
// Même composition que la page web : ce qui finance la dépense à gauche, les dépenses à droite, le
// bloc central (recettes et déficit, puis dépenses publiques) au milieu, estimations sur les côtés
// des blocs ; même échelle pour toutes les années, tous les noms et montants écrits (lisibles en
// zoomant), texte cherchable. Couleurs du thème clair, adaptées à l'impression.
import { createWriteStream, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import PDFDocument from 'pdfkit';
import { path } from '../context.mjs';
import { arbresArgentPublic } from '../../budget/arbres.js';

const INK = '#162033', MUTED = '#5A6579', PAPER = '#FFFFFF', LINE = '#D6DCE6';
const COULEURS = { etat: '#2A78D6', secu: '#4A3AA7', coll: '#D99A00', op: '#1BAF7A', na: '#DDE2EA', hatch: '#7C8699', total: '#AEB7C4', dep: '#2B3547' };
const ENCRE = { etat: '#FFFFFF', secu: '#FFFFFF', coll: INK, op: INK, na: INK, hatch: INK, total: INK, dep: '#FFFFFF' };
// Gris des rubans et des blocs sans administration dans le flux : plus soutenu, comme sur la page.
const FX_NA = '#6B7587';
const CHAR = 0.55; // largeur moyenne d'un caractère d'IBM Plex Sans, en em
// Police du site (IBM Plex Sans, licence SIL OFL, src/build/polices/) : elle a le signe €, les
// espaces fines et les accents, mal rendus par les polices de base des PDF.
const POLICE = path('src/build/polices/ibm-plex-sans-latin-400.woff'), POLICE_GRAS = path('src/build/polices/ibm-plex-sans-latin-700.woff');
// Même géométrie que la page (disposition côte à côte), en points PDF ; bloc central de deux barres
// d'épaisseur BARRE, séparées de JOINT, à MARGE_C des moitiés.
const TETE = 70, HAUT_PAGE = 300, BAS_PAGE = 160;
const BARRE = 90, JOINT = 10, MARGE_C = 40, CENTRE = 2 * BARRE + JOINT + 2 * MARGE_C;
const ZONES = [{ x: 320, y: TETE, w: 982, h: 1190 }, { x: 1302 + CENTRE, y: TETE, w: 982, h: 1190 }];
const COLONNES = [{ x: 0, y: TETE, w: 280, h: 1190 }, { x: 2324 + CENTRE, y: TETE, w: 280, h: 1190 }];
const LARGEUR = 2604 + CENTRE + 2 * 60, HAUTEUR = 1260 + HAUT_PAGE + 40 + BAS_PAGE;
// Vue en flux : mêmes colonnes que la page (abscisses du bloc central vers l'extérieur).
const FLUX = { W: 3200, TOP: 150, NW: 18, NIV: 3, RESERVE: 420, H: 2150,
  rec: [1230, 860, 520], dep: [1860, 2240, 2620], centre: 1460, freres: [0, 16, 6, 2.2], cousins: [0, 16, 16, 9] };
const ESPACES = [0, 7, 2.2, 0.6];

const sum = (l, f) => l.reduce((s, x) => s + (f(x) || 0), 0);
const nf = (v, d = 1) => v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/ /g, ' ');
const mds = v => v >= 1 ? nf(v, v >= 100 ? 0 : 1) + ' Md€' : Math.round(v * 1000).toLocaleString('fr-FR').replace(/ /g, ' ') + ' M€';
const fourchette = (b, h) => {
  const f = v => v < 1 ? Math.round(v * 1000) + ' M€' : nf(v, 1) + ' Md€';
  return b === h ? 'env. ' + f(b) : (b < 1) === (h < 1) ? `${f(b).replace(/ M?d?€$/, '')} à ${f(h)}` : `${f(b)} à ${f(h)}`;
};

// Blocs rangés selon leur montant de l'année de référence, comme sur la page : d'une année à
// l'autre, chacun reste à sa place (rempli pour chaque PDF par writeBudgetPdf).
let REF = new Map();
const rang = d => REF.get(d.id) ?? d.v;

// Treemap « squarified », comme sur la page.
function squarify(items, x, y, w, h) {
  if (!(w > 0 && h > 0)) return items.filter(d => d.v > 0).map(d => [d, x, y, 0, 0]);
  const tot = sum(items, d => d.v);
  const q = items.filter(d => d.v > 0).map(d => ({ d, a: d.v / tot * w * h })).sort((a, b) => rang(b.d) - rang(a.d));
  const out = [];
  const worst = (row, s) => { const t = sum(row, r => r.a), mx = Math.max(...row.map(r => r.a)), mn = Math.min(...row.map(r => r.a)); return Math.max(s * s * mx / (t * t), t * t / (s * s * mn)); };
  const place = row => {
    const t = sum(row, r => r.a);
    if (w >= h) { const cw = t / h; let yy = y; for (const r of row) { const hh = r.a / cw; out.push([r.d, x, yy, cw, hh]); yy += hh; } x += cw; w -= cw; }
    else { const rh = t / w; let xx = x; for (const r of row) { const ww = r.a / rh; out.push([r.d, xx, y, ww, rh]); xx += ww; } y += rh; h -= rh; }
  };
  let row = [];
  while (q.length) { const s = Math.min(w, h); if (!row.length || worst([...row, q[0]], s) <= worst(row, s)) row.push(q.shift()); else { place(row); row = []; } }
  if (row.length) place(row);
  return out;
}
function placer(n, x, y, w, h, depth = 0) {
  Object.assign(n, { x, y, w, h, depth });
  if (!n.children?.length) return;
  const g = ESPACES[depth + 1] || 0.4;
  for (const [c, cx, cy, cw, ch] of squarify(n.children, x, y, w, h)) { c.parent = n; placer(c, cx + g / 2, cy + g / 2, Math.max(0, cw - g), Math.max(0, ch - g), depth + 1); }
}

// Arbres des deux moitiés, selon le regroupement choisi : ceux de la page (budget/arbres.js).
export const REGROUPEMENTS = { depenses: ['administration', 'fonction'], recettes: ['administration', 'type'] };
function arbres(G, modeDep, modeRec) {
  return arbresArgentPublic(G, {}, modeDep === 'administration' ? 'admin' : 'fonction', modeRec === 'administration' ? 'admin' : 'type');
}

// Estimation pour l'année : celle de l'année si elle existe, sinon la plus proche (décalée).
function pourAnnee(p, annee) {
  const bornes = a => { const x = (String(a).match(/\d{4}/g) || []).map(Number); return [Math.min(...x), Math.max(...x)]; };
  const y = +annee;
  const c = [p, ...(p.serie || [])].map(e => ({ e, b: bornes(e.annee) }))
    .map(o => ({ ...o, d: y < o.b[0] ? o.b[0] - y : y > o.b[1] ? y - o.b[1] : 0 }))
    .sort((u, v) => u.d - v.d || v.b[1] - u.b[1])[0];
  return { ...p, ...c.e, decale: c.d > 0 };
}

// Texte sur une ligne, réduit pour tenir dans la largeur ; renvoie la taille utilisée (0 si rien).
function ligne(doc, texte, x, y, largeur, taille, { gras = false, couleur = INK, min = 1.6 } = {}) {
  const t = Math.min(taille, largeur / (Math.max(texte.length, 1) * CHAR));
  if (t < min) return 0;
  doc.font(gras ? 'Plex-Gras' : 'Plex').fontSize(t).fillColor(couleur).text(texte, x, y, { lineBreak: false });
  return t;
}

// Rectangle hachuré (déficit), comme sur la page.
function hachurer(doc, x, y, w, h) {
  doc.rect(x, y, w, h).fill(PAPER);
  doc.save().rect(x, y, w, h).clip();
  for (let k = -h; k < w; k += 9) doc.moveTo(x + k, y + h).lineTo(x + k + h, y).lineWidth(3).strokeColor(COULEURS.hatch).stroke();
  doc.restore();
}

// Bloc central : une barre partagée entre recettes (en haut) et déficit (en bas), collée à la barre
// des dépenses publiques, de même longueur ; textes écrits le long des barres ; le total au-dessus.
// haut : distance entre le haut des barres et celui du total (plus grande quand une ligne de titres les sépare).
function dessinerCentre(doc, G, x, y, long, haut = 82) {
  const R = G.total_recettes, def = -G.solde, T = R + def, a = long * R / T;
  const parts = [['RECETTES', R, 'total', x, y, a], ['DÉFICIT', def, 'hatch', x, y + a, long - a], ['DÉPENSES PUBLIQUES', T, 'dep', x + BARRE + JOINT, y, long]];
  for (const [nom, v, c, bx, by, bh] of parts) {
    if (c === 'hatch') hachurer(doc, bx, by, BARRE, bh); else doc.rect(bx, by, BARRE, bh).fill(COULEURS[c]);
    doc.rect(bx, by, BARRE, bh).lineWidth(1).strokeColor(PAPER).stroke();
    doc.font('Plex-Gras').fontSize(30);
    const txt = [`${nom} · ${mds(v)}`, mds(v)].find(t => doc.widthOfString(t) <= bh - 16);
    if (!txt) continue;
    const w = doc.widthOfString(txt);
    doc.save().translate(bx + BARRE / 2, by + bh / 2).rotate(-90);
    if (c === 'hatch') doc.rect(-w / 2 - 6, -20, w + 12, 40).fill(PAPER);
    doc.fillColor(ENCRE[c]).text(txt, -w / 2, -18, { lineBreak: false });
    doc.restore();
  }
  doc.font('Plex-Gras').fontSize(60).fillColor(INK);
  const tt = mds(T), w = doc.widthOfString(tt);
  doc.text(tt, x + BARRE + JOINT / 2 - w / 2, y - haut, { lineBreak: false });
}

function dessinerArbre(doc, racine) {
  const noeuds = [];
  const parcourir = n => { if (n.x === undefined) return; noeuds.push(n); (n.children || []).forEach(parcourir); };
  parcourir(racine);
  for (const n of noeuds) {
    if (!n.depth || n.children?.length) continue;
    if (n.color === 'hatch') hachurer(doc, n.x, n.y, n.w, n.h); else doc.rect(n.x, n.y, n.w, n.h).fill(COULEURS[n.color]);
    doc.rect(n.x, n.y, n.w, n.h).lineWidth(0.4).strokeColor(PAPER).stroke();
    etiqueterBloc(doc, n);
  }
}

// Coupe un texte en lignes d'une largeur donnée, à la taille donnée.
function couper(doc, texte, police, taille, largeur) {
  doc.font(police).fontSize(taille);
  const lignes = [];
  let cour = '';
  for (const mot of texte.split(' ')) {
    const essai = cour ? cour + ' ' + mot : mot;
    if (doc.widthOfString(essai) <= largeur || !cour) cour = essai; else { lignes.push(cour); cour = mot; }
  }
  if (cour) lignes.push(cour);
  return lignes.every(l => doc.widthOfString(l) <= largeur) ? lignes : null;
}

// Tous les textes d'un bloc, sans taille minimale (le PDF est vectoriel : on zoome) : son nom,
// replié sur plusieurs lignes, son montant, et ce dont il fait partie (fonction, administration).
// Dans un bloc haut et étroit, le texte est écrit verticalement.
function etiqueterBloc(doc, n) {
  const vertical = n.h > n.w * 1.8;
  const L = vertical ? n.h : n.w, H = vertical ? n.w : n.h;
  const pad = Math.min(6, L * 0.05, H * 0.08);
  const contexte = []; for (let p = n.parent; p && p.parent; p = p.parent) contexte.push(p.label);
  const textes = [[n.label, 'Plex-Gras', 1], [mds(n.v), 'Plex', 0.85], ...(contexte.length ? [[contexte.join(' · '), 'Plex', 0.7]] : [])];
  // Plus grande taille (au plus 15 pt) qui fait tout tenir.
  // Les grands blocs en grand (jusqu'à 30 pt), les petits aussi petit qu'il le faut.
  let taille = Math.min(30, H / 2.2), mise = null;
  for (; taille > 0.15; taille *= 0.92) {
    const blocs = textes.map(([t, police, f]) => ({ police, taille: taille * f, lignes: couper(doc, t, police, taille * f, L - 2 * pad) }));
    if (blocs.some(b => !b.lignes)) continue;
    const hauteur = blocs.reduce((s, b) => s + b.lignes.length * b.taille * 1.2, 0) + taille * 0.15;
    if (hauteur <= H - 2 * pad) { mise = blocs; break; }
  }
  if (!mise) return;
  const encre = ENCRE[n.color];
  doc.save();
  if (vertical) doc.translate(n.x + pad, n.y + n.h - pad).rotate(-90);
  else doc.translate(n.x + pad, n.y + pad);
  let y = 0;
  mise.forEach((b, i) => {
    doc.font(b.police).fontSize(b.taille).fillColor(encre).opacity(i === 2 ? 0.75 : 1);
    for (const l of b.lignes) { doc.text(l, 0, y, { lineBreak: false }); y += b.taille * 1.2; }
    if (i === 0) y += taille * 0.15;
  });
  doc.restore();
}

function dessinerEstimations(doc, E, annee, aire) {
  [[E.non_percu_recettes, COLONNES[0]], [E.non_percu_aides, COLONNES[1]]].forEach(([c, col]) => {
    const postes = c.postes.map(p => pourAnnee(p, annee)).sort((p, q) => q.haut - p.haut);
    const env = c.enveloppe && pourAnnee(c.enveloppe, annee);
    ligne(doc, c.titre, col.x + 6, col.y, col.w - 12, 22, { gras: true });
    ligne(doc, `${c.sous_titre} · ${fourchette(sum(postes, p => p.bas), sum(postes, p => p.haut))}`, col.x + 6, col.y + 28, col.w - 12, 13, { couleur: MUTED });
    let y = col.y + 50;
    const cercle = (p, cx, R, r, enveloppe) => {
      const cy = y + R;
      doc.save().opacity(p.decale ? 0.5 : 1);
      if (enveloppe) {
        doc.circle(cx, cy, R).lineWidth(1.4).dash(0.6, { space: 4 }).strokeColor(INK).stroke().undash();
        doc.circle(cx, cy, r).lineWidth(1).dash(0.6, { space: 4 }).strokeColor(INK).stroke().undash();
      } else {
        if (R > r + 0.5) doc.circle(cx, cy, R).lineWidth(1).dash(3, { space: 2.5 }).strokeColor(INK).stroke().undash();
        doc.circle(cx, cy, r).fillOpacity(0.7).fillAndStroke(COULEURS.hatch, INK);
      }
      doc.restore();
      const t = ligne(doc, p.court || p.label, col.x + 6, cy + R + 5, col.w - 12, 11, { gras: true });
      ligne(doc, `${fourchette(p.bas, p.haut)} · ${p.decale ? 'estimation de ' : ''}${p.annee}`, col.x + 6, cy + R + 5 + (t || 9) * 1.25, col.w - 12, 8.5, { couleur: MUTED });
      y = cy + R + 40;
    };
    if (env) cercle(env, col.x + col.w / 2, Math.sqrt(env.haut * aire / Math.PI), Math.sqrt(env.bas * aire / Math.PI), true);
    for (const p of postes) {
      const R = Math.sqrt(p.haut * aire / Math.PI), r = Math.sqrt(p.bas * aire / Math.PI);
      cercle(p, col.x + 12 + R, R, r, false);
    }
  });
}

// Comment chaque administration finance ses dépenses, comme sur la page : ressources propres (impôts,
// cotisations, emprunt, moins l'excédent), ce que l'État lui verse (d'après son budget, quand il est
// disponible) et le reste, autres recettes et transferts ; l'État garde ce qu'il ne reverse pas.
function financement(G, etat) {
  if (G.depenses_detaillees === false) return null;
  const direct = {};
  if (etat) {
    const PB = etat.BE.programmes.filter(p => p.programme !== '200');
    const cat = ks => sum(PB, p => sum(ks, c => etat.DE.programmes[p.programme]?.categories?.[c])) / 1000;
    direct.S1313 = cat(['63']) - etat.BE.recettes.sections.find(x => x.section.startsWith('31')).net / 1000;
    direct.S1314 = cat(['64']);
    direct.S13112 = cat(['32', '53']);
  }
  const propres = s => s.recettes.impots + s.recettes.cotisations + Math.max(0, -s.recettes.solde) - Math.max(0, s.recettes.solde);
  const res = {}; let verse = 0;
  for (const s of G.secteurs) if (s.code !== 'S13111') {
    const propre = Math.max(0, Math.min(propres(s), s.total)), parEtat = Math.max(0, Math.min(direct[s.code] || 0, s.total - propre));
    res[s.code] = { propre, etat: parEtat, autres: s.total - propre - parEtat };
    verse += parEtat;
  }
  const e = G.secteurs.find(s => s.code === 'S13111'), propre = Math.max(0, Math.min(propres(e) - verse, e.total));
  res.S13111 = { propre, etat: 0, autres: e.total - propre };
  return res;
}
// Décalage des colonnes des dépenses quand l'étape du financement est dessinée.
const FIN = 400;

// Vue en flux, comme sur la page : les mêmes arbres, recettes de leur détail (à gauche) jusqu'au bloc
// central, dépenses du bloc central jusqu'à leur détail (à droite).
function dessinerFlux(doc, G, AN, modeDep, modeRec, etat, annee) {
  // Pas d'étape du financement pour une année provisoire (dépenses pas encore réparties).
  const avecFin = modeDep === 'administration' && G.depenses_detaillees !== false, DEP = avecFin ? FLUX.dep.map(x => x + FIN) : FLUX.dep, W = FLUX.W + (avecFin ? FIN : 0);
  const { TOP, NW } = FLUX, LC = 2 * BARRE + JOINT, k = (FLUX.H - TOP - 20 - FLUX.RESERVE) / AN.echelle.insee_md;
  const fin = n => /^r-deficit/.test(n.id) ? 2 : /^r-autres/.test(n.id) ? 1 : 0;
  const enfants = n => (n.children || []).filter(c => c.v > 0).sort((a, b) => fin(a) - fin(b) || rang(b) - rang(a));
  const racines = arbres(G, modeDep, modeRec).reverse(), noeuds = [], liens = [];
  for (const r of racines) {
    const cote = r.id === 'rec' ? FLUX.rec : DEP;
    Object.assign(r, { x: FLUX.centre, y: TOP, w: LC, h: r.v * k, depth: 0, cote: r.id });
    let niveau = [r];
    for (let d = 1; d <= FLUX.NIV && niveau.length; d++) {
      let y = TOP, prec = null; const suivant = [];
      for (const p of niveau) {
        let o = p.y;
        for (const c of enfants(p)) {
          if (prec) y += prec.parent === p ? FLUX.freres[d] : FLUX.cousins[d];
          Object.assign(c, { x: cote[d - 1], y, w: NW, h: c.v * k, depth: d, parent: p, cote: r.id });
          liens.push({ c, p, yp: o }); o += c.h; y += c.h; prec = c;
          noeuds.push(c); suivant.push(c);
        }
      }
      niveau = suivant;
    }
  }
  const teinte = n => n.color === 'na' ? FX_NA : COULEURS[n.color];
  const ruban = (xa, ya, xb, yb, w, couleur) => { const mx = (xa + xb) / 2;
    doc.save().moveTo(xa, ya).bezierCurveTo(mx, ya, mx, yb, xb, yb).lineTo(xb, yb + w).bezierCurveTo(mx, yb + w, mx, ya + w, xa, ya + w).closePath()
      .fillOpacity(0.55).fill(couleur).restore(); };
  // Financement de chaque administration, entre le bloc central et ce qu'elle dépense.
  const rd = racines.find(r => r.id === 'dep'), fins = [];
  if (avecFin) {
    const F = financement(G, etat), NOMS = { propre: 'Ressources propres', etat: "Versé par l'État", autres: 'Autres recettes et transferts' };
    let y = TOP, oC = rd.y, prec = null;
    for (const a of enfants(rd)) {
      const parts = F[a.secteur]; if (!parts) continue;
      let oA = a.y;
      for (const cle of ['propre', 'etat', 'autres']) {
        const v = parts[cle]; if (!(v > 0.0005)) continue;
        if (prec) y += prec.cible === a ? 4 : 14;
        const n = { label: NOMS[cle], v, cible: a, cote: 'dep', depth: 0.5, color: cle === 'propre' ? a.color : cle === 'etat' ? 'etat' : 'na', x: FLUX.dep[0], y, w: NW, h: v * k };
        ruban(rd.x + rd.w, oC, n.x, n.y, n.h, teinte(n)); ruban(n.x + n.w, n.y, a.x, oA, n.h, teinte(n));
        oC += n.h; oA += n.h; y += n.h; prec = n; fins.push(n);
      }
    }
  }
  // Rubans translucides, de la couleur du bloc le plus fin ; avec le financement, le bloc central ne va
  // plus directement à chaque administration.
  for (const { c, p, yp } of liens) {
    if (avecFin && p === rd) continue;
    const [xa, ya, xb, yb] = c.cote === 'rec' ? [c.x + c.w, c.y, p.x, yp] : [p.x + p.w, yp, c.x, c.y];
    ruban(xa, ya, xb, yb, c.h, teinte(c));
  }
  for (const n of [...noeuds, ...fins]) {
    if (n.color === 'hatch') hachurer(doc, n.x, n.y, n.w, Math.max(0.5, n.h)); else doc.rect(n.x, n.y, n.w, Math.max(0.5, n.h)).fill(teinte(n));
    // Nom et montant sur une ligne, à gauche des recettes, à droite des dépenses, réduits pour tenir
    // jusqu'à la colonne voisine (le PDF est vectoriel : on zoome).
    const gauche = n.cote === 'rec', cols = gauche ? FLUX.rec : DEP;
    const place = gauche ? n.x - (cols[n.depth] !== undefined ? cols[n.depth] + NW : 0) - 12 : (n.depth === 0.5 ? DEP[0] : cols[n.depth] ?? W) - n.x - n.w - 12;
    const txt = `${n.label} · ${mds(n.v)}`;
    // Les grands ensembles en grand, le détail plus petit (on zoome dans le PDF).
    const max = n.depth === 1 ? 30 : n.depth === 0.5 || n.depth === 2 ? 22 : 15;
    const t = Math.min(max, n.h * 0.8 + 1.2, place / (Math.max(txt.length, 1) * CHAR));
    if (t < 0.8) continue;
    doc.font('Plex-Gras').fontSize(t);
    const w = doc.widthOfString(txt), x = gauche ? n.x - 6 - w : n.x + n.w + 6;
    doc.fillColor(INK).text(txt, x, n.y + n.h / 2 - t * 0.6, { lineBreak: false });
  }
  dessinerCentre(doc, G, FLUX.centre, TOP, Math.max(...racines.map(r => r.h)));
  ligne(doc, 'Recettes et emprunt', 20, TOP - 110, 700, 38, { gras: true });
  ligne(doc, 'Dépenses', FLUX.dep[0], TOP - 110, 700, 38, { gras: true });
}

export async function writeBudgetPdf(G, E, AN, annee, file, modeDep = 'administration', modeRec = 'administration', vue = 'blocs') {
  mkdirSync(dirname(path(file)), { recursive: true });
  const GREF = JSON.parse(readFileSync(path(`budget/donnees/argent-public-${AN.reference}.json`), 'utf8'));
  REF = new Map();
  const tour = n => { REF.set(n.id, n.v); (n.children || []).forEach(tour); };
  arbres(GREF, modeDep, modeRec).forEach(tour);
  const flux = vue === 'flux', fin = flux && modeDep === 'administration' && G.depenses_detaillees !== false;
  const largeur = flux ? FLUX.W + (fin ? FIN : 0) + 120 : LARGEUR, hauteur = flux ? HAUT_PAGE + FLUX.H + 100 + BAS_PAGE : HAUTEUR;
  // Budget de l'État de l'année (ses versements aux autres administrations), pour le financement du flux.
  const lire = n => { try { return JSON.parse(readFileSync(path(`budget/donnees/${n}-etat-${annee}.json`), 'utf8')); } catch (e) { return null; } };
  const etat = fin && (AN.etat || []).includes(annee) ? { BE: lire('budget'), DE: lire('detail') } : null;
  const doc = new PDFDocument({
    size: [largeur, hauteur], margin: 0, compress: true, lang: 'fr-FR', displayTitle: true,
    info: {
      Title: `L'argent public en ${annee}${flux ? ', en flux' : ''} : recettes par ${modeRec === 'type' ? 'type' : 'administration'}, dépenses par ${modeDep}`,
      Author: 'Jean-Baptiste Le Dévéhat',
      Subject: `Dépenses et recettes des administrations publiques françaises en ${annee}, à la même échelle pour toutes les années`,
      Keywords: 'budget, dépenses publiques, recettes publiques, impôts, sécurité sociale, collectivités, Insee',
    },
  });
  doc.registerFont('Plex', POLICE).registerFont('Plex-Gras', POLICE_GRAS);
  const fini = new Promise((resolve, reject) => {
    const out = createWriteStream(path(file));
    out.on('finish', resolve).on('error', reject);
    doc.pipe(out);
  });
  doc.rect(0, 0, largeur, hauteur).fill(PAPER);
  // En-tête.
  const D = G.total_depenses, R = G.total_recettes, S = G.solde;
  const provisoire = G.depenses_detaillees === false;
  doc.font('Plex-Gras').fontSize(68).fillColor(INK).text(`L'argent public en ${annee}${provisoire ? ' (comptes provisoires)' : ''}`, 60, 46, { lineBreak: false });
  doc.font('Plex').fontSize(30).fillColor(MUTED).text(
    `${mds(R)} de recettes et ${mds(-S)} de déficit, couvert par l'emprunt, qui financent ${mds(D)} de dépenses publiques (État, sécurité sociale, collectivités locales, opérateurs de l'État).`,
    60, 128, { width: largeur - 120 });
  doc.font('Plex-Gras').fontSize(22).fillColor(INK).text(`Recettes regroupées par ${modeRec === 'type' ? 'type de recette (impôt par impôt)' : 'administration'} · dépenses regroupées par ${modeDep}`, 60, 186, { lineBreak: false });
  const plus = AN.echelle.insee_md.toLocaleString('fr-FR', { maximumFractionDigits: 0 }).replace(/ /g, ' ');
  doc.font('Plex').fontSize(19).fillColor(MUTED).text(flux
    ? `Chaque ruban est à l'échelle de son montant, la même pour toutes les années (la plus grande, ${plus} Md€, remplit la hauteur). Au centre, les recettes et le déficit font ensemble la dépense publique.${fin ? ` Avant les dépenses, pour chaque administration : ses ressources propres, ce que l'État lui verse${etat ? ` (budget de l'État ${annee})` : ''} et les autres recettes et transferts.` : ''}`
    : `Surfaces proportionnelles aux montants, à la même échelle pour toutes les années (la plus grande, ${plus} Md€, remplit la zone). Au centre, les recettes et le déficit font ensemble la dépense publique. Sur les côtés, en cercles : des estimations, pas des comptes (cercle atténué : estimation d'une autre année).`, 60, 222, { width: largeur - 120 });

  if (flux) {
    doc.save().translate(60, HAUT_PAGE - FLUX.TOP + 150);
    dessinerFlux(doc, G, AN, modeDep, modeRec, etat, annee);
    doc.restore();
  } else {
  doc.save().translate(60, HAUT_PAGE - TETE + 90);
  // Recettes à gauche, dépenses à droite, comme sur la page.
  const racines = arbres(G, modeDep, modeRec).reverse();
  racines.forEach((r, i) => {
    const z = ZONES[i], f = Math.sqrt(r.v / AN.echelle.insee_md), w = z.w * f, h = z.h * f;
    const x = i === 0 ? z.x + z.w - w : z.x;
    placer(r, x, z.y, w, h);
    // Le montant n'est écrit qu'une fois, sur le bloc central.
    ligne(doc, r.label, x, z.y - 46, Math.max(w, 400), 36, { gras: true });
    dessinerArbre(doc, r);
  });
  dessinerCentre(doc, G, racines[0].x + racines[0].w + MARGE_C, TETE, Math.max(...racines.map(r => r.h)), 128);
  // Échelle des estimations : surface réelle des blocs de dépenses, par milliard.
  const feuilles = [];
  const f = n => (n.children?.length ? n.children.forEach(f) : n.x !== undefined && feuilles.push(n));
  f(racines.find(r => r.id === 'dep'));
  dessinerEstimations(doc, E, annee, sum(feuilles, n => n.w * n.h) / D);
  doc.restore();
  }

  // Légende et sources.
  let lx = 60;
  const ly = hauteur - 110;
  for (const [c, l] of [['etat', 'État'], ['secu', 'Sécurité sociale'], ['coll', 'Collectivités locales'], ['op', "Opérateurs de l'État"], ['na', modeRec === 'type' ? 'Recettes par type, toutes administrations' : 'Autres recettes'], ['hatch', 'Déficit (emprunt)']]) {
    doc.rect(lx, ly, 24, 24).fill(flux && c === 'na' ? FX_NA : COULEURS[c]);
    doc.font('Plex').fontSize(22).fillColor(INK).text(l, lx + 32, ly + 1, { lineBreak: false });
    lx += 60 + doc.widthOfString(l);
  }
  // Auteur, à droite de la légende.
  doc.font('Plex-Gras').fontSize(22).fillColor(INK);
  const auteur = 'Conçu par Jean-Baptiste Le Dévéhat';
  doc.text(auteur, largeur - 60 - doc.widthOfString(auteur), ly + 1, { lineBreak: false });
  doc.font('Plex').fontSize(17).fillColor(MUTED).text(
    "Sources : Insee, comptes de la Nation (base 2020) ; estimations : HCFiPS, DGFiP, Conseil d'analyse économique, CEPII, DREES, Cour des comptes. Détail, explications et données ouvertes : gouvfr.jbledevehat.fr/budget/ · Proposition indépendante, ce n'est pas un document officiel.",
    60, ly + 44, { width: largeur - 120 });
  doc.lineWidth(1).strokeColor(LINE);
  doc.end();
  await fini;
}
