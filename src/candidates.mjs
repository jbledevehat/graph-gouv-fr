// Domaines absents de la carte V1, à vérifier puis à ajouter :
// - sites des services nationaux de l'annuaire (tous domaines) ;
// - domaines *.gouv.fr de la liste DINUM qui répondent (d'après la DINUM) ;
// - domaines de l'État typés par la DINUM (ambassades, académies, universités…) ;
// - adresses des démarches essentielles de l'Observatoire ;
// - sous-domaines d'un site de la carte ou d'un de ces nouveaux sites : liste DINUM (tous
//   domaines, s'ils répondent d'après elle) et journaux de certificats (crt.sh, filtrés par le DNS).
import { annuaireIndex } from './annuaire.mjs';
import { config } from './context.mjs';
import { hostOf, isUrl, registrable, siteKey } from './lib/url.mjs';

// Variante d'environnement d'un nom existant : « lesfondamentauxdev » ou « mission-jaures-val »
// quand « lesfondamentaux » / « mission-jaures » existe (le nom seul ne suffit pas : festival, carnaval).
export function isEnvVariant(key, existing) {
  const m = key.match(/^([a-z0-9-]+?)-?(dev|val|qa|rec|recette|preprod|test|staging)\.(.+)$/);
  return !!m && existing.has(`${m[1]}.${m[3]}`);
}

// Noms techniques (api., recette, solr…) : config.candidates.excludePatterns.
export const technicalPatterns = () => config.candidates.excludePatterns.map(re => new RegExp(re, 'i'));
// Outils liés à la sécurité (gestionnaires de mots de passe, VPN, pare-feu, authentification,
// supervision, administration technique) : leur adresse n'a pas à figurer sur une carte publique.
// config.candidates.securityPatterns, testé sur chaque segment du nom (vaultwarden.ademe.fr).
export const securityPatterns = () => (config.candidates.securityPatterns || []).map(re => new RegExp(re, 'i'));
// Environnements hors production (préproduction, recette, test, bac à sable, maquette…) :
// config.candidates.nonProductionPatterns (ppd.ants.gouv.fr, pp-www.arcom.fr, bas.portail.cnsa.fr).
export const nonProductionPatterns = () => (config.candidates.nonProductionPatterns || []).map(re => new RegExp(re, 'i'));
// Adresse à ne pas publier (outil de sécurité ou environnement hors production), sauf exception
// (config.candidates.securityKeep : portes publiques de connexion).
export function securityFilter() {
  const patterns = [...securityPatterns(), ...nonProductionPatterns()], keep = new Set(config.candidates.securityKeep || []);
  return key => !keep.has(key) && patterns.some(re => re.test(key));
}

export function selectCandidates({ elements, dinumRows, annuaireRows, crtsh, demarches }) {
  const { suffix, includeSubdomains } = config.candidates;
  const patterns = technicalPatterns(), isSecurityTool = securityFilter();
  const excludedDomains = new Set(config.candidates.excludeDomains || []);
  const excluded = key => patterns.some(re => re.test(key)) || isSecurityTool(key)
    || key.split('.').some((_, i, parts) => excludedDomains.has(parts.slice(i).join('.')));
  const known = new Set(elements.filter(e => isUrl(e.label)).map(e => siteKey(hostOf(e.label))));
  const answered = s => /^([23]\d\d|401|403)\b/.test(s || '');
  const candidates = new Map();

  for (const c of annuaireIndex(annuaireRows).sites) {
    if (known.has(c.key) || excluded(c.key)) continue;
    candidates.set(c.key, c);
  }

  // Une entrée par domaine ; on préfère l'entrée « www. » si elle répond en HTTPS.
  const dinum = new Map();
  for (const r of dinumRows) {
    const key = siteKey(r.name);
    if (!key || known.has(key) || excluded(key)) continue;
    if (!answered(r.http_status) && !answered(r.https_status)) continue;
    const prev = dinum.get(key);
    if (!prev || (answered(r.https_status) && !answered(prev.https_status))) dinum.set(key, r);
  }
  const fromDinum = (key, r) => ({
    key,
    url: `${answered(r.https_status) ? 'https' : 'http'}://${r.name}`,
    siren: r.SIREN || '',
    source: `DINUM (${r.sources})`,
  });
  for (const [key, r] of dinum) {
    if (!key.endsWith('.' + suffix) || key !== registrable(key, suffix)) continue;
    const fromAnnuaire = candidates.get(key);
    if (fromAnnuaire) fromAnnuaire.source += ' + DINUM';
    else candidates.set(key, fromDinum(key, r));
  }
  const stateTypes = config.candidates.dinumTypes || {};
  for (const [key, r] of dinum) {
    if (!(r.type in stateTypes) || candidates.has(key)) continue;
    candidates.set(key, { ...fromDinum(key, r), dinumType: r.type });
  }
  const sorted = () => [...candidates.values()].sort((a, b) => a.key.localeCompare(b.key));
  if (!includeSubdomains) return sorted();

  // Sous-domaines : rattachés au site connu le plus proche en remontant les labels.
  const parents = new Set([...known, ...candidates.keys()]);
  const parentOf = key => {
    const labels = key.split('.');
    for (let i = 1; i < labels.length - 1; i++) {
      const up = labels.slice(i).join('.');
      if (up === suffix) break; // « gouv.fr » est un suffixe, pas un site parent
      if (parents.has(up)) return up;
    }
    return null;
  };
  const allNames = new Set([...known, ...dinum.keys(), ...Object.values(crtsh).flatMap(x => x.names.map(siteKey))]);
  const addSub = (key, make) => {
    if (!key || known.has(key) || candidates.has(key) || excluded(key) || isEnvVariant(key, allNames)) return;
    const parentKey = parentOf(key);
    if (parentKey) candidates.set(key, { ...make(), parentKey });
    // Sous-domaine gouv.fr dont aucun parent n'est sur la carte : ajouté seul (rattaché ensuite
    // par config/rattachements.csv, l'annuaire ou le bloc-marque).
    else if (key.endsWith('.' + suffix) && key !== registrable(key, suffix)) candidates.set(key, make());
  };
  for (const [key, r] of dinum) addSub(key, () => fromDinum(key, r));

  // Démarches essentielles : source sûre, ni filtre de noms ni condition de parent.
  for (const d of demarches) {
    const key = d.url && siteKey(hostOf(d.url));
    if (!key || known.has(key) || candidates.has(key)) continue;
    const parentKey = parentOf(key);
    candidates.set(key, { key, url: `https://${hostOf(d.url)}`, source: 'Observatoire des démarches essentielles', ...(parentKey && { parentKey }) });
  }

  for (const [domain, { names }] of Object.entries(crtsh)) {
    for (const name of names) {
      const key = siteKey(name);
      addSub(key, () => ({ key, url: `https://${name}`, source: `crt.sh (${domain})`, dnsCheck: true }));
    }
  }
  return sorted();
}
