// Règles de rattachement des sites et des administrations à leur ministère, appliquées dans
// l'ordre ; chacune ne traite que ce que les précédentes ont laissé sans rattachement.
import { config } from '../context.mjs';
import { isMinistry, nameKeys, norm, slug, words } from '../lib/text.mjs';
import { hostOf, isUrl, siteKey } from '../lib/url.mjs';
import { OFF, untag } from './model.mjs';

// Sites de la V1 : ceux que l'annuaire déclare suivent toujours sa chaîne (leurs liens de 2019
// ont été retirés), les autres sans rattachement passent par l'annuaire puis
// config/rattachements.csv.
export function attachV1Sites(map, { annSite, adminFor, inAnnuaire }) {
  let count = 0;
  for (const e of map.elements) {
    if (!inAnnuaire(e.label) && !map.unattached(e.label)) continue;
    const key = siteKey(hostOf(e.label));
    const info = annSite(key), admin = !info && adminFor(key);
    if (admin) {
      map.connect(map.ensureOrg(admin), e.label, 'Site web/Administration');
      e['Rattachement déduit de'] = 'config/rattachements.csv';
    } else if (info) {
      map.attach(info, e.label);
      Object.assign(e, {
        Organisme: info.organisme,
        Tutelle: info.tutelle || '',
        'Rattachement déduit de': info.tutelleVia && info.tutelleVia !== 'hiérarchie' ? info.tutelleVia : 'Annuaire de l\'administration',
      });
    } else continue;
    count++;
  }
  map.stats.viaV1 = count;
}

// Entités de premier niveau de l'annuaire, même sans site propre (hors cabinets) : placées sous
// leur ministère ou dans leur section, et reliées à leur propre site s'il est sur la carte (pas à
// un site partagé par de nombreux services, comme celui d'un ministère).
export function addFirstLevelEntities(map, { ann }) {
  let count = 0;
  for (const ent of ann.firstLevel()) {
    if (/Cabinet ministériel|Secrétaire d'État/.test(ent.type)) continue;
    const isNew = !map.hasOrg(ent.info.organisme);
    const org = map.ensureChain(ent.info);
    for (const h of ent.hosts) {
      const site = map.sites.get(h.key);
      if (site && (h.owned || h.declarers <= 2)) map.connect(org, site, 'Site web/Administration');
    }
    if (isNew) count++;
  }
  map.stats.viaEntities = count;
}

// L'annuaire ne relie pas les établissements publics à leur ministère : on passe par la liste des
// opérateurs de l'État (programme budgétaire chef de file -> config/programmes-ministeres.csv).
export function attachOperators(map, { operateurs, programmes }) {
  for (const c of map.connections) if (c.type === 'Administration/Administration') map.withParent.add(c.to);
  const ministryOf = new Map(programmes.map(r => [r.programme.trim(), r.ministere.trim()]));
  const opByKey = new Map();
  for (const op of operateurs) for (const k of nameKeys(op.nom)) opByKey.set(k, op);
  // À défaut d'intitulé identique : tous les mots significatifs du nom le plus court (3 au moins)
  // figurent dans le plus long.
  const opWords = operateurs.map(op => ({ op, w: new Set(words(op.nom.replace(/^[A-Z0-9 ]{2,12} - /, ''))) }));
  const fuzzyOp = name => {
    const w = new Set(words(name.replace(/\s*\([^)]*\)\s*$/, '')));
    let best = null;
    for (const { op, w: ow } of opWords) {
      const [small, big] = w.size <= ow.size ? [w, ow] : [ow, w];
      if (small.size < 3) continue;
      const covered = [...small].filter(x => big.has(x)).length / small.size;
      if (covered === 1 && (!best || big.size - small.size < best.gap)) best = { op, gap: big.size - small.size };
    }
    return best?.op;
  };
  // Par sigle : « Centre de recherche INRAE - Occitanie » -> opérateur « INRAE - … ».
  const opBySigle = new Map();
  for (const op of operateurs) {
    const sigle = op.nom.match(/^([A-Z][A-Z0-9&]{2,11})\s+[-–]\s/)?.[1];
    if (sigle) opBySigle.set(sigle, op);
  }
  const sigleOp = name => (name.match(/\b[A-Z][A-Z0-9]{3,11}\b/g) || []).map(t => opBySigle.get(t)).find(Boolean);

  const matched = new Set(), tutelleByOrg = new Map();
  for (const o of [...map.newOrgs]) {
    const op = [...nameKeys(o.label)].map(k => opByKey.get(k)).find(Boolean) || fuzzyOp(o.label) || sigleOp(o.label);
    if (!op) continue;
    matched.add(op.nom);
    Object.assign(o, { 'Opérateur de l\'État': op.nom, 'Statut juridique': op.statut, 'Programme chef de file': op.mission });
    if (!o.tags.includes('Opérateur de l\'État')) o.tags.push('Opérateur de l\'État');
    const ministry = ministryOf.get(op.programme);
    if (!ministry) {
      if (op.programme) map.warnings.push(`Programme ${op.programme} (${op.nom}) absent de config/programmes-ministeres.csv.`);
      continue;
    }
    if (map.withParent.has(o.label) || isMinistry(o.label)) continue;
    map.placeUnder(map.ensureMinistry(ministry), o.label);
    tutelleByOrg.set(o.label, ministry);
  }
  fillTutelles(map, tutelleByOrg);
  Object.assign(map.stats, { matchedOps: matched.size, operateurs: operateurs.length, viaOperators: tutelleByOrg.size });
  return tutelleByOrg;
}

// Tutelle des nouveaux sites d'après celle, désormais connue, de leur organisme.
function fillTutelles(map, tutelleByOrg) {
  for (const a of map.additions) if (!a.Tutelle && tutelleByOrg.has(a.Organisme)) a.Tutelle = tutelleByOrg.get(a.Organisme);
}

// Tutelles déclarées à la main (config/tutelles.csv) pour les organismes encore sans ministère.
export function attachManualTutelles(map, { tutelles, tutelleByOrg }) {
  const rules = tutelles.map(r => ({ re: new RegExp(r.motif, 'i'), ministry: r.ministere.trim() }));
  let count = 0;
  for (const o of map.newOrgs) {
    if (map.withParent.has(o.label) || isMinistry(o.label)) continue;
    const rule = rules.find(r => r.re.test(o.label));
    if (!rule) continue;
    map.placeUnder(map.ensureMinistry(rule.ministry), o.label);
    tutelleByOrg.set(o.label, rule.ministry);
    o['Rattachement déduit de'] = 'config/tutelles.csv';
    count++;
  }
  fillTutelles(map, tutelleByOrg);
  map.stats.viaManual = count;
}

// Sites de préfecture : <département ou région>.gouv.fr, et sites déjà reliés au nœud
// « Préfecture » de la V1.
export function attachPrefectures(map, { v1, labelById, territoires }) {
  const prefecture = map.labelByNorm.get('prefecture') || map.labelByNorm.get('préfecture');
  let count = 0;
  if (!prefecture) { map.stats.viaPrefecture = count; return; }
  const keys = new Set(territoires.map(t => `${slug(t)}.gouv.fr`));
  const prefId = v1.elements.find(e => e.label === prefecture)?.id;
  for (const c of v1.connections) {
    const other = c.from === prefId ? c.to : c.to === prefId ? c.from : null;
    const label = other && labelById.get(other);
    if (label && isUrl(label)) keys.add(siteKey(hostOf(label)));
  }
  for (const a of map.additions) {
    if (!a.tags.includes('À rattacher') || !keys.has(siteKey(hostOf(a.label)))) continue;
    map.attachTo(prefecture, a, 'nom de département ou de région');
    count++;
  }
  map.stats.viaPrefecture = count;
}

// Bloc-marque DSFR (nom du ministère sous la Marianne) ou, à défaut, ministère cité dans la page
// (lus par fetch-marques). Renvoie les pages à lire au prochain fetch-marques.
export function attachByMarque(map, { marques, ministryOfText }) {
  const orgLabels = new Set(map.newOrgs.map(o => o.label));
  const needsMinistry = a => a.tags.includes('À rattacher') || (orgLabels.has(a.Organisme) && !map.withParent.has(a.Organisme) && !isMinistry(a.Organisme));
  const toRead = [];
  let count = 0;
  for (const a of [...map.additions.filter(needsMinistry), ...map.elements.filter(e => map.unattached(e.label))]) {
    toRead.push(a.label);
    const entry = marques[a.label] || {};
    let marque = entry.marque, ministry = ministryOfText(marque);
    // Sinon, ministère cité au moins deux fois dans la page, ou seul ministère reconnu.
    if (!ministry && entry.mentions?.length) {
      const votes = new Map();
      for (const m of entry.mentions) {
        const found = ministryOfText(m);
        if (found) votes.set(found, (votes.get(found) || 0) + 1);
      }
      const [top, n] = [...votes].sort((x, y) => y[1] - x[1])[0] || [];
      if (n >= 2 || (n === 1 && votes.size === 1)) { ministry = top; marque = `${n} mention${n > 1 ? 's' : ''} dans la page`; }
    }
    if (!ministry) continue;
    a['Bloc-marque'] = marque;
    a['Rattachement déduit de'] = marque.endsWith('dans la page') ? 'mentions dans la page' : 'bloc-marque';
    a.Tutelle = ministry;
    count++;
    if (orgLabels.has(a.Organisme) && !map.withParent.has(a.Organisme)) {
      map.placeUnder(ministry, a.Organisme);
    } else {
      map.connect(ministry, a.label, 'Site web/Administration');
      untag(a, 'À rattacher');
    }
  }
  map.stats.viaMarque = count;
  return toRead;
}

// Démarches essentielles : un site resté sans rattachement est placé sous l'administration et
// le ministère indiqués par l'Observatoire (ex. URSSAF, CNAF).
export function attachByDemarches(map, { demarchesByKey, ministryOfText }) {
  let count = 0;
  for (const e of [...map.elements, ...map.additions]) {
    if (!map.unattached(e.label)) continue;
    const d = demarchesByKey.get(siteKey(hostOf(e.label)))?.[0];
    const ministry = d && ministryOfText(d.ministere);
    if (!ministry) continue;
    let above = map.ensureMinistry(ministry);
    if (d.administration && norm(d.administration) !== norm(ministry)) {
      const known = map.labelByNorm.has(norm(d.administration));
      const org = map.ensureOrg(d.administration, { 'Source': 'Observatoire des démarches essentielles' });
      if (!known) map.connect(above, org, 'Administration/Administration');
      above = org;
    }
    map.connect(above, e.label, 'Site web/Administration');
    e.Tutelle = ministry;
    e['Rattachement déduit de'] = 'Observatoire des démarches essentielles';
    untag(e, 'À rattacher');
    count++;
  }
  map.stats.viaDemarches = count;
}

// Dernier recours : mot-clé du nom de domaine (config/mots-cles-ministeres.csv), pour un site ou
// pour un organisme sans tutelle d'après le domaine de ses sites.
export function attachByKeyword(map, { keywords }) {
  const rules = keywords.map(r => ({ re: new RegExp(r.motif, 'i'), ministry: r.ministere.trim() }));
  const suffix = config.candidates.suffix.replace('.', '\\.');
  const domainName = label => siteKey(hostOf(label)).replace(new RegExp(`\\.${suffix}$|\\.[a-z]+$`), '');
  let count = 0;
  for (const e of [...map.elements, ...map.additions]) {
    if (!map.unattached(e.label)) continue;
    const rule = rules.find(r => r.re.test(domainName(e.label)));
    if (!rule) continue;
    map.connect(map.ensureMinistry(rule.ministry), e.label, 'Site web/Administration');
    e.Tutelle = rule.ministry;
    e['Rattachement déduit de'] = 'nom de domaine';
    untag(e, 'À rattacher');
    count++;
  }
  for (const o of map.newOrgs) {
    if (map.withParent.has(o.label) || isMinistry(o.label)) continue;
    const names = [...map.neighbours(o.label)].filter(isUrl).map(domainName);
    const rule = rules.find(r => names.some(n => r.re.test(n)));
    if (!rule) continue;
    map.placeUnder(map.ensureMinistry(rule.ministry), o.label);
    o['Rattachement déduit de'] = 'nom de domaine de ses sites';
    count++;
  }
  for (const o of map.newOrgs) if (!isMinistry(o.label) && !map.withParent.has(o.label)) o.tags.push('Tutelle à préciser');
  map.stats.viaKeyword = count;
}

// Gouvernement : le Premier ministre relié à chaque ministère.
export function linkGovernment(map) {
  const pm = map.labelByNorm.get('premier ministre');
  if (!pm) return;
  for (const e of [...map.elements, ...map.newOrgs]) if (isMinistry(e.label) && e.label !== pm) map.connect(pm, e.label, 'Gouvernement');
}

// Plus de « Service web », de « Consultation web » ni de site sans type : sous-domaine s'il
// dépend d'un site de la carte, site web sinon (type d'origine gardé dans « Type V1 »).
export function retypeV1Services(map) {
  const KNOWN_TYPES = new Set(['Site web', 'Sous-domaine', OFF, 'Organization', 'Person']);
  let count = 0;
  for (const e of map.elements) {
    if (!isUrl(e.label) || KNOWN_TYPES.has(e.type)) continue;
    e['Type V1'] = e.type || 'non défini';
    e.type = map.hasParentSite(e.label) ? 'Sous-domaine' : 'Site web';
    e.tags = [...(e.tags || []).filter(t => !/^(Service web|Consultation web)$/i.test(t)), e.type];
    count++;
  }
  map.stats.retyped = count;
}

