// Exploration du budget en PDF vectoriel, un fichier par année et par regroupement, comme sur la
// page : dépenses par administration ou par fonction, recettes par administration ou par type
// (out/web/budget/pdf/argent-public-AAAA-<dépenses>-<recettes>.pdf) : même composition que la page web (dépenses à
// gauche, ce qui les finance à droite, estimations sur les côtés), même échelle pour toutes les
// années, tous les noms et montants écrits (lisibles en zoomant), texte cherchable. Couleurs du
// thème clair, adaptées à l'impression.
import { createWriteStream, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import PDFDocument from 'pdfkit';
import { path } from '../context.mjs';
import { arbresArgentPublic } from '../../budget/arbres.js';

const INK = '#162033', MUTED = '#5A6579', PAPER = '#FFFFFF', LINE = '#D6DCE6';
const COULEURS = { etat: '#2A78D6', secu: '#4A3AA7', coll: '#D99A00', op: '#1BAF7A', na: '#DDE2EA', hatch: '#7C8699' };
const ENCRE = { etat: '#FFFFFF', secu: '#FFFFFF', coll: INK, op: INK, na: INK, hatch: INK };
const CHAR = 0.55; // largeur moyenne d'un caractère d'IBM Plex Sans, en em
// Police du site (IBM Plex Sans, licence SIL OFL, src/build/polices/) : elle a le signe €, les
// espaces fines et les accents, mal rendus par les polices de base des PDF.
const POLICE = path('src/build/polices/ibm-plex-sans-latin-400.woff'), POLICE_GRAS = path('src/build/polices/ibm-plex-sans-latin-700.woff');
// Même géométrie que la page (disposition côte à côte), en points PDF.
const TETE = 70, HAUT_PAGE = 230;
const ZONES = [{ x: 320, y: TETE, w: 982, h: 1190 }, { x: 1338, y: TETE, w: 982, h: 1190 }];
const COLONNES = [{ x: 0, y: TETE, w: 280, h: 1190 }, { x: 2360, y: TETE, w: 280, h: 1190 }];
const LARGEUR = 2640 + 2 * 60, HAUTEUR = 1260 + HAUT_PAGE + 120;
const ESPACES = [0, 7, 2.2, 0.6];

const sum = (l, f) => l.reduce((s, x) => s + (f(x) || 0), 0);
const nf = (v, d = 1) => v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/ /g, ' ');
const mds = v => v >= 1 ? nf(v, v >= 100 ? 0 : 1) + ' Md€' : Math.round(v * 1000).toLocaleString('fr-FR').replace(/ /g, ' ') + ' M€';
const fourchette = (b, h) => {
  const f = v => v < 1 ? Math.round(v * 1000) + ' M€' : nf(v, 1) + ' Md€';
  return b === h ? 'env. ' + f(b) : (b < 1) === (h < 1) ? `${f(b).replace(/ M?d?€$/, '')} à ${f(h)}` : `${f(b)} à ${f(h)}`;
};

// Treemap « squarified », comme sur la page.
function squarify(items, x, y, w, h) {
  if (!(w > 0 && h > 0)) return items.filter(d => d.v > 0).map(d => [d, x, y, 0, 0]);
  const tot = sum(items, d => d.v);
  const q = items.filter(d => d.v > 0).map(d => ({ d, a: d.v / tot * w * h })).sort((a, b) => b.a - a.a);
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

function dessinerArbre(doc, racine) {
  const noeuds = [];
  const parcourir = n => { if (n.x === undefined) return; noeuds.push(n); (n.children || []).forEach(parcourir); };
  parcourir(racine);
  for (const n of noeuds) {
    if (!n.depth || n.children?.length) continue;
    doc.rect(n.x, n.y, n.w, n.h).fill(n.color === 'hatch' ? PAPER : COULEURS[n.color]);
    if (n.color === 'hatch') {
      doc.save().rect(n.x, n.y, n.w, n.h).clip();
      for (let k = -n.h; k < n.w; k += 9) doc.moveTo(n.x + k, n.y + n.h).lineTo(n.x + k + n.h, n.y).lineWidth(3).strokeColor(COULEURS.hatch).stroke();
      doc.restore();
    }
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
  let taille = Math.min(15, H / 2.2), mise = null;
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
  [[E.non_percu_aides, COLONNES[0]], [E.non_percu_recettes, COLONNES[1]]].forEach(([c, col]) => {
    const postes = c.postes.map(p => pourAnnee(p, annee)).sort((p, q) => q.haut - p.haut);
    const env = c.enveloppe && pourAnnee(c.enveloppe, annee);
    ligne(doc, c.titre, col.x + 6, col.y, col.w - 12, 16, { gras: true });
    ligne(doc, `${c.sous_titre} · ${fourchette(sum(postes, p => p.bas), sum(postes, p => p.haut))}`, col.x + 6, col.y + 20, col.w - 12, 10, { couleur: MUTED });
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

export async function writeBudgetPdf(G, E, AN, annee, file, modeDep = 'administration', modeRec = 'administration') {
  mkdirSync(dirname(path(file)), { recursive: true });
  const doc = new PDFDocument({
    size: [LARGEUR, HAUTEUR], margin: 0, compress: true, lang: 'fr-FR', displayTitle: true,
    info: {
      Title: `L'argent public en ${annee} : dépenses par ${modeDep}, recettes par ${modeRec === 'type' ? 'type' : 'administration'}`,
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
  doc.rect(0, 0, LARGEUR, HAUTEUR).fill(PAPER);
  // En-tête.
  const D = G.total_depenses, R = G.total_recettes, S = G.solde;
  doc.font('Plex-Gras').fontSize(46).fillColor(INK).text(`L'argent public en ${annee}`, 60, 50, { lineBreak: false });
  doc.font('Plex').fontSize(20).fillColor(MUTED).text(
    `${mds(D)} de dépenses publiques (État, sécurité sociale, collectivités locales, opérateurs de l'État) et ce qui les finance : ${mds(R)} de recettes et ${mds(-S)} de déficit, couvert par l'emprunt.`,
    60, 112, { width: LARGEUR - 120 });
  doc.font('Plex-Gras').fontSize(14).fillColor(INK).text(`Dépenses regroupées par ${modeDep} · recettes regroupées par ${modeRec === 'type' ? 'type de recette (impôt par impôt)' : 'administration'}`, 60, 150, { lineBreak: false });
  doc.font('Plex').fontSize(14).fillColor(MUTED).text(`Surfaces proportionnelles aux montants, à la même échelle pour toutes les années (la plus grande, ${AN.echelle.insee_md.toLocaleString('fr-FR', { maximumFractionDigits: 0 }).replace(/ /g, ' ')} Md€, remplit la zone). Sur les côtés, en cercles : des estimations, pas des comptes (cercle atténué : estimation d'une autre année).`, 60, 174, { width: LARGEUR - 120 });

  doc.save().translate(60, HAUT_PAGE - TETE + 20);
  const racines = arbres(G, modeDep, modeRec);
  racines.forEach((r, i) => {
    const z = ZONES[i], f = Math.sqrt(r.v / AN.echelle.insee_md), w = z.w * f, h = z.h * f;
    const x = i === 0 ? z.x + z.w - w : z.x;
    placer(r, x, z.y, w, h);
    ligne(doc, `${r.label} · ${mds(r.v)}`, x, z.y - 30, Math.max(w, 400), 22, { gras: true });
    dessinerArbre(doc, r);
  });
  // Échelle des estimations : surface réelle des blocs de dépenses, par milliard.
  const feuilles = [];
  const f = n => (n.children?.length ? n.children.forEach(f) : n.x !== undefined && feuilles.push(n));
  f(racines[0]);
  dessinerEstimations(doc, E, annee, sum(feuilles, n => n.w * n.h) / D);
  doc.restore();

  // Légende et sources.
  let lx = 60;
  const ly = HAUTEUR - 80;
  for (const [c, l] of [['etat', 'État'], ['secu', 'Sécurité sociale'], ['coll', 'Collectivités locales'], ['op', "Opérateurs de l'État"], ['na', modeRec === 'type' ? 'Recettes par type, toutes administrations' : 'Autres recettes'], ['hatch', 'Déficit (emprunt)']]) {
    doc.rect(lx, ly, 16, 16).fill(COULEURS[c]);
    doc.font('Plex').fontSize(14).fillColor(INK).text(l, lx + 22, ly + 1, { lineBreak: false });
    lx += 40 + doc.widthOfString(l);
  }
  doc.font('Plex').fontSize(12).fillColor(MUTED).text(
    "Sources : Insee, comptes de la Nation (base 2020) ; estimations : HCFiPS, DGFiP, Conseil d'analyse économique, CEPII, DREES, Cour des comptes. Détail, explications et données ouvertes : gouvfr.jbledevehat.fr/budget/ · Proposition indépendante, ce n'est pas un document officiel.",
    60, ly + 32, { width: LARGEUR - 120 });
  doc.lineWidth(1).strokeColor(LINE);
  doc.end();
  await fini;
}
