// Données de la page de pilotage (out/web/pilotage.json) : une ligne compacte par site, et les
// démarches essentielles de l'Observatoire avec leurs indicateurs de qualité.
import { hostOf, siteKey } from '../lib/url.mjs';
import { formerAddresses } from './duplicates.mjs';

const TYPES = { site: 'site', 'sous-domaine': 'sous-domaine', archive: 'archivé' };
// Colonnes des lignes de sites, dans l'ordre (la page les lit par leur nom).
export const SITE_FIELDS = ['url', 'domaine', 'type', 'statut', 'code', 'pole', 'organisme', 'parent',
  'gouv', 'https', 'tls', 'central', 'demarches', 'source'];

export function pilotageData({ graph, parent }, { poles, meta }, demarches, checks) {
  const poleIndex = new Map(poles.map((p, i) => [p.id, i]));
  const isCentral = a => a.categorie === 'ministere' || a.categorie === 'personne'
    || /Administration centrale/.test(a['Type d\'organisme'] || '');
  const orgOf = url => graph.getNodeAttribute(url, 'Organisme')
    || graph.filterNeighbors(url, (n, b) => ['administration', 'ministere', 'personne'].includes(b.categorie)).sort()[0]
    || (parent.has(url) ? orgOf(parent.get(url)) : '');

  const rows = [], byKey = new Map();
  graph.forEachNode((url, a) => {
    if (!TYPES[a.categorie]) return;
    const host = hostOf(url);
    const finalUrl = a['URL finale'] || '';
    const row = [
      url,
      siteKey(host),
      TYPES[a.categorie],
      a.Statut || '',
      a['Code HTTP'] ? Number(a['Code HTTP']) : null,
      poleIndex.get(a.pole) ?? -1,
      orgOf(url) || '',
      a.bulle ? siteKey(hostOf(parent.get(url) || '')) : '',
      /(^|\.)gouv\.fr$/.test(host) ? 1 : 0,
      // Redirection vers HTTPS : adresse finale en https (un site servi en http sans redirection
      // n'oblige pas le chiffrement, même s'il le propose).
      finalUrl ? (finalUrl.startsWith('https://') ? 1 : 0) : (url.startsWith('https://') ? 1 : 0),
      // Certificat : 2 = erreur visible dans le navigateur (expiré, autosigné, mauvais nom) ;
      // 1 = chaîne incomplète, que les navigateurs complètent le plus souvent ; 0 = aucune.
      /Certificat TLS : (CERT_HAS_EXPIRED|ERR_TLS_CERT_ALTNAME_INVALID|DEPTH_ZERO_SELF_SIGNED_CERT|SELF_SIGNED_CERT_IN_CHAIN)/.test(a.Erreur || '') ? 2
        : /Certificat TLS/.test(a.Erreur || '') ? 1 : 0,
      !a.bulle && graph.someNeighbor(url, (n, b) => isCentral(b)) ? 1 : 0,
      a['Démarches essentielles'] ? a['Démarches essentielles'].split(' ; ').length : 0,
      (a.Source || 'Carte V1 (2019)').replace(/ \(.*\)$/, ''),
    ];
    rows.push(row);
    for (const u of [url, ...formerAddresses(a)]) byKey.set(siteKey(hostOf(u)), url);
  });
  rows.sort((x, y) => x[1].localeCompare(y[1]) || x[0].localeCompare(y[0]));

  const procedures = demarches.map(d => {
    const key = d.url && siteKey(hostOf(d.url));
    const site = key && byKey.get(key);
    return {
      titre: d.titre,
      ministere: d.ministere,
      administration: d.administration,
      url: d.url,
      site: site || '',
      pole: site ? poleIndex.get(graph.getNodeAttribute(site, 'pole')) ?? -1 : -1,
      volume: d.volume,
      ...d.indicateurs,
    };
  });
  // Domaines qui répondent sans site : page par défaut de l'hébergeur, site en construction,
  // page de parking. Absents de la carte (ou archivés), mais toujours détenus.
  const parked = checks.filter(c => /Page de parking/.test(c.error || '')).map(c => {
    const key = c.key || siteKey(hostOf(c.url));
    const site = byKey.get(key);
    return [c.url, key, site ? poleIndex.get(graph.getNodeAttribute(site, 'pole')) ?? -1 : -1, (c.source || 'Carte V1 (2019)').replace(/ \(.*\)$/, '')];
  }).sort((a, b) => a[1].localeCompare(b[1]));

  return {
    meta: { ...meta, observatoire: demarches.find(d => d.edition)?.edition || '' },
    poles: poles.map(p => ({ id: p.id, label: p.label })),
    fields: SITE_FIELDS,
    sites: rows,
    demarches: procedures,
    parked,
  };
}
