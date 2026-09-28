// Nouveaux sites : candidats vérifiés (annuaire, DINUM, certificats, démarches essentielles),
// chacun rattaché dès son ajout quand c'est possible.
import { config, today } from '../context.mjs';
import { isEnvVariant, technicalPatterns } from '../candidates.mjs';
import { hostOf, isUrl, registrable, siteKey } from '../lib/url.mjs';
import { MINISTRY_TYPE, OFF } from './model.mjs';
import { verification } from './v1.mjs';

const suffix = () => config.candidates.suffix;
// Sous-domaine : parent connu, ou nom en *.gouv.fr sous un domaine gouv.fr (registrable() ne
// reconnaît que ce suffixe : un domaine principal hors gouv.fr n'est pas un sous-domaine).
const isSubdomain = c => !!c.parentKey || (c.key.endsWith('.' + suffix()) && c.key !== registrable(c.key));

export function addCandidates(map, { v1, checks, ann, annSite, adminFor, demarcheHosts }) {
  for (const e of v1.elements) {
    if (!isUrl(e.label)) continue;
    map.known.add(siteKey(hostOf(e.label)));
    if (e['element type'] !== OFF) map.sites.set(siteKey(hostOf(e.label)), e.label);
  }
  // Filtres de noms appliqués aussi aux candidats déjà vérifiés (filtres renforcés depuis).
  const patterns = technicalPatterns();
  const candidateKeys = new Set(checks.filter(c => c.kind === 'candidate').map(c => c.key));
  const technical = key => patterns.some(re => re.test(key)) || isEnvVariant(key, candidateKeys);
  const skippedRedirects = [];
  // Sites d'abord, sous-domaines ensuite (leur parent doit déjà être connu), du plus court au plus long.
  const ordered = checks.filter(c => c.kind === 'candidate' && (demarcheHosts.has(c.key) || !technical(c.key)))
    .sort((a, b) => (!!a.parentKey - !!b.parentKey) || a.key.split('.').length - b.key.split('.').length || a.key.localeCompare(b.key));

  for (const c of ordered) {
    // Démarche essentielle (source sûre) redirigée vers une page de connexion ou qui bloque nos
    // vérifications (URSSAF…) : ajoutée à sa propre adresse, sauf si elle n'existe plus.
    const demarche = demarcheHosts.has(c.key);
    const ownUrl = demarche && c.statut !== 'Hors ligne' && !/ENOTFOUND/.test(c.error || '');
    if (c.statut === 'Redirigé' && !ownUrl) { skippedRedirects.push(c); continue; }
    // Un serveur qui répond par une erreur 5xx existe : le site est ajouté, à revérifier ; sauf un
    // sous-domaine en 500, 502 ou 503.
    const toRecheck = c.statut === 'Indéterminé' && (c.code >= 500 || ownUrl);
    if (c.statut !== 'En ligne' && !toRecheck && !ownUrl) continue;
    const sub = isSubdomain(c);
    if (toRecheck && [500, 502, 503].includes(c.code) && sub && !demarche) continue;
    const url = ownUrl ? c.url : c.finalUrl || c.url;
    if (map.known.has(siteKey(hostOf(url)))) continue;
    map.known.add(siteKey(hostOf(url)));
    const label = new URL(url).origin;

    const parentKey = c.parentKey === suffix() ? null : c.parentKey;
    const parent = parentKey ? map.sites.get(parentKey) : sub ? map.sites.get(registrable(c.key)) : null;
    // Organisme : déclaré dans l'annuaire pour ce site, sinon retrouvé par le SIREN de la DINUM.
    const info = annSite(c.key) || (c.siren && ann.siren(c.siren));
    // Priorité : site parent (bulle), annuaire, config/rattachements.csv, type DINUM.
    const admin = !parent && !info && adminFor(c.key);
    const typeMinistry = !admin && !parent && !info && c.dinumType ? (config.candidates.dinumTypes || {})[c.dinumType] : '';
    const tags = [sub ? 'Sous-domaine' : 'Site web', 'Nouveau', ...(toRecheck ? ['À revérifier'] : [])];
    if (admin) {
      if (!map.hasOrg(admin)) map.warnings.push(`Rattachement de ${c.key} : « ${admin} » absente de la carte, créée.`);
      map.connect(map.ensureOrg(admin), label, 'Site web/Administration');
    } else if (parent) map.connect(parent, label, 'Site web/Sous-domaine');
    else if (typeMinistry) map.connect(map.ensureOrg(typeMinistry, MINISTRY_TYPE), label, 'Site web/Administration');
    else if (info) map.attach(info, label);
    else tags.push('À rattacher');
    map.sites.set(c.key, label);
    map.additions.push({
      label,
      type: sub ? 'Sous-domaine' : 'Site web',
      tags,
      ...(parentKey && { 'Site parent': parentKey }),
      ...(c.dinumType && { 'Type DINUM': c.dinumType }),
      'Organisme': info?.organisme || '',
      'Tutelle': info?.tutelle || '',
      ...(info?.tutelleVia && info.tutelleVia !== 'hiérarchie' && { 'Rattachement déduit de': info.tutelleVia }),
      'SIREN': info?.siren || c.siren || '',
      'Source': c.source || '',
      'Ajouté le': today,
      ...verification(c),
    });
  }
  map.stats.skippedRedirects = skippedRedirects;
}

// Sites déclarés dans l'annuaire qui redirigent ailleurs (meteo.fr, cnnumerique.fr…) : l'organisme
// est relié au site d'arrivée, ajouté à la carte s'il n'y est pas déjà.
export function addRedirectTargets(map, { checks, annSite }) {
  const excludedDomain = key => (config.candidates.excludeDomains || []).some(d => key === d || key.endsWith('.' + d));
  let count = 0;
  for (const c of checks) {
    if (c.kind !== 'candidate' || c.statut !== 'Redirigé' || !c.finalUrl || c.parentKey || !/Annuaire/.test(c.source || '')) continue;
    const info = annSite(c.key);
    if (!info) continue;
    const finalKey = siteKey(hostOf(c.finalUrl));
    let label = map.sites.get(finalKey);
    if (!label) {
      if (map.known.has(finalKey) || excludedDomain(finalKey)) continue;
      label = new URL(c.finalUrl).origin;
      map.known.add(finalKey);
      map.sites.set(finalKey, label);
      map.additions.push({
        label, type: 'Site web', tags: ['Site web', 'Nouveau'],
        'Organisme': info.organisme, 'Tutelle': info.tutelle || '',
        'Source': `Annuaire de l'administration (${c.key} redirige ici)`, 'Ajouté le': today,
        ...verification({ ...c, statut: 'En ligne' }),
      });
    }
    map.attach(info, label);
    count++;
  }
  map.stats.viaRedirectSites = count;
}
