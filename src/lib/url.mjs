// Normalisation des URLs / domaines utilisés comme libellés dans Kumu.

export function isUrl(label) {
  return /^https?:\/\//i.test(label || '');
}

export function hostOf(label) {
  if (!label) return null;
  const s = label.trim().replace(/^https?:\/\//i, '');
  return s.split(/[/?#]/)[0].replace(/:\d+$/, '').replace(/\.$/, '').toLowerCase() || null;
}

// Clé de comparaison d'un site : hôte sans « www. ».
export function siteKey(host) {
  return host ? host.replace(/^www\./, '') : null;
}

// Domaine « enregistrable » sous un suffixe : a.b.gouv.fr -> b.gouv.fr
export function registrable(host, suffix = 'gouv.fr') {
  if (!host || !host.endsWith('.' + suffix)) return null;
  const rest = host.slice(0, -(suffix.length + 1)).split('.');
  return `${rest[rest.length - 1]}.${suffix}`;
}

export function swapScheme(url) {
  return url.startsWith('https://') ? 'http://' + url.slice(8) : 'https://' + url.replace(/^http:\/\//i, '');
}
