// Carte en PDF vectoriel (out/web/carte.pdf) : même placement que la page web, tous les noms
// affichés (ceux des sous-domaines en petit, lisibles en zoomant), texte cherchable. Couleurs
// du thème clair, adaptées à l'impression.
import { createWriteStream } from 'node:fs';
import PDFDocument from 'pdfkit';
import { path } from '../context.mjs';
import { hostOf } from '../lib/url.mjs';

const SCALE = 5; // points PDF par unité du graphe (page d'environ 3,6 m, zoom sans perte)
const MARGIN = 40; // en unités du graphe
const HEADER = 90;
const INK = '#162033', MUTED = '#566073', PAPER = '#FFFFFF';
// Liens affichés entre pôles (comme sur la page) ; les autres restent dans leur pôle.
const CROSS_POLE = new Set(['Gouvernement', 'Dépendance']);
const CHAR = 0.52; // largeur moyenne d'un caractère d'Helvetica, en em

const shortHost = url => (hostOf(url) || url).replace(/^www\./, '');
// Nom d'un sous-domaine sans le domaine de son parent : agirpourlatransition.ademe.fr -> agirpourlatransition.
const memberName = (url, parentUrl) => {
  const host = shortHost(url), parent = parentUrl && shortHost(parentUrl);
  return parent && host.endsWith('.' + parent) ? host.slice(0, -parent.length - 1) : host;
};
const dateFr = d => new Date(d + 'T12:00:00Z').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
// Teinte claire et opaque d'une couleur (28 %) : le nom du sous-domaine reste lisible dessus.
const tint = hex => '#' + hex.slice(1).match(/../g).map(h => Math.round(parseInt(h, 16) * 0.28 + 255 * 0.72).toString(16).padStart(2, '0')).join('');
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Nom d'un site ou d'une administration hors bulle : taille selon son importance.
function rootLabel([key, , , s, cat]) {
  const important = cat === 'personne' || cat === 'ministere';
  return {
    text: /^https?:\/\//.test(key) ? shortHost(key) : key,
    size: important ? clamp(s * 0.9, 5, 12) : clamp(s * 0.7, 2.2, 7),
    font: important ? 'Helvetica-Bold' : 'Helvetica',
  };
}

export function writePdf({ nodes, edges, poles, categories, meta }, file = 'out/web/carte.pdf') {
  const colors = Object.fromEntries(categories.map(c => [c.id, c.color]));
  const ext = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
  for (const [, x, y, s] of nodes) {
    ext.x0 = Math.min(ext.x0, x - s); ext.x1 = Math.max(ext.x1, x + s);
    ext.y0 = Math.min(ext.y0, -y - s); ext.y1 = Math.max(ext.y1, -y + s);
  }
  for (const p of poles) ext.y0 = Math.min(ext.y0, -p.y - p.r - 20);
  // Place des noms à droite des points, mesurée avec les polices du PDF.
  const probe = new PDFDocument({ autoFirstPage: false });
  for (const node of nodes) {
    if (node[8] >= 0) continue;
    const { text, size, font } = rootLabel(node);
    ext.x1 = Math.max(ext.x1, node[1] + node[3] + 0.8 + probe.font(font).fontSize(size).widthOfString(text));
  }
  const width = (ext.x1 - ext.x0 + 2 * MARGIN) * SCALE;
  const height = (ext.y1 - ext.y0 + 2 * MARGIN + HEADER) * SCALE;
  // Coordonnées : unités du graphe, axe vertical inversé (y vers le haut dans sigma).
  const X = x => x - ext.x0 + MARGIN, Y = y => -y - ext.y0 + MARGIN + HEADER;

  const doc = new PDFDocument({
    size: [width, height], margin: 0, compress: true, lang: 'fr-FR', displayTitle: true,
    info: {
      Title: 'Sites web publics de l\'État',
      Author: 'Jean-Baptiste Le Dévéhat',
      Subject: `Carte des sites web publics de l'État, rangés par ministère — ${meta.date}`,
      Keywords: 'gouv.fr, sites web, État, ministères, Annuaire de l\'administration',
    },
  });
  const done = new Promise((resolve, reject) => {
    const out = createWriteStream(path(file));
    out.on('finish', resolve).on('error', reject);
    doc.pipe(out);
  });
  doc.rect(0, 0, width, height).fill(PAPER);
  doc.scale(SCALE);

  // Bulles : rayon (depuis la racine) couvrant tous leurs membres.
  const bubbleRadius = new Map();
  nodes.forEach(([, x, y, s, , , , , bulle]) => {
    if (bulle < 0) return;
    const [, bx, by, bs] = nodes[bulle];
    bubbleRadius.set(bulle, Math.max(bubbleRadius.get(bulle) || bs, Math.hypot(x - bx, y - by) + s));
  });

  // Liens (hors arborescence des bulles).
  doc.lineWidth(0.12).strokeColor(INK).strokeOpacity(0.18);
  for (const [s, t, type] of edges) {
    if (type === 'bulle') continue;
    const a = nodes[s], b = nodes[t];
    if (a[7] !== b[7] && !CROSS_POLE.has(type)) continue;
    doc.moveTo(X(a[1]), Y(a[2])).lineTo(X(b[1]), Y(b[2])).stroke();
  }
  doc.strokeOpacity(1);

  // Fond des bulles, sites et administrations, puis sous-domaines par-dessus (teinte claire, pour
  // lire leur nom).
  for (const [i, r] of bubbleRadius) {
    const [, x, y, , cat] = nodes[i];
    doc.circle(X(x), Y(y), r + 0.6).fillOpacity(0.06).fill(colors[cat]);
  }
  doc.fillOpacity(1);
  for (const [, x, y, s, cat, , , , bulle] of nodes) {
    if (bulle >= 0) continue;
    doc.circle(X(x), Y(y), s).lineWidth(0.3).fillAndStroke(colors[cat], PAPER);
  }

  for (const [, x, y, s, cat, , , , bulle] of nodes) {
    if (bulle < 0) continue;
    doc.circle(X(x), Y(y), s).fill(tint(colors[cat]));
  }
  // Noms des sous-domaines : centrés sur leur point, taille ajustée à l'espace disponible.
  doc.font('Helvetica').fillColor(INK);
  for (const [key, x, y, s, , , , , bulle, parent] of nodes) {
    if (bulle < 0) continue;
    const name = memberName(key, parent >= 0 ? nodes[parent][0] : null);
    const size = clamp((s * 2.6) / (CHAR * name.length), 0.25, 1.1);
    doc.fontSize(size).text(name, X(x) - (CHAR * size * name.length) / 2, Y(y) - size * 0.45, { lineBreak: false });
  }

  // Noms des sites et administrations, avec un liseré blanc pour rester lisibles sur les liens.
  const label = (text, x, y, size, font = 'Helvetica') => {
    const opts = { lineBreak: false };
    doc.font(font).fontSize(size);
    doc.lineWidth(size * 0.22).strokeColor(PAPER).text(text, x, y, { ...opts, stroke: true, fill: false });
    doc.fillColor(INK).text(text, x, y, { ...opts, fill: true, stroke: false });
  };
  nodes.forEach((node, i) => {
    const [, x, y, s, , , , , bulle] = node;
    if (bulle >= 0) return;
    const { text, size, font } = rootLabel(node);
    const r = bubbleRadius.get(i);
    // Site au centre d'une bulle : nom au-dessus de la bulle ; sinon à droite du point.
    if (r) {
      doc.font('Helvetica-Bold').fontSize(size);
      label(text, X(x) - doc.widthOfString(text) / 2, Y(y) - r - size * 1.25, size, 'Helvetica-Bold');
    } else label(text, X(x) + s + 0.8, Y(y) - size * 0.5, size, font);
  });

  // Noms des pôles, au-dessus de leur cercle.
  for (const p of poles) {
    if (p.size <= 2) continue; // pôle d'un seul élément (Président) : son nom suffit
    const text = p.label.toUpperCase();
    doc.font('Helvetica-Bold').fontSize(14);
    label(text, X(p.x) - doc.widthOfString(text) / 2, Y(p.y) - p.r - 16, 14, 'Helvetica-Bold');
  }

  // En-tête : titre, date, légende.
  doc.font('Helvetica-Bold').fontSize(34).fillColor(INK).text('Sites web publics de l\'État', MARGIN, MARGIN * 0.6, { lineBreak: false });
  doc.font('Helvetica').fontSize(12).fillColor(MUTED)
    .text(`Carte mise à jour le ${dateFr(meta.date)} (sites vérifiés le ${dateFr(meta.verifie)}) · ${meta.elements} éléments · gouvfr.jbledevehat.fr · Licence Ouverte 2.0`, MARGIN, MARGIN * 0.6 + 44, { lineBreak: false });
  let lx = MARGIN;
  const ly = MARGIN * 0.6 + 70;
  for (const c of categories) {
    doc.circle(lx + 5, ly + 6, 5).fill(c.color);
    doc.font('Helvetica').fontSize(12).fillColor(INK).text(c.label, lx + 15, ly, { lineBreak: false });
    lx += 15 + doc.widthOfString(c.label) + 28;
  }
  doc.end();
  return done;
}
