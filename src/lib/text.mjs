// Comparaison d'intitulés d'administrations entre sources.

const unaccent = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');

// Casse, apostrophes et sigle final « (XXX) » ignorés.
export const norm = s => (s || '').toLowerCase().replace(/[’`]/g, "'").replace(/\s*\([^)]*\)\s*$/, '').replace(/\s+/g, ' ').trim();

// Lettres et chiffres seulement, sans accents : « Office français » -> « officefrancais ».
export const flat = s => unaccent(s).toLowerCase().replace(/[^a-z0-9]/g, '');

// Identifiant d'URL : « Côtes-d'Armor » -> « cotes-d-armor ».
export const slug = s => unaccent(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export const isMinistry = name => /^(ministère|premier ministre)/i.test(name);

// Mots significatifs d'un intitulé de ministère.
const STOP = new Set(['de', 'la', 'le', 'les', 'des', 'du', 'et', 'l', 'd', 'a', 'au', 'aux', 'en', 'pour', 'ministere', 'ministre', 'charge', 'chargee']);
export const words = s => unaccent(s).toLowerCase().split(/[^a-z0-9]+/).filter(w => w && !STOP.has(w));

// Initiales des mots significatifs : « Office français de la biodiversité » -> « ofb ».
export const initials = nom => unaccent(nom.replace(/\([^)]*\)/g, ' ')).toLowerCase()
  .split(/[^a-z0-9]+/).filter(w => w && !/^(de|la|le|les|des|du|d|l|et|en|pour|a|au|aux|sur)$/.test(w)).map(w => w[0]).join('');

// Clés de rapprochement d'un intitulé : nom sans accents ni mots vides, sigle entre parenthèses,
// et chaque partie autour d'un tiret (« ADEME - Agence de la transition écologique »).
export function nameKeys(name) {
  const keys = new Set();
  const add = (str, min) => {
    const k = unaccent(str).toLowerCase().replace(/[^a-z0-9]+/g, ' ')
      .replace(/\b(l|la|le|les|de|des|du|d|et|en|pour|a|au|aux)\b/g, ' ').replace(/\s+/g, ' ').trim();
    if (k.length >= min) keys.add(k);
  };
  const acronym = s => /^[A-Z0-9&.]{3,}$/.test(s.trim());
  const sigle = name.match(/\(([^)]+)\)\s*$/)?.[1];
  const base = name.replace(/\s*\([^)]*\)\s*$/, '');
  add(base, 6);
  if (sigle && acronym(sigle)) add(sigle, 3);
  for (const part of base.split(/\s+[-–]\s+/)) if (acronym(part) || part.length > 12) add(part, 3);
  return keys;
}

// Ministère désigné par un texte (bloc-marque, mention, ministère de l'Observatoire) :
// « Gouvernement » ou « Premier ministre » -> Premier ministre ; sinon l'intitulé (actuel ou
// ancien) dont les mots couvrent ceux du texte. names : [intitulé à comparer, libellé retenu].
export function ministryMatcher(names) {
  const entries = names.map(([name, label]) => ({ label, w: new Set(words(name)) }));
  const pm = names.find(([, label]) => norm(label) === 'premier ministre')?.[1];
  return text => {
    if (!text) return null;
    if (/gouvernement|premier ministre/i.test(text)) return pm || null;
    if (!/minist/i.test(text)) return null;
    const t = words(text);
    if (!t.length) return null;
    // Le texte est couvert par l'intitulé, ou l'intitulé entier figure dans le texte
    // (anciens intitulés composés : « ministère de l'Intérieur et des Outre-mer »).
    const tw = new Set(t);
    let best = null;
    for (const e of entries) {
      if (!e.w.size) continue;
      const inName = t.filter(w => e.w.has(w)).length / t.length;
      const inText = [...e.w].filter(w => tw.has(w)).length / e.w.size;
      const score = Math.max(inName, inText), tie = inName + inText;
      if (score >= 0.75 && (!best || score > best.score || (score === best.score && tie > best.tie))) best = { label: e.label, score, tie };
    }
    return best?.label || null;
  };
}
