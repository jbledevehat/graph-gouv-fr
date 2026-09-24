// Export de la carte V2 en graphe : GEXF (Gephi, Gephi Lite, Retina) et données de la page web sigma.js.
import graphology from 'graphology';
import forceAtlas2 from 'graphology-layout-forceatlas2';
import gexf from 'graphology-gexf';

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
  // Taille selon le nombre de liens.
  graph.forEachNode((n, a) => graph.setNodeAttribute(n, 'size', 2.5 + 2.2 * Math.sqrt(graph.degree(n))));
  const poles = layoutByPole(graph);
  return { graph, poles };
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

// Chaque élément rejoint le pôle du ministère (ou de la Présidence / du Premier ministre, ou le
// pôle des autorités indépendantes ou celui des institutions et juridictions) le plus proche ; chaque pôle est disposé à part (ForceAtlas2), puis les pôles sont
// répartis sur la carte comme des bulles qui ne se chevauchent pas.
function layoutByPole(graph) {
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
  for (const [name, members] of groups) {
    const sub = graph.copy();
    const keep = new Set(members);
    sub.forEachNode(n => { if (!keep.has(n)) sub.dropNode(n); });
    if (sub.order > 1) {
      forceAtlas2.assign(sub, {
        iterations: 400,
        settings: { ...forceAtlas2.inferSettings(sub), barnesHutOptimize: sub.order > 300, gravity: 1.5, strongGravityMode: true, scalingRatio: 4 },
      });
    }
    // Recentrage et mise à l'échelle : rayon proportionnel à la racine du nombre d'éléments.
    let cx = 0, cy = 0;
    sub.forEachNode((n, a) => { cx += a.x; cy += a.y; });
    cx /= sub.order; cy /= sub.order;
    let max = 1;
    sub.forEachNode((n, a) => { max = Math.max(max, Math.hypot(a.x - cx, a.y - cy)); });
    const r = 18 * Math.sqrt(sub.order) + 10;
    const pts = new Map();
    sub.forEachNode((n, a) => pts.set(n, { x: (a.x - cx) * r / max, y: (a.y - cy) * r / max }));
    circles.push({ name, r, pts, size: sub.order });
  }

  // Placement des bulles, de la plus grande à la plus petite, en spirale sans chevauchement ;
  // le pôle « sans ministère » vient en dernier, en périphérie.
  circles.sort((a, b) => (a.name === NO_POLE) - (b.name === NO_POLE) || b.size - a.size || a.name.localeCompare(b.name));
  const placed = [];
  const gap = 30;
  for (const c of circles) {
    if (!placed.length) { c.x = 0; c.y = 0; placed.push(c); continue; }
    for (let t = 0; ; t += 0.15) {
      const d = 6 * t, x = d * Math.cos(t), y = d * Math.sin(t);
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

// Données compactes pour la page web : nœuds [clé, x, y, taille, catégorie, nouveau, attributs, pôle].
export function toWebData({ graph, poles }, meta) {
  const index = new Map();
  const poleIndex = new Map(poles.map((p, i) => [p.id, i]));
  const nodes = [];
  graph.forEachNode((key, a) => {
    index.set(key, nodes.length);
    const { label, x, y, size, color, categorie, nouveau, type, tags, pole, ...attrs } = a;
    nodes.push([key, Math.round(x * 10) / 10, Math.round(y * 10) / 10, Math.round(size * 10) / 10, categorie, nouveau ? 1 : 0, { type, tags, ...attrs }, poleIndex.get(pole)]);
  });
  const edges = [];
  graph.forEachEdge((e, a, s, t) => edges.push([index.get(s), index.get(t), a.type]));
  return { meta, categories: CATEGORIES, poles, nodes, edges };
}
