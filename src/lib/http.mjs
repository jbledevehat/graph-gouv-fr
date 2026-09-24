// Vérification de disponibilité d'une URL (suit les redirections).
import { lookup } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import { hostOf, siteKey, swapScheme } from './url.mjs';

// Limitation par serveur : beaucoup de sites de l'État partagent la même plateforme
// (préfectures notamment), qui bannit temporairement les clients trop pressés.
const ipCache = new Map(), slots = new Map();

async function ipOf(host) {
  if (!ipCache.has(host)) ipCache.set(host, lookup(host).then(r => r.address).catch(() => host));
  return ipCache.get(host);
}

async function throttled(url, { perIp = 1, perIpGapMs = 2000 }, fn) {
  let host;
  try { host = new URL(url).hostname; } catch { return fn(); }
  const ip = await ipOf(host);
  const slot = slots.get(ip) || slots.set(ip, { active: 0, last: 0, queue: [] }).get(ip);
  while (slot.active >= perIp) await new Promise(r => slot.queue.push(r));
  slot.active++;
  const wait = slot.last + perIpGapMs - Date.now();
  slot.last = Math.max(Date.now(), slot.last + perIpGapMs);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  try { return await fn(); } finally { slot.active--; slot.queue.shift()?.(); }
}

// Pages de parking (bureau d'enregistrement) ou pages par défaut d'un serveur : le domaine
// répond, mais il n'y a plus de site.
const PARKED = /Welcome to nginx|Apache2? .{0,20}Default Page|<title>\s*It works!|IIS Windows Server|Test Page for the (Apache|Nginx)|domaine? (est )?(parqué|en vente|à vendre)|domain (is|may be) for sale|parked (free|domain)|Ce nom de domaine a été réservé/i;

export function isParked(html, finalUrl) {
  if (!html) return false;
  const title = (html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] || '').trim().toLowerCase();
  let host = '';
  try { host = new URL(finalUrl).hostname; } catch {}
  // Gandi et d'autres affichent une page dont le titre est le nom de domaine lui-même.
  return PARKED.test(html) || (title && (title === host || title === host.replace(/^www\./, '')));
}

// Lit au plus `max` octets du corps de la réponse.
async function readHead(res, max = 32768) {
  const reader = res.body?.getReader();
  if (!reader) return '';
  const chunks = [];
  let size = 0;
  try {
    while (size < max) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value); size += value.length;
    }
  } catch {}
  reader.cancel().catch(() => {});
  return Buffer.concat(chunks).toString('utf8');
}

const isTlsError = err => /CERT|LEAF|SELF_SIGNED|SSL|TLS|ERR_INVALID_URL/i.test(err || '');

// Requête sans vérification du certificat, redirections suivies à la main.
// Sert uniquement à savoir si un serveur mal configuré (chaîne TLS incomplète…) répond.
function lenientProbe(url, { timeoutMs, userAgent, maxBytes = 32768 }, hops = 0) {
  return new Promise(resolve => {
    let target;
    try { target = new URL(url); } catch { return resolve({ url, code: null, error: 'ERR_INVALID_URL' }); }
    const lib = target.protocol === 'https:' ? https : http;
    const req = lib.get(target, { rejectUnauthorized: false, timeout: timeoutMs, headers: { 'user-agent': userAgent } }, res => {
      const loc = res.headers.location;
      const isRedirect = res.statusCode >= 300 && res.statusCode < 400 && loc && hops < 8;
      if (isRedirect) res.resume();
      if (isRedirect) {
        let next;
        try { next = new URL(loc, target).href; } catch { return resolve({ url, code: null, error: `Redirection invalide (${loc})` }); }
        lenientProbe(next, { timeoutMs, userAgent, maxBytes }, hops + 1).then(r => resolve({ ...r, url }));
      } else {
        let html = '';
        res.setEncoding('utf8');
        res.on('data', d => { html += d; if (html.length > maxBytes) res.destroy(); });
        const done = () => resolve({ url, code: res.statusCode, finalUrl: target.href, lenient: true, html,
          parked: res.statusCode < 300 && isParked(html, target.href) });
        res.on('end', done); res.on('close', done);
      }
    });
    req.on('timeout', () => req.destroy(new Error('Timeout')));
    req.on('error', e => resolve({ url, code: null, error: e.code || e.message }));
  });
}

function probe(url, opts) {
  return throttled(url, opts, () => rawProbe(url, opts));
}

async function rawProbe(url, { timeoutMs, userAgent }) {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'user-agent': userAgent, accept: 'text/html,*/*;q=0.8' },
    });
    const html = /html/i.test(res.headers.get('content-type') || '') ? await readHead(res) : (res.body?.cancel().catch(() => {}), '');
    return { url, code: res.status, finalUrl: res.url, parked: res.ok && isParked(html, res.url) };
  } catch (e) {
    const cause = e.cause?.code || e.cause?.message || e.name || e.message;
    const error = String(cause);
    if (!isTlsError(error)) return { url, code: null, error };
    const { html, ...r } = await lenientProbe(url, { timeoutMs, userAgent });
    return { ...r, tlsError: error };
  }
}

// 401/403 : le site existe mais filtre l'accès (souvent un pare-feu anti-robots).
const isUp = code => code != null && (code < 400 || code === 401 || code === 403);
// Un 401/403 derrière un certificat invalide ne prouve pas qu'un site existe encore.
const isLive = a => isUp(a.code) && !a.parked && !(a.tlsError && a.code >= 400);
// Échecs considérés comme définitifs : domaine inexistant, connexion refusée, page absente.
const isGone = a => a.parked || [404, 410].includes(a.code) || /ENOTFOUND|ECONNREFUSED|Redirection invalide/.test(a.error || '');

export async function checkUrl(url, opts) {
  const attempts = [];
  // Variantes essayées : schéma inverse, puis avec « www. » (ex. préfectures : somme.gouv.fr -> www.somme.gouv.fr).
  const variants = [url, swapScheme(url)];
  if (!/^https?:\/\/www\./i.test(url)) {
    const withWww = url.replace(/^(https?:\/\/)/i, '$1www.');
    variants.push(withWww, swapScheme(withWww));
  }
  for (const u of variants) {
    const r = await probe(u, opts);
    attempts.push(r);
    if (isLive(r)) break;
  }
  const ok = attempts.find(isLive);
  const last = ok || attempts[0];
  let statut;
  if (ok) {
    const from = siteKey(hostOf(url)), to = siteKey(hostOf(ok.finalUrl));
    // Même site : même hôte (au « www. » près) ou redirection vers l'un de ses sous-domaines.
    statut = from === to || to.endsWith('.' + from) ? 'En ligne' : 'Redirigé';
  } else {
    // Hors ligne seulement sur une preuve nette ; sinon (limitation de débit, timeout, 5xx…) on ne conclut pas.
    statut = attempts.every(a => isGone(a)) ? 'Hors ligne' : 'Indéterminé';
  }
  return {
    url,
    statut,
    code: last.code,
    finalUrl: ok?.finalUrl || null,
    error: ok ? (ok.tlsError ? `Certificat TLS : ${ok.tlsError}` : null)
      : attempts.map(a => a.parked ? `Page de parking (${a.code})` : a.error || a.code).join(' / '),
    checkedAt: new Date().toISOString(),
  };
}

export async function pool(items, concurrency, fn, onProgress) {
  const out = new Array(items.length);
  let next = 0, done = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
      onProgress?.(++done, items.length);
    }
  }));
  return out;
}

// Bloc-marque du Système de design de l'État (DSFR) : nom du ministère ou de l'institution
// affiché sous la Marianne dans l'en-tête (<p class="fr-logo">Ministère<br>de la Culture</p>).
export function extractMarque(html) {
  const m = html.match(/<(p|span|div|a)\b[^>]*class="[^"]*\bfr-logo\b[^"]*"[^>]*>([\s\S]*?)<\/\1>/i);
  if (!m) return null;
  const text = m[2]
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#0?39;|&rsquo;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  return text || null;
}

// « Ministère de … » cités dans le texte de la page (hors scripts et styles), 20 au plus.
export function extractMentions(html) {
  const text = html
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&#0?39;|&rsquo;|&apos;/g, "'")
    .replace(/[ \t]+/g, ' ');
  return [...text.matchAll(/Minist[eè]re (?:de la |de l'|des |du |de |chargé )[^\n.;|()«»"]{3,140}/gi)]
    .map(m => m[0].trim()).slice(0, 20);
}

// Page d'accueil (300 Ko au plus) pour en lire le bloc-marque.
export async function fetchMarque(url, { timeoutMs, userAgent, perIp, perIpGapMs }) {
  return throttled(url, { perIp, perIpGapMs }, async () => {
    try {
      const res = await fetch(url, {
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs),
        headers: { 'user-agent': userAgent, accept: 'text/html' },
      });
      const html = /html/i.test(res.headers.get('content-type') || '') ? await readHead(res, 300000) : '';
      return { marque: extractMarque(html), mentions: extractMentions(html), finalUrl: res.url, code: res.status };
    } catch (e) {
      const error = String(e.cause?.code || e.cause?.message || e.name || e.message);
      // Certificat invalide : lecture de la page sans vérification (lecture publique seulement).
      if (isTlsError(error)) {
        const r = await lenientProbe(url, { timeoutMs, userAgent, maxBytes: 300000 });
        if (r.html) return { marque: extractMarque(r.html), mentions: extractMentions(r.html), finalUrl: r.finalUrl, code: r.code };
      }
      return { marque: null, mentions: [], error };
    }
  });
}
