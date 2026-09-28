// Doublons : adresses qui mènent au même site (redirection) et entrées répétées de la V1. Le site
// d'arrivée est gardé ; les autres adresses deviennent ses « Anciennes adresses », leurs liens lui
// sont reportés et leurs sous-domaines rejoignent sa bulle.
import { hostOf, isUrl, siteKey } from '../lib/url.mjs';
import { OFF } from './model.mjs';

export const formerAddresses = e => String(e['Anciennes adresses'] || '').split(' ; ').filter(Boolean);

export function mergeDuplicates(map) {
  const finalKeyOf = e => siteKey(hostOf(e['URL finale'] || '') || hostOf(e.label));
  const byFinal = new Map();
  for (const e of map.elements) {
    if (!isUrl(e.label)) continue;
    const k = finalKeyOf(e);
    if (!byFinal.has(k)) byFinal.set(k, []);
    byFinal.get(k).push(e);
  }
  const mergedInto = new Map();
  for (const [k, list] of byFinal) {
    if (list.length < 2) continue;
    const own = e => siteKey(hostOf(e.label)) === k;
    const canon = list.find(e => own(e) && e.type !== OFF && e.Statut !== 'Hors ligne')
      || list.find(own) || list.find(e => e.Statut === 'En ligne') || list[0];
    const others = list.filter(e => e !== canon);
    for (const e of others) mergedInto.set(e.label, canon.label);
    canon['Anciennes adresses'] = [...new Set([...formerAddresses(canon), ...others.map(e => e.label)])].join(' ; ');
  }
  if (mergedInto.size) {
    const remap = l => mergedInto.get(l) || l;
    const seen = new Set(), kept = [];
    for (const c of map.connections) {
      const from = remap(c.from), to = remap(c.to);
      const k = `${from}\u0000${to}\u0000${c.type}`;
      if (from === to || seen.has(k)) continue;
      seen.add(k);
      kept.push({ ...c, from, to });
    }
    map.connections = kept;
    const keep = e => !mergedInto.has(e.label);
    map.elements = map.elements.filter(keep);
    map.additions = map.additions.filter(keep);
  }
  map.stats.merged = mergedInto.size;
  return mergedInto;
}
