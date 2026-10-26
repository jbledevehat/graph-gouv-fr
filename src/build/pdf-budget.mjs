// Exploration du budget en PDF vectoriel, une page par fichier et par année
// (out/web/budget/pdf/argent-public-AAAA.pdf) : même composition que la page web (dépenses à
// gauche, ce qui les finance à droite, estimations sur les côtés), même échelle pour toutes les
// années, tous les noms et montants écrits (lisibles en zoomant), texte cherchable. Couleurs du
// thème clair, adaptées à l'impression.
import { createWriteStream, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import PDFDocument from 'pdfkit';
import { path } from '../context.mjs';

const INK = '#162033', MUTED = '#5A6579', PAPER = '#FFFFFF', LINE = '#D6DCE6';
const COULEURS = { etat: '#2A78D6', secu: '#4A3AA7', coll: '#D99A00', op: '#1BAF7A', na: '#DDE2EA', hatch: '#7C8699' };
const ENCRE = { etat: '#FFFFFF', secu: '#FFFFFF', coll: INK, op: INK, na: INK, hatch: INK };
const COUL = { S13111: 'etat', S1314: 'secu', S1313: 'coll', S13112: 'op' };
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

// Arbres « par administration », comme la vue par défaut de la page.
function arbres(G) {
  const D = G.total_depenses, S = G.solde;
  const dep = { label: 'Dépenses', v: D, children: G.secteurs.map(s => ({ label: s.nom, v: s.total, color: COUL[s.code],
    children: s.fonctions.map(f => ({ label: f.libelle, v: f.montant, color: COUL[s.code],
      children: f.sous.map(x => ({ label: x.libelle, v: x.montant, color: COUL[s.code] })) })) })) };
  const autres = G.recettes.filter(r => r.groupe === 'autres' && r.montant > 0);
  const financement = [...G.secteurs.map(s => {
    const d = s.recettes.detail, c = COUL[s.code];
    const impots = [['production', 'Impôts sur la consommation et la production'], ['revenu', 'Impôts sur le revenu et le patrimoine'],
      ['capital', 'Droits de succession et de donation'], ['transferts', "Impôts reversés par d'autres administrations"]]
      .filter(([k]) => d[k] > 0).map(([k, l]) => ({ label: l, v: d[k], color: c }));
    const cot = [['Cotisations versées', s.recettes.cotisations - d.cotisations_imputees], ['Cotisations imputées', d.cotisations_imputees]]
      .filter(x => x[1] > 0.05).map(([l, v]) => ({ label: l, v, color: c }));
    return { label: s.nom, v: s.recettes.impots + s.recettes.cotisations, color: c, children: [
      { label: 'Impôts', v: s.recettes.impots, color: c, children: impots },
      cot.length === 1 ? cot[0] : { label: 'Cotisations', v: s.recettes.cotisations, color: c, children: cot }] };
  }),
  { label: 'Autres recettes', v: G.autres_recettes_consolidees, color: 'na', children: autres.map(r => ({ label: r.libelle, v: r.montant, color: 'na' })) },
  { label: 'Déficit (emprunt)', v: -S, color: 'hatch' }];
  return [dep, { label: 'Recettes et emprunt', v: sum(financement, c => c.v), children: financement }];
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
    // Nom et montant, en haut à gauche du bloc.
    const pad = Math.min(6, n.w * 0.06), encre = ENCRE[n.color];
    const t = ligne(doc, n.label, n.x + pad, n.y + pad, n.w - 2 * pad, Math.min(15, n.h * 0.28), { gras: true, couleur: encre });
    if (t) ligne(doc, mds(n.v), n.x + pad, n.y + pad + t * 1.25, n.w - 2 * pad, t * 0.85, { couleur: encre });
  }
  // Noms des grands blocs (administration, puis fonction), en bas à droite, détourés.
  // Place de chaque étiquette ; celle d'une fonction est omise si elle tombe sous celle de son
  // administration (même coin), qui est dessinée par-dessus.
  const etiquette = n => {
    const taille = Math.min(n.depth === 1 ? 18 : 11, n.w / (n.label.length * CHAR + 2), n.h * 0.2);
    if (taille < 3) return null;
    const l = doc.font('Plex-Gras').fontSize(taille).widthOfString(n.label), m = taille * 0.3;
    return { taille, l, m, x: n.x + n.w - l - m - 4, y: n.y + n.h - taille * 1.3 - m - 4 };
  };
  const grands = noeuds.filter(n => n.depth >= 1 && n.depth <= 2 && n.children?.length).sort((a, b) => b.depth - a.depth);
  const places = new Map(grands.map(n => [n, etiquette(n)]));
  for (const n of grands) {
    const e = places.get(n);
    if (!e) continue;
    const p = places.get(n.parent);
    if (n.depth === 2 && p && e.y + e.taille * 1.3 > p.y - p.m && e.x + e.l > p.x - p.m) continue;
    doc.save().roundedRect(e.x - e.m, e.y - e.m * 0.6, e.l + 2 * e.m, e.taille * 1.3 + e.m, e.taille * 0.25).fillOpacity(0.88).fill(PAPER).restore();
    doc.font('Plex-Gras').fontSize(e.taille).fillColor(INK).text(n.label, e.x, e.y, { lineBreak: false });
  }
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

export async function writeBudgetPdf(G, E, AN, annee, file) {
  mkdirSync(dirname(path(file)), { recursive: true });
  const doc = new PDFDocument({
    size: [LARGEUR, HAUTEUR], margin: 0, compress: true, lang: 'fr-FR', displayTitle: true,
    info: {
      Title: `L'argent public en ${annee}`,
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
  doc.fontSize(14).text(`Surfaces proportionnelles aux montants, à la même échelle pour toutes les années (la plus grande, ${AN.echelle.insee_md.toLocaleString('fr-FR', { maximumFractionDigits: 0 }).replace(/ /g, ' ')} Md€, remplit la zone). Sur les côtés, en cercles : des estimations, pas des comptes (cercle atténué : estimation d'une autre année).`, 60, 150, { width: LARGEUR - 120 });

  doc.save().translate(60, HAUT_PAGE - TETE + 20);
  const racines = arbres(G);
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
  for (const [c, l] of [['etat', 'État'], ['secu', 'Sécurité sociale'], ['coll', 'Collectivités locales'], ['op', "Opérateurs de l'État"], ['na', 'Autres recettes'], ['hatch', 'Déficit (emprunt)']]) {
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
