// Modèle de la carte en construction : éléments (administrations et sites, identifiés par leur
// libellé ; l'URL pour un site), connexions sans doublon, et outils de rattachement.
import { config, today } from '../context.mjs';
import { isMinistry, norm } from '../lib/text.mjs';
import { hostOf, isUrl, siteKey } from '../lib/url.mjs';

export const OFF = 'Site off/archivé';
export const MINISTRY_TYPE = { 'Type d\'organisme': 'Administration centrale (ou Ministère)' };

// Même entité sous deux noms : la « Présidence de la République » de l'annuaire est le nœud
// « Président de la République française » de la V1.
const ALIASES = new Map([['présidence de la république', 'président de la république française']]);
const canonical = name => ALIASES.get(norm(name)) || norm(name);

export function createMap() {
  const map = {
    elements: [], // V1 puis, en fin de construction, nouvelles administrations et nouveaux sites
    newOrgs: [],
    additions: [],
    connections: [],
    warnings: [],
    stats: {},
    labelByNorm: new Map(), // intitulé normalisé -> libellé d'administration
    sites: new Map(), // domaine -> libellé des sites actifs
    known: new Set(), // domaines déjà sur la carte (actifs ou archivés)
    withParent: new Set(), // administrations déjà placées sous une autre
  };
  const connKeys = new Set(), adj = new Map();
  const neighbour = (a, b) => { if (!adj.has(a)) adj.set(a, new Set()); adj.get(a).add(b); };

  map.neighbours = label => adj.get(label) || new Set();

  map.connect = (from, to, type, extra = {}) => {
    const k = `${from}\u0000${to}\u0000${type}`;
    if (from === to || connKeys.has(k)) return;
    connKeys.add(k);
    neighbour(from, to); neighbour(to, from);
    map.connections.push({ from, to, type, direction: 'undirected', ...extra });
  };

  map.hasOrg = name => map.labelByNorm.has(canonical(name));

  // Administration : un intitulé déjà présent (V1 ou renommé) est réutilisé, sinon créé.
  map.ensureOrg = (name, extra = {}) => {
    const existing = map.labelByNorm.get(canonical(name));
    if (existing) return existing;
    map.newOrgs.push({
      label: name,
      type: 'Organization',
      tags: ['Organization', isMinistry(name) ? 'Ministère' : 'Administration publique', 'Nouveau'],
      ...extra,
      'Source': 'Annuaire de l\'administration',
      'Ajouté le': today,
    });
    map.labelByNorm.set(norm(name), name);
    return name;
  };
  map.ensureMinistry = name => map.ensureOrg(name, MINISTRY_TYPE);

  // Chaîne de l'annuaire au-dessus d'un organisme (ministère > direction > … > organisme) ; à
  // défaut de chaîne, l'organisme est relié à sa tutelle. Renvoie le libellé de l'organisme.
  map.ensureChain = info => {
    const section = info.section ? { 'Section annuaire': info.section } : {};
    let above = null;
    for (const name of info.chain || []) {
      const lbl = map.ensureOrg(name, { 'Type d\'organisme': isMinistry(name) ? MINISTRY_TYPE['Type d\'organisme'] : '', ...section });
      if (above) map.connect(above, lbl, 'Administration/Administration');
      above = lbl;
    }
    const org = map.ensureOrg(info.organisme, {
      'Type d\'organisme': info.typeOrganisme, 'URL annuaire': info.urlAnnuaire, 'SIREN': info.siren,
      ...(info.sitesDeclares && { 'Sites déclarés': info.sitesDeclares }), ...section,
    });
    if (above) map.connect(above, org, 'Administration/Administration');
    else if (info.tutelle) map.connect(map.ensureMinistry(info.tutelle), org, 'Administration/Administration');
    return org;
  };

  // Rattache un site à son organisme (et l'organisme à sa chaîne).
  map.attach = (info, siteLabel) => map.connect(map.ensureChain(info), siteLabel, 'Site web/Administration');

  // Site rattaché à un ministère ou une administration par une règle : lien, tutelle, méthode.
  map.attachTo = (org, el, via) => {
    map.connect(org, el.label, 'Site web/Administration');
    el['Rattachement déduit de'] = via;
    untag(el, 'À rattacher');
  };

  // Rattachement d'une administration à son ministère.
  map.placeUnder = (ministry, orgLabel) => {
    map.connect(ministry, orgLabel, 'Administration/Administration');
    map.withParent.add(orgLabel);
  };

  // Domaines présents sur la carte, figés au moment de l'appel (sites de la V1 et nouveaux sites).
  map.freezeSiteKeys = () => {
    const keys = new Set([...map.elements, ...map.additions].filter(e => isUrl(e.label)).map(e => siteKey(hostOf(e.label))));
    // Site dont un domaine parent est sur la carte : il appartient à sa bulle.
    map.hasParentSite = label => {
      const labels = siteKey(hostOf(label)).split('.');
      for (let i = 1; i < labels.length - 1; i++) {
        const up = labels.slice(i).join('.');
        if (up === config.candidates.suffix) break;
        if (keys.has(up)) return true;
      }
      return false;
    };
  };

  // Site sans aucun rattachement : ni administration voisine (directement ou via un site
  // voisin), ni site parent.
  const nonUrlNeighbour = label => [...map.neighbours(label)].some(n => !isUrl(n));
  map.unattached = label => isUrl(label) && !map.hasParentSite(label) && !nonUrlNeighbour(label)
    && ![...map.neighbours(label)].some(n => isUrl(n) && nonUrlNeighbour(n));

  return map;
}

export function untag(el, tag) {
  el.tags = (el.tags || []).filter(t => t !== tag);
}

export const tag = (el, t) => { if (!(el.tags || []).includes(t)) el.tags = [...(el.tags || []), t]; };
