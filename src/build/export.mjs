// Liste des sites (CSV et JSON), graphe GEXF et page web.
import { readdir, readFile } from 'node:fs/promises';
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

// Le site gouvfr.jbledevehat.fr : une page d'accueil, puis deux sections.
//   /                      accueil : partager les données pour piloter les politiques publiques
//   /sites/                carte des sites web de l'État, et /sites/pilotage.html
//   /budget/               argent public et budget de l'État, et /budget/aides.html
// Les anciennes adresses (sites.csv, sites.json, carte.pdf, pilotage.html) restent valides.
export async function writeWeb(webData, rows) {
  await writeOut('out/web/sites/graph.json', JSON.stringify(webData));
  await writeSiteLists(rows, 'out/web/sites');
  await writeSiteLists(rows, 'out/web'); // anciennes adresses
  const domain = config.site?.domain;
  if (domain) await writeOut('out/web/CNAME', domain + '\n');
  const base = domain ? `https://${domain}/` : '';
  const sites = rows.filter(r => r.type !== 'archivé').length;
  const admins = webData.nodes.filter(n => ['ministere', 'administration'].includes(n[4])).length;
  const demarches = new Set(rows.flatMap(r => r.demarches_essentielles)).size;
  const n = x => x.toLocaleString('fr-FR').replace(/ /g, ' ');
  const counts = `${n(sites)} sites et sous-domaines, ${n(admins)} administrations`;

  // --- Section « Sites web de l'État » ---
  await writePage('web/carte.html', 'out/web/sites/index.html', {
    base, url: `${base}sites/`,
    title: `Carte des sites web de l'État : ${counts}`,
    description: `Tous les sites web de l'État et de ses opérateurs (${counts}), rattachés à leur ministère. Liste complète en CSV et JSON, carte en PDF, mise à jour chaque mois. Données ouvertes.`,
    dataset: { sites, admins }, dataUrl: `${base}sites/`,
  });
  await writePage('web/pilotage.html', 'out/web/sites/pilotage.html', {
    base, url: `${base}sites/pilotage.html`,
    title: "Pilotage des sites web de l'État : tableau de bord et feuille de route",
    description: `Tableau de bord des ${counts} de l'État : réponses des serveurs, sites par ministère, démarches essentielles, actions à mener et feuille de route.`,
  });
  await writeOut('out/web/pilotage.html', redirection('sites/pilotage.html', `${base}sites/pilotage.html`));

  // --- Section « Budget de l'État » (pages et données de budget/, construites à part) ---
  const argent = JSON.parse(await readFile(path('budget/donnees/argent-public-2024.json'), 'utf8'));
  const budget = JSON.parse(await readFile(path('budget/donnees/budget-etat-2024.json'), 'utf8'));
  const md = v => `${Math.round(v).toLocaleString('fr-FR').replace(/ /g, ' ')} Md€`;
  const depenses = md(argent.total_depenses);
  const aides = md(budget.aides.reduce((t, a) => t + (a.montant || 0), 0) / 1000);
  const budgetEtat = md(budget.equilibre.depenses_nettes_hors_fdc / 1000);
  await writeBudgetPage('budget/index.html', 'out/web/budget/index.html', {
    base, url: `${base}budget/`,
    title: `L'argent public en 2024 : ${depenses} de dépenses publiques, le budget de l'État ministère par ministère`,
    description: `Toutes les dépenses et recettes publiques de 2024 (État, sécurité sociale, collectivités, opérateurs), le budget de l'État par ministère et les aides aux entreprises, d'après l'Insee et la DGFiP. Sources vérifiées, données ouvertes.`,
  });
  await writeBudgetPage('budget/aides.html', 'out/web/budget/aides.html', {
    base, url: `${base}budget/aides.html`,
    title: `Aides publiques aux entreprises : ${aides} et ${n(budget.aides.length)} dispositifs en 2024`,
    description: `Les ${n(budget.aides.length)} aides aux entreprises recensées par le rapport annexé au projet de loi de finances pour 2027 : socle et périmètre élargi, par instrument et par ministère. Chiffres vérifiés ligne à ligne.`,
  });
  for (const f of await readdir(path('budget/donnees'))) {
    await writeOut(`out/web/budget/donnees/${f}`, await readFile(path(`budget/donnees/${f}`)));
  }
  await writeOut('out/web/budget/sources/aides-entreprises/aides-entreprises-2024.json', await readFile(path('budget/sources/aides-entreprises/aides-entreprises-2024.json')));

  // --- Accueil ---
  const secu = argent.secteurs.find(x => x.code === 'S1314').total;
  const part = code => argent.secteurs.find(x => x.code === code).total;
  await writePage('web/accueil.html', 'out/web/index.html', {
    base, url: base, siteName: "Piloter l'action publique par les données",
    title: "Partager les données publiques pour piloter nos politiques publiques",
    description: `Deux tableaux de bord ouverts et vérifiés : les sites web de l'État (${counts}) et l'argent public (${depenses} de dépenses publiques en 2024, budget de l'État, aides aux entreprises).`,
    vars: {
      sites: n(sites), admins: n(admins), demarches: n(demarches), depenses, budget: budgetEtat, aides,
      part_secu: secu.toFixed(1), part_reste: (argent.total_depenses - secu).toFixed(1),
      part_coll: part('S1313').toFixed(1), part_op: part('S13112').toFixed(1),
    },
  });

  // --- Référencement : image d'aperçu, robots.txt et plan du site ---
  await writeOut('out/web/apercu.jpg', await readFile(path('web/apercu.jpg')));
  if (base) {
    await writeOut('out/web/robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${base}sitemap.xml\n`);
    const urls = ['', 'sites/', 'sites/pilotage.html', 'budget/', 'budget/aides.html'].map(p => `  <url><loc>${base}${p}</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq></url>`);
    await writeOut('out/web/sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`);
  }
}

// Page qui renvoie vers la nouvelle adresse d'une page déplacée.
const redirection = (cible, canonique) => `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Page déplacée</title>
<meta name="robots" content="noindex">
<link rel="canonical" href="${canonique || cible}">
<meta http-equiv="refresh" content="0; url=${cible}">
</head>
<body>
<p>Cette page a été déplacée : <a href="${cible}">${cible}</a>.</p>
</body>
</html>
`;

const esc = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const SOURCE_DINUM = 'https://gitlab.adullact.net/dinum/noms-de-domaine-organismes-secteur-public';
const REPO = 'https://github.com/jbledevehat/graph-gouv-fr';

// Fiche du jeu de données (schema.org), lue par les moteurs de recherche (Google Dataset Search).
function datasetJsonLd({ dataUrl: base, title, description }) {
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

// Balises de référencement et d'aperçu (réseaux sociaux) d'une page.
function headTags(meta) {
  const image = `${meta.base}apercu.jpg`;
  return [
    `<title>${esc(meta.title)}</title>`,
    `<meta name="description" content="${esc(meta.description)}">`,
    `<meta name="author" content="Jean-Baptiste Le Dévéhat">`,
    ...(meta.url ? [`<link rel="canonical" href="${meta.url}">`] : []),
    `<meta property="og:type" content="website">`,
    `<meta property="og:locale" content="fr_FR">`,
    `<meta property="og:site_name" content="${esc(meta.siteName || "Piloter l'action publique par les données")}">`,
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
}

// Page complète du budget (budget/*.html) : on remplace son titre et sa description par les
// balises de référencement du site.
async function writeBudgetPage(source, target, meta) {
  const page = (await readFile(path(source), 'utf8'))
    .replace(/<title>[^<]*<\/title>\n?/, '')
    .replace(/<meta name="description"[^>]*>\n?/, '');
  if (!page.includes('</head>')) throw new Error(`${source} : balise </head> introuvable`);
  await writeOut(target, page.replace('</head>', headTags(meta) + '\n</head>'));
}

// Fragment HTML de web/ placé dans une page complète, avec les balises de référencement et
// d'aperçu (réseaux sociaux). Le titre du fragment est remplacé par celui de la page, et les
// {{variables}} par leur valeur.
async function writePage(source, target, meta) {
  const page = (await readFile(path(source), 'utf8')).replace(/<title>[^<]*<\/title>\n?/, '')
    .replace(/\{\{(\w+)\}\}/g, (m, k) => { if (!(k in (meta.vars || {}))) throw new Error(`${source} : valeur manquante pour {{${k}}}`); return esc(meta.vars[k]); });
  const head = headTags(meta);

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
