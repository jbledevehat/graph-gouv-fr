// Liste des sites (CSV et JSON), graphe GEXF et page web.
import { readFile } from 'node:fs/promises';
import { config, jsonLines, path, today, writeOut } from '../context.mjs';
import { toCsv } from '../lib/csv.mjs';
import { hostOf, siteKey } from '../lib/url.mjs';
import { formerAddresses } from './duplicates.mjs';

const NO_POLE = 'Sans ministère identifié';
const TYPES = { site: 'site', 'sous-domaine': 'sous-domaine', archive: 'archivé' };
const list = s => String(s || '').split(' ; ').filter(Boolean);

// Colonnes de la liste des sites, dans l'ordre du CSV.
const SITE_COLUMNS = [
  'url', 'domaine', 'type', 'statut', 'code_http', 'url_finale', 'verifie_le',
  'site_parent', 'organisme', 'pole', 'rattachement', 'demarches_essentielles',
  'anciennes_adresses', 'source',
];

// Une ligne par site (sites, sous-domaines et sites archivés), triée par domaine.
export function siteRecords({ graph, parent }) {
  // Organisme : déclaré (annuaire), sinon l'administration à laquelle le site est relié, sinon
  // celui de son site parent.
  const ownOrg = url => graph.getNodeAttribute(url, 'Organisme')
    || graph.filterNeighbors(url, (n, b) => ['administration', 'ministere', 'personne'].includes(b.categorie)).sort()[0];
  const orgOf = url => ownOrg(url) || (parent.has(url) ? orgOf(parent.get(url)) : '');
  const rows = [];
  graph.forEachNode((url, a) => {
    if (!TYPES[a.categorie]) return;
    rows.push({
      url,
      domaine: siteKey(hostOf(url)),
      type: TYPES[a.categorie],
      statut: a.Statut || '',
      code_http: a['Code HTTP'] ? Number(a['Code HTTP']) : null,
      url_finale: a['URL finale'] || '',
      verifie_le: a['Vérifié le'] || '',
      site_parent: a['Site parent'] || '',
      organisme: orgOf(url) || '',
      pole: a.pole === NO_POLE ? '' : a.pole || '',
      rattachement: a['Rattachement déduit de'] || (a.bulle ? 'site parent' : ''),
      demarches_essentielles: list(a['Démarches essentielles']),
      anciennes_adresses: formerAddresses(a),
      source: a.Source || 'Carte V1 (2019)',
    });
  });
  return rows.sort((x, y) => x.domaine.localeCompare(y.domaine) || x.url.localeCompare(y.url));
}

export async function writeSiteLists(rows, dir) {
  const flat = rows.map(r => ({ ...r, demarches_essentielles: r.demarches_essentielles.join(' ; '), anciennes_adresses: r.anciennes_adresses.join(' ; ') }));
  await writeOut(`${dir}/sites.csv`, toCsv(flat, SITE_COLUMNS));
  await writeOut(`${dir}/sites.json`, jsonLines(rows));
}

// Pages web (carte et pilotage), données, domaine personnalisé de GitHub Pages.
export async function writeWeb(webData, rows) {
  await writeOut('out/web/graph.json', JSON.stringify(webData));
  await writeSiteLists(rows, 'out/web');
  const domain = config.site?.domain;
  if (domain) await writeOut('out/web/CNAME', domain + '\n');
  const base = domain ? `https://${domain}/` : '';
  const sites = rows.filter(r => r.type !== 'archivé').length;
  const admins = webData.nodes.filter(n => ['ministere', 'administration'].includes(n[4])).length;
  const n = x => x.toLocaleString('fr-FR').replace(/ /g, ' ');
  const counts = `${n(sites)} sites et sous-domaines, ${n(admins)} administrations`;
  await writePage('web/carte.html', 'out/web/index.html', {
    base, url: base,
    title: `Carte des sites web de l'État : ${counts}`,
    description: `Tous les sites web de l'État et de ses opérateurs (${counts}), rattachés à leur ministère. Liste complète en CSV et JSON, carte en PDF, mise à jour chaque mois. Données ouvertes.`,
    dataset: { sites, admins },
  });
  await writePage('web/pilotage.html', 'out/web/pilotage.html', {
    base, url: `${base}pilotage.html`,
    title: "Pilotage des sites web de l'État : tableau de bord et feuille de route",
    description: `Tableau de bord des ${counts} de l'État : réponses des serveurs, sites par ministère, démarches essentielles, actions à mener et feuille de route.`,
  });
  // Référencement : image d'aperçu, robots.txt et plan du site.
  await writeOut('out/web/apercu.jpg', await readFile(path('web/apercu.jpg')));
  if (base) {
    await writeOut('out/web/robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${base}sitemap.xml\n`);
    const urls = ['', 'pilotage.html'].map(p => `  <url><loc>${base}${p}</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq></url>`);
    await writeOut('out/web/sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`);
  }
}

const esc = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const SOURCE_DINUM = 'https://gitlab.adullact.net/dinum/noms-de-domaine-organismes-secteur-public';
const REPO = 'https://github.com/jbledevehat/graph-gouv-fr';

// Fiche du jeu de données (schema.org), lue par les moteurs de recherche (Google Dataset Search).
function datasetJsonLd({ base, title, description }) {
  const file = (name, format) => ({ '@type': 'DataDownload', encodingFormat: format, contentUrl: `${base}${name}` });
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: "Sites web publics de l'État",
    alternateName: title,
    description,
    url: base,
    sameAs: REPO,
    keywords: ['sites web', 'État', 'administration', 'service public', 'gouv.fr', 'opérateurs de l\'État', 'open data'],
    inLanguage: 'fr',
    license: 'https://www.etalab.gouv.fr/licence-ouverte-open-licence/',
    isAccessibleForFree: true,
    creator: { '@type': 'Person', name: 'Jean-Baptiste Le Dévéhat', url: 'https://jbledevehat.fr' },
    dateModified: today,
    temporalCoverage: `2019/${today}`,
    spatialCoverage: 'France',
    isBasedOn: [SOURCE_DINUM, 'https://lannuaire.service-public.gouv.fr'],
    distribution: [file('sites.csv', 'text/csv'), file('sites.json', 'application/json'), file('carte.pdf', 'application/pdf')],
  }).replace(/</g, '\\u003c');
}

// Fragment HTML de web/ placé dans une page complète, avec les balises de référencement et
// d'aperçu (réseaux sociaux). Le titre du fragment est remplacé par celui de la page.
async function writePage(source, target, meta) {
  const page = (await readFile(path(source), 'utf8')).replace(/<title>[^<]*<\/title>\n?/, '');
  const image = `${meta.base}apercu.jpg`;
  const head = [
    `<title>${esc(meta.title)}</title>`,
    `<meta name="description" content="${esc(meta.description)}">`,
    `<meta name="author" content="Jean-Baptiste Le Dévéhat">`,
    ...(meta.url ? [`<link rel="canonical" href="${meta.url}">`] : []),
    `<meta property="og:type" content="website">`,
    `<meta property="og:locale" content="fr_FR">`,
    `<meta property="og:site_name" content="Sites web publics de l'État">`,
    `<meta property="og:title" content="${esc(meta.title)}">`,
    `<meta property="og:description" content="${esc(meta.description)}">`,
    ...(meta.url ? [`<meta property="og:url" content="${meta.url}">`] : []),
    `<meta property="og:image" content="${image}">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta property="og:image:alt" content="Carte des sites web de l'État, regroupés par ministère">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    ...(meta.dataset ? [`<script type="application/ld+json">${datasetJsonLd(meta)}</script>`] : []),
  ].join('\n');
  // Présentation lisible sans JavaScript (moteurs de recherche, lecteurs sans script).
  const intro = meta.dataset ? `<noscript>
<h1>Carte des sites web de l'État</h1>
<p>${esc(meta.description)}</p>
<ul>
<li><a href="sites.csv">Liste des sites en CSV</a> · <a href="sites.json">en JSON</a></li>
<li><a href="carte.pdf">Carte en PDF haute résolution</a></li>
<li><a href="pilotage.html">Tableau de bord de pilotage</a></li>
<li><a href="${REPO}">Code et méthode sur GitHub</a> · source : <a href="${SOURCE_DINUM}">liste des noms de domaine publics (DINUM)</a></li>
</ul>
</noscript>
` : '';
  await writeOut(target, `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${head}
</head>
<body>
${intro}${page}
</body>
</html>
`);
}

export const webMeta = ({ map, graph, checkedOn }) => ({
  date: today,
  verifie: checkedOn,
  elements: map.elements.length,
  connexions: map.connections.length,
  nouveaux: map.additions.length + map.newOrgs.length,
  regroupes: [...graph.members.values()].reduce((n, l) => n + l.length, 0),
  bulles: graph.members.size,
});
