// Annuaire de l'administration : hiérarchie des services (fil d'Ariane du site) et index des
// sites qu'ils déclarent, avec leur organisme et leur ministère de tutelle.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { FILES, config, download, path, progress, readJson, readJsonIf, sleep, writeOut } from './context.mjs';
import { flat, initials, isMinistry, norm } from './lib/text.mjs';
import { hostOf, siteKey } from './lib/url.mjs';

// Fil d'Ariane d'une fiche : Accueil > Annuaire > Section > [parents…] > fiche.
function parseBreadcrumb(html) {
  const list = html.match(/<ol class="fr-breadcrumb__list">([\s\S]*?)<\/ol>/)?.[1];
  if (!list) return null;
  const decode = t => t.replace(/<[^>]+>/g, '').replace(/&#39;|&rsquo;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  const items = [...list.matchAll(/<li>([\s\S]*?)<\/li>/g)].map(m => {
    const href = m[1].match(/href="([^"]+)"/)?.[1] || '';
    return { nom: decode(m[1]), id: href.match(/\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/)?.[1] || null };
  });
  return { section: items[2]?.nom || '', parents: items.slice(3, -1).filter(i => i.id) };
}

// Hiérarchie telle que le site de l'annuaire la présente (plus complète que le champ « hierarchie »
// de l'API). Une page par seconde ; cache versionné, relu au bout de hierarchieMaxAgeDays.
export async function fetchHierarchie() {
  const rows = await readJson(FILES.annuaire);
  const cache = await readJsonIf(FILES.hierarchie, {});
  const maxAge = (config.sources.annuaire.hierarchieMaxAgeDays || 90) * 864e5;
  const todo = rows.filter(r => r.url_service_public && !(cache[r.id] && Date.now() - Date.parse(cache[r.id].lu) < maxAge));
  console.log(`Hiérarchie de l'annuaire : ${rows.length} fiches, ${todo.length} à lire (une par seconde)…`);
  const save = async () => {
    await mkdir(dirname(path(FILES.hierarchie)), { recursive: true });
    await writeFile(path(FILES.hierarchie), JSON.stringify(cache, null, 1) + '\n');
  };
  const show = progress('fiches lues');
  let done = 0, failed = 0;
  for (const r of todo) {
    try {
      const bc = parseBreadcrumb(await (await download(r.url_service_public, 'Annuaire')).text());
      if (bc) cache[r.id] = { ...bc, lu: new Date().toISOString() };
      else failed++;
    } catch { failed++; }
    if (++done % 100 === 0 || done === todo.length) { await save(); show(done, todo.length); }
    await sleep(1000);
  }
  await writeOut(FILES.hierarchie, JSON.stringify(cache, null, 1) + '\n');
  console.log(`\n  ${Object.keys(cache).length} fiches en cache${failed ? `, ${failed} illisibles` : ''}`);
}

// Index de l'annuaire. Pour chaque service, sa tutelle ministérielle :
// 1. le plus proche ancêtre ministériel dans la hiérarchie de l'annuaire ;
// 2. à défaut, le ministère majoritaire parmi les services installés à la même adresse.
// Pour chaque site déclaré : le service retenu (voir priorité ci-dessous) et la tutelle
// majoritaire parmi tous les services qui le déclarent. Un site déclaré par plusieurs services
// d'un même ministère (ex. info.gouv.fr) est rattaché directement à ce ministère.
export function annuaireIndex(rows, hier = {}) {
  const byId = new Map(rows.map(r => [r.id, r]));
  // Parents : fil d'Ariane du site de l'annuaire en priorité (donnees/annuaire/hierarchie.json),
  // à défaut le champ « hierarchie » de l'API.
  const parent = new Map(), nameOf = new Map(rows.map(r => [r.id, r.nom])), sectionOf = new Map();
  for (const r of rows) for (const child of r.enfants) parent.set(child, r.id);
  for (const [id, h] of Object.entries(hier)) {
    h.parents.forEach((p, k) => {
      nameOf.set(p.id, nameOf.get(p.id) || p.nom);
      sectionOf.set(p.id, sectionOf.get(p.id) || h.section);
      if (hier[p.id]) return; // fiche lue elle-même : son propre fil d'Ariane fait foi
      if (k > 0) parent.set(p.id, h.parents[k - 1].id); else parent.delete(p.id);
    });
    sectionOf.set(id, h.section);
    const last = h.parents.at(-1);
    if (last) parent.set(id, last.id); else parent.delete(id);
  }
  const ancestors = id => {
    const chain = [];
    while (parent.has(id) && chain.length < 20) chain.push(id = parent.get(id));
    return chain;
  };
  const ministryByHierarchy = r => {
    const top = ancestors(r.id).at(-1);
    if (top && isMinistry(nameOf.get(top) || '')) return { id: top, nom: nameOf.get(top) };
    return isMinistry(r.nom) ? r : null;
  };

  // Tutelle déduite de l'adresse (seulement sans fil d'Ariane) : au moins 2 services rattachés,
  // dont 60 % au même ministère.
  const byAddress = new Map();
  for (const r of rows) {
    const m = ministryByHierarchy(r);
    if (!m || !r.adresse || !/^\d/.test(r.adresse)) continue;
    if (!byAddress.has(r.adresse)) byAddress.set(r.adresse, new Map());
    const votes = byAddress.get(r.adresse);
    votes.set(m.nom, (votes.get(m.nom) || 0) + 1);
  }
  const ministryByAddress = r => {
    const votes = byAddress.get(r.adresse);
    if (!votes) return null;
    const total = [...votes.values()].reduce((a, b) => a + b, 0);
    const [name, n] = [...votes].sort((a, b) => b[1] - a[1])[0];
    return total >= 2 && n / total >= 0.6 ? name : null;
  };
  const tutelleOf = r => {
    const m = ministryByHierarchy(r);
    if (m) return { name: m.id === r.id ? '' : m.nom, via: hier[r.id] ? 'annuaire (fil d\'Ariane)' : 'hiérarchie' };
    if (hier[r.id]) return { name: '', via: 'annuaire (fil d\'Ariane)' };
    const a = ministryByAddress(r);
    return a ? { name: a, via: 'adresse' } : { name: '', via: '' };
  };

  // Intitulés portés par plusieurs services (« Secrétariat général »…) : on précise la tutelle.
  const homonyms = new Map();
  for (const nom of nameOf.values()) homonyms.set(norm(nom), (homonyms.get(norm(nom)) || 0) + 1);
  const labelOf = (id, ministry) => {
    const nom = nameOf.get(id) || byId.get(id)?.nom || '';
    return homonyms.get(norm(nom)) > 1 && ministry && norm(ministry) !== norm(nom) ? `${nom} (${ministry})` : nom;
  };
  const MEAE = 'Ministère de l\'Europe et des Affaires étrangères';
  // Priorité au service qui déclare la racine du site (et non une sous-page), puis au plus haut
  // placé, puis au siège plutôt qu'à une antenne (« Arcom - Nouvelle-Calédonie »).
  // Affinité : le libellé du domaine (« inrae » pour inrae.fr) figure dans le sigle ou le nom du service.
  const affinity = (r, url) => {
    const label = flat((hostOf(url) || '').replace(/^www\./, '').split('.')[0]);
    if (label.length < 3) return 1;
    const sigle = flat(r.sigle || r.nom.match(/\(([^)]+)\)\s*$/)?.[1]);
    return sigle === label || initials(r.nom) === label || flat(r.nom).includes(label) ? 0 : 1;
  };
  // Propriétaire manifeste : sigle ou initiales identiques au domaine (ofb.gouv.fr -> OFB).
  const owns = (r, host) => {
    const label = flat(host.replace(/^www\./, '').split('.')[0]);
    const sigle = flat(r.sigle || r.nom.match(/\(([^)]+)\)\s*$/)?.[1]);
    return label.length >= 3 && (sigle === label || initials(r.nom) === label);
  };
  const rankOf = (r, url = '') => [/^https?:\/\/[^/]+\/?$/i.test(url) ? 0 : 1, affinity(r, url), ancestors(r.id).length, / - /.test(r.nom) ? 1 : 0];
  const better = (rank, prev) => !prev || rank.reduce((acc, v, i) => acc || Math.sign(v - prev.rank[i]), 0) < 0;

  // Chaîne de rattachement, du ministère (ou de la section) jusqu'au parent direct du service.
  const info = r => {
    const t = tutelleOf(r);
    const section = sectionOf.get(r.id) || '';
    const chain = ancestors(r.id).reverse().map(id => labelOf(id, t.name));
    // Les ambassades relèvent du ministère de l'Europe et des Affaires étrangères.
    if (/ambassade/i.test(section) && norm(chain[0] || '') !== norm(MEAE)) chain.unshift(MEAE);
    return {
      organisme: labelOf(r.id, t.name),
      chain,
      section,
      typeOrganisme: r.type_organisme || '',
      tutelle: t.name || (/ambassade/i.test(section) ? MEAE : ''),
      tutelleVia: t.via,
      urlAnnuaire: r.url_service_public || '',
      siren: r.siren || '',
      sitesDeclares: (r.site_internet || []).join(' ; '),
    };
  };

  const sites = new Map(), declarers = new Map(), bySiren = new Map();
  for (const r of rows) {
    for (const url of r.site_internet) {
      const host = hostOf(url);
      if (!host || !host.includes('.')) continue;
      const key = siteKey(host), rank = rankOf(r, url);
      if (better(rank, sites.get(key))) sites.set(key, { host, record: r, rank });
      if (!declarers.has(key)) declarers.set(key, new Set());
      declarers.get(key).add(r);
    }
    const rank = rankOf(r);
    if (r.siren && better(rank, bySiren.get(r.siren))) bySiren.set(r.siren, { record: r, rank });
  }
  // Entité de premier niveau d'un service : lui-même s'il est directement sous un ministère (ou à
  // la racine d'une section), sinon son ancêtre situé à ce niveau (agence > délégation…).
  const entityOf = r => {
    const chain = ancestors(r.id).reverse();
    if (!chain.length) return r.id;
    const start = isMinistry(nameOf.get(chain[0]) || '') ? 1 : 0;
    return chain[start] || r.id;
  };
  const recordOf = id => byId.get(id) || { id, nom: nameOf.get(id) || '', type_organisme: '', url_service_public: '', siren: '', enfants: [] };
  const siteInfo = key => {
    const s = sites.get(key);
    if (!s) return null;
    const base = info(s.record);
    const all = [...declarers.get(key)];
    // Le déclarant retenu est manifestement le propriétaire du site (sigle, initiales ou nom) :
    // le site lui est rattaché, sans passer par le vote des autres services déclarants.
    if (all.length < 2 || owns(s.record, s.host)) return base;
    // Site déclaré par un organisme et ses propres antennes (délégations, directions régionales) :
    // il appartient à cet organisme.
    const byEntity = new Map();
    for (const r of all) { const e = entityOf(r); byEntity.set(e, (byEntity.get(e) || 0) + 1); }
    const [entity, m] = [...byEntity].sort((a, b) => b[1] - a[1])[0];
    // Conditions : l'organisme déclare lui-même le site, et aucun ministère n'est déclarant
    // (sinon c'est le site du ministère, ex. defense.gouv.fr).
    const selfDeclares = all.some(r => r.id === entity);
    const ministryDeclares = all.some(r => isMinistry(r.nom));
    // Au-delà de 100 déclarants, c'est un site de ministère (defense.gouv.fr, info.gouv.fr).
    if (all.length <= 100 && selfDeclares && !ministryDeclares && m / all.length >= 0.5 && !isMinistry(nameOf.get(entity) || byId.get(entity)?.nom || '')) {
      return { ...info(recordOf(entity)), tutelleVia: `déclaré par l'organisme et ${m - 1} de ses services` };
    }
    // Tutelle majoritaire parmi les services qui déclarent ce site.
    const votes = new Map();
    for (const r of all) {
      const t = tutelleOf(r).name || (isMinistry(r.nom) ? r.nom : '');
      if (t) votes.set(t, (votes.get(t) || 0) + 1);
    }
    const [top, n] = [...votes].sort((a, b) => b[1] - a[1])[0] || [];
    if (!top || n / all.length < 0.5) return base;
    // Site commun à plusieurs services d'un ministère : rattaché au ministère lui-même.
    if (n >= 3) return { ...base, organisme: top, chain: [], typeOrganisme: 'Administration centrale (ou Ministère)', tutelle: '', tutelleVia: 'déclaré par ' + n + ' services', urlAnnuaire: '' };
    return base.tutelle ? base : { ...base, tutelle: top, tutelleVia: 'services déclarants' };
  };
  // Entités de premier niveau : directement sous un ministère, ou à la racine d'une section
  // (autorités indépendantes, institutions et juridictions), avec les sites qu'elles déclarent.
  const firstLevel = () => rows.filter(r => {
    const h = hier[r.id];
    if (!h || isMinistry(r.nom)) return false;
    return h.parents.length === 0 ? !/^minist/i.test(h.section) : h.parents.length === 1 && isMinistry(h.parents[0].nom);
  }).map(r => ({
    info: info(r),
    type: r.type_organisme || '',
    hosts: [...new Set(r.site_internet.map(u => siteKey(hostOf(u) || '')).filter(Boolean))]
      .map(key => ({ key, declarers: declarers.get(key)?.size || 0, owned: owns(r, key) })),
  }));
  return {
    firstLevel,
    sites: [...sites.entries()].map(([key, { host }]) => ({
      key, url: `https://${host}`, ...siteInfo(key), source: 'Annuaire de l\'administration',
    })),
    site: siteInfo,
    siren: siren => { const s = bySiren.get(siren); return s && info(s.record); },
  };
}
