// Export de la carte V2 en graphe : GEXF (Gephi, Gephi Lite, Retina) et données de la page web sigma.js.
import graphology from 'graphology';
import forceAtlas2 from 'graphology-layout-forceatlas2';
import gexf from 'graphology-gexf';
import { hostOf, isUrl, siteKey } from './lib/url.mjs';

const { UndirectedGraph } = graphology;

// Catégories affichées, dans l'ordre de la légende. Couleurs reprises de la légende de la V1.
export const CATEGORIES = [
  { id: 'personne', label: 'Présidence et Premier ministre', color: '#2F6BD8' },
  { id: 'ministere', label: 'Ministères', color: '#E0A800' },
  { id: 'administration', label: 'Administrations et opérateurs', color: '#B8860B' },
  { id: 'site', label: 'Sites web', color: '#2E9E5B' },
  { id: 'sous-domaine', label: 'Sous-domaines', color: '#E8772E' },
  { id: 'service', label: 'Services en ligne', color: '#D6403A' },
  { id: 'consultation', label: 'Consultations citoyennes', color: '#D35FA8' },
  { id: 'archive', label: 'Sites off ou archivés', color: '#4A4F57' },
  { id: 'autre', label: 'Non classés', color: '#9AA3AE' },
];

// Suffixes qui ne sont jamais des sites parents.
const SUFFIXES = new Set(['gouv.fr', 'fr']);
// Écart entre deux sous-domaines dans une bulle, en unités du graphe.
const DOT = 3;

function categoryOf(el) {
  const tags = el.tags || [];
  switch (el.type) {
    case 'Person': return 'personne';
    case 'Organization': return tags.includes('Ministère') ? 'ministere' : 'administration';
    case 'Site web': return 'site';
    case 'Sous-domaine': return 'sous-domaine';
    case 'Service web': return 'service';
    case 'Consultation web': return 'consultation';
    case 'Site off/archivé': return 'archive';
    default: return 'autre';
  }
}

// Position initiale déterministe (le placement est identique d'une exécution à l'autre).
function seeded(label) {
  let h = 2166136261;
  for (const ch of label) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const a = ((h >>> 0) % 10000) / 10000, b = ((Math.imul(h, 48271) >>> 0) % 10000) / 10000;
  return { x: (a - 0.5) * 1000, y: (b - 0.5) * 1000 };
}

export function buildGraph({ elements, connections }) {
  const colors = Object.fromEntries(CATEGORIES.map(c => [c.id, c.color]));
  const graph = new UndirectedGraph({ multi: false, allowSelfLoops: false });
  for (const el of elements) {
    const { label, type, tags, 'Nb liens': _nb, ...attrs } = el;
    const categorie = categoryOf(el);
    graph.addNode(label, {
      label,
      categorie,
      type: type || '',
      tags: (tags || []).join('|'),
      nouveau: (tags || []).includes('Nouveau'),
      color: colors[categorie],
      ...seeded(label),
      ...Object.fromEntries(Object.entries(attrs).filter(([, v]) => v !== '' && v != null).map(([k, v]) => [k, String(v)])),
    });
  }
  for (const c of connections) {
    if (!graph.hasNode(c.from) || !graph.hasNode(c.to) || graph.hasEdge(c.from, c.to)) continue;
    graph.addEdge(c.from, c.to, { type: c.type || '' });
  }

  // Bulles : tout site dont un domaine parent est sur la carte appartient à la bulle de son
  // ancêtre le plus haut (même règle pour tous les types, V1 comme V2).
  const keyOf = new Map(), nodeOfKey = new Map();
  graph.forEachNode(n => {
    if (!isUrl(n)) return;
    const k = siteKey(hostOf(n));
    keyOf.set(n, k);
    if (!nodeOfKey.has(k)) nodeOfKey.set(k, n);
  });
  const parentOf = n => {
    const labels = keyOf.get(n).split('.');
    for (let i = 1; i < labels.length - 1; i++) {
      const up = labels.slice(i).join('.');
      if (SUFFIXES.has(up)) break;
      const p = nodeOfKey.get(up);
      if (p && p !== n) return p;
    }
    return null;
  };
  const parent = new Map();
  for (const n of keyOf.keys()) { const p = parentOf(n); if (p) parent.set(n, p); }
  const rootOf = n => { let r = n, i = 0; while (parent.has(r) && i++ < 20) r = parent.get(r); return r; };
  const members = new Map();
  for (const n of parent.keys()) {
    const root = rootOf(n);
    if (!members.has(root)) members.set(root, []);
    members.get(root).push(n);
    graph.mergeNodeAttributes(n, { bulle: root, 'Site parent': graph.getNodeAttribute(n, 'Site parent') || keyOf.get(parent.get(n)) });
  }

  // Placement calculé sur les sites « racines » ; chaque bulle occupe un disque de rayon connu.
  const view = graph.copy();
  for (const n of parent.keys()) view.dropNode(n);
  const radius = new Map();
  view.forEachNode((n, a) => {
    const count = members.get(n)?.length || 0;
    const size = 2.5 + 2.2 * Math.sqrt(view.degree(n)) + 1.4 * Math.log2(1 + count);
    view.mergeNodeAttributes(n, { size, sousDomaines: count });
    radius.set(n, count ? size + DOT * 1.1 * Math.sqrt(count + 1) : size);
  });
  const poles = layoutByPole(view, radius);

  // Report sur le graphe complet ; les membres d'une bulle en tournesol autour de leur racine.
  view.forEachNode((n, a) => graph.mergeNodeAttributes(n, { x: a.x, y: a.y, size: a.size, pole: a.pole, sousDomaines: a.sousDomaines }));
  for (const [root, list] of members) {
    const r = view.getNodeAttributes(root);
    list.sort().forEach((n, i) => {
      const angle = i * 2.399963, dist = r.size + DOT * 1.1 * Math.sqrt(i + 1);
      graph.mergeNodeAttributes(n, { x: r.x + dist * Math.cos(angle), y: r.y + dist * Math.sin(angle), size: 1.8, pole: r.pole });
    });
  }
  return { graph, poles, members };
}

const NO_POLE = 'Sans ministère identifié';
const AUTHORITIES = 'Autorités indépendantes';
// Autorités indépendantes : regroupées dans leur propre pôle plutôt que sous un ministère.
const isAuthority = a => /^Autorité (administrative|publique) indépendante$/.test(a['Type d\'organisme'] || '');
const INSTITUTIONS = 'Institutions et juridictions';
const isInstitution = a => /^(Institution|Juridiction)$/.test(a['Type d\'organisme'] || '');

// Nom court d'un pôle pour la carte : « Ministère de la Culture » -> « Culture ».
function shortPole(name) {
  if (name === NO_POLE) return name;
  const s = name.replace(/^Ministère (de la |de l'|de l’|des |du |de )/i, '').split(',')[0]
    .replace(/ et (de la |de l'|de l’|des |du |de )/, ' et ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Écarte les disques qui se chevauchent (rayon de chaque bulle) ; quelques passes suffisent.
function separate(pts, radius, passes = 60) {
  const list = [...pts.entries()];
  for (let pass = 0; pass < passes; pass++) {
    let moved = false;
    for (let i = 0; i < list.length; i++) {
      const [a, pa] = list[i];
      for (let j = i + 1; j < list.length; j++) {
        const [b, pb] = list[j];
        const dx = pb.x - pa.x, dy = pb.y - pa.y;
        const min = radius.get(a) + radius.get(b) + 1.5;
        const d = Math.hypot(dx, dy) || 0.01;
        if (d >= min) continue;
        const push = (min - d) / 2, ux = dx / d, uy = dy / d;
        pa.x -= ux * push; pa.y -= uy * push;
        pb.x += ux * push; pb.y += uy * push;
        moved = true;
      }
    }
    if (!moved) break;
  }
}

// Chaque élément rejoint le pôle du ministère (ou de la Présidence / du Premier ministre, ou le
// pôle des autorités indépendantes ou celui des institutions et juridictions) le plus proche ;
// chaque pôle est disposé à part (ForceAtlas2, puis écartement des bulles), puis les pôles sont
// répartis sur la carte comme des disques qui ne se chevauchent pas.
function layoutByPole(graph, radius) {
  const pole = new Map();
  const anchors = graph.filterNodes((n, a) => a.categorie === 'ministere' || a.categorie === 'personne').sort();
  anchors.forEach(n => pole.set(n, n));
  const authorities = graph.filterNodes((n, a) => a.categorie === 'administration' && isAuthority(a)).sort();
  authorities.forEach(n => pole.set(n, AUTHORITIES));
  const institutions = graph.filterNodes((n, a) => a.categorie === 'administration' && isInstitution(a)).sort();
  institutions.forEach(n => pole.set(n, INSTITUTIONS));
  let frontier = [...anchors, ...authorities, ...institutions];
  while (frontier.length) {
    const next = [];
    for (const n of frontier) {
      graph.forEachNeighbor(n, m => {
        if (pole.has(m)) return;
        pole.set(m, pole.get(n));
        next.push(m);
      });
    }
    frontier = next;
  }
  graph.forEachNode(n => graph.setNodeAttribute(n, 'pole', pole.get(n) || NO_POLE));

  const groups = new Map();
  graph.forEachNode((n, a) => {
    if (!groups.has(a.pole)) groups.set(a.pole, []);
    groups.get(a.pole).push(n);
  });

  const circles = [];
  for (const [name, list] of groups) {
    const sub = graph.copy();
    const keep = new Set(list);
    sub.forEachNode(n => { if (!keep.has(n)) sub.dropNode(n); });
    if (sub.order > 1) {
      forceAtlas2.assign(sub, {
        iterations: 400,
        settings: { ...forceAtlas2.inferSettings(sub), barnesHutOptimize: sub.order > 300, gravity: 1.5, strongGravityMode: true, scalingRatio: 4 },
      });
    }
    // Recentrage, mise à l'échelle selon la surface totale des bulles, puis écartement.
    let cx = 0, cy = 0;
    sub.forEachNode((n, a) => { cx += a.x; cy += a.y; });
    cx /= sub.order; cy /= sub.order;
    let max = 1, area = 0;
    sub.forEachNode((n, a) => { max = Math.max(max, Math.hypot(a.x - cx, a.y - cy)); area += (radius.get(n) + 2) ** 2; });
    const target = 1.3 * Math.sqrt(area) + 10;
    const pts = new Map();
    sub.forEachNode((n, a) => pts.set(n, { x: (a.x - cx) * target / max, y: (a.y - cy) * target / max }));
    separate(pts, radius);
    let r = 10;
    for (const [n, pt] of pts) r = Math.max(r, Math.hypot(pt.x, pt.y) + radius.get(n));
    circles.push({ name, r, pts, size: sub.order });
  }

  // Placement des disques, du plus grand au plus petit, en spirale sans chevauchement ;
  // le pôle « sans ministère » vient en dernier, en périphérie.
  circles.sort((a, b) => (a.name === NO_POLE) - (b.name === NO_POLE) || b.r - a.r || a.name.localeCompare(b.name));
  const placed = [];
  const gap = 30;
  for (const c of circles) {
    if (!placed.length) { c.x = 0; c.y = 0; placed.push(c); continue; }
    for (let t = 0; ; t += 0.1) {
      const d = 8 * t, x = d * Math.cos(t), y = d * Math.sin(t);
      if (placed.every(o => Math.hypot(o.x - x, o.y - y) >= o.r + c.r + gap)) { c.x = x; c.y = y; break; }
    }
    placed.push(c);
  }
  for (const c of placed) {
    for (const [n, pt] of c.pts) graph.mergeNodeAttributes(n, { x: c.x + pt.x, y: c.y + pt.y });
  }
  return placed.map(c => ({ id: c.name, label: shortPole(c.name), x: Math.round(c.x), y: Math.round(c.y), r: Math.round(c.r), size: c.size }));
}

export function toGexf({ graph }) {
  return gexf.write(graph, {
    formatNode: (key, a) => ({
      label: a.label,
      attributes: Object.fromEntries(Object.entries(a).filter(([k]) => !['label', 'x', 'y', 'size', 'color'].includes(k))),
      viz: { color: a.color, size: a.size, x: a.x, y: a.y },
    }),
    formatEdge: (key, a) => ({ attributes: { type: a.type } }),
  });
}

// Attributs gardés pour les membres d'une bulle (fichier plus léger).
const MEMBER_ATTRS = ['Statut', 'Code HTTP', 'URL finale', 'Site parent', 'Source', 'Vérifié le', 'Ajouté le', 'Type précédent', 'Organisme', 'Tutelle'];

// Données compactes pour la page web :
// nœuds [clé, x, y, taille, catégorie, nouveau, attributs, pôle, index de la racine de bulle ou -1].
// Les liens entre les membres d'une bulle et leur parent ne sont pas dessinés (la bulle les montre).
export function toWebData({ graph, poles }, meta) {
  const index = new Map();
  const poleIndex = new Map(poles.map((p, i) => [p.id, i]));
  const keys = [];
  graph.forEachNode(n => { index.set(n, keys.length); keys.push(n); });
  const nodes = keys.map(key => {
    const { label, x, y, size, color, categorie, nouveau, type, tags, pole, bulle, ...attrs } = graph.getNodeAttributes(key);
    const kept = bulle ? Object.fromEntries(MEMBER_ATTRS.filter(k => attrs[k]).map(k => [k, attrs[k]])) : attrs;
    return [key, Math.round(x * 10) / 10, Math.round(y * 10) / 10, Math.round(size * 10) / 10, categorie, nouveau ? 1 : 0,
      { type, tags, ...kept }, poleIndex.get(pole), bulle ? index.get(bulle) : -1];
  });
  const edges = [];
  graph.forEachEdge((e, a, s, t) => {
    const bs = graph.getNodeAttribute(s, 'bulle') || s, bt = graph.getNodeAttribute(t, 'bulle') || t;
    if (a.type === 'Site web/Sous-domaine' && bs === bt) return;
    edges.push([index.get(s), index.get(t), a.type]);
  });
  return { meta, categories: CATEGORIES, poles, nodes, edges };
}
