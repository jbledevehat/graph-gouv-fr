// Liste des sites (CSV et JSON), graphe GEXF et page web.
import { readdir, readFile } from 'node:fs/promises';
import { config, jsonLines, path, today, writeOut } from '../context.mjs';
import { toCsv } from '../lib/csv.mjs';
import { hostOf, siteKey } from '../lib/url.mjs';
import { formerAddresses } from './duplicates.mjs';
import { avecBandeau, SECTIONS } from './bandeau.mjs';

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
//   /budget/               exploration de l'argent public, /budget/pilotage.html et /budget/aides.html
// Toutes les pages portent le même bandeau (src/build/bandeau.mjs).
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
    title: `Carte des sites web de l'État : ${n(sites)} sites par ministère`,
    description: `Les ${n(sites)} sites web de l'État et de ses opérateurs, rattachés à leurs ${n(admins)} administrations : carte interactive, liste en CSV et JSON, mise à jour chaque mois.`,
    dataset: { sites, admins }, dataUrl: `${base}sites/`,
    bandeau: { racine: '../', section: 'sites', page: 'carte' },
  });
  await writePage('web/pilotage.html', 'out/web/sites/pilotage.html', {
    base, url: `${base}sites/pilotage.html`,
    title: "Pilotage des sites web de l'État : tableau de bord",
    description: `Tableau de bord des ${n(sites)} sites web de l'État : sites qui répondent, sites par ministère, démarches essentielles, actions à mener et feuille de route.`,
    bandeau: { racine: '../', section: 'sites', page: 'pilotage' },
  });
  await writeOut('out/web/pilotage.html', redirection('sites/pilotage.html', `${base}sites/pilotage.html`));

  // --- Section « Budget de l'État » (pages et données de budget/, construites à part) ---
  const argent = JSON.parse(await readFile(path('budget/donnees/argent-public-2024.json'), 'utf8'));
  // Années disponibles (budget/donnees/annees.json) : choix de l'année dans le bandeau.
  const A = JSON.parse(await readFile(path('budget/donnees/annees.json'), 'utf8'));
  const toutes = [...new Set([...A.insee, ...A.etat, ...A.aides])].sort();
  const annees = page => ({ toutes, page, reference: A.reference });
  const JEUX = jeuxBudget(base, A);
  const budget = JSON.parse(await readFile(path('budget/donnees/budget-etat-2024.json'), 'utf8'));
  const md = v => `${Math.round(v).toLocaleString('fr-FR').replace(/ /g, ' ')} Md€`;
  const depenses = md(argent.total_depenses);
  const aides = md(budget.aides.reduce((t, a) => t + (a.montant || 0), 0) / 1000);
  const budgetEtat = md(budget.equilibre.depenses_nettes_hors_fdc / 1000);
  await writeBudgetPage('budget/index.html', 'out/web/budget/index.html', {
    base, url: `${base}budget/`,
    title: "Dépenses et recettes publiques de la France, à explorer",
    description: `Où va l'argent public ? Les ${depenses} de dépenses publiques de 2024 et ce qui les finance, de 2019 à 2024, sur une carte à zoomer, fraude et non-recours compris.`,
    bandeau: { racine: '../', section: 'budget', page: 'exploration', annees: annees(A.insee) }, jsonld: [JEUX.argent],
  });
  await writeBudgetPage('budget/pilotage.html', 'out/web/budget/pilotage.html', {
    base, url: `${base}budget/pilotage.html`,
    title: "Budget de l'État par ministère et dépenses publiques",
    description: `Tableau de bord des finances publiques : dépenses par administration et par fonction (2019-2024), budget de l'État par ministère (2023-2025), Insee et DGFiP.`,
    bandeau: { racine: '../', section: 'budget', page: 'pilotage', annees: annees([...new Set([...A.insee, ...A.etat])].sort()) }, jsonld: [JEUX.argent],
  });
  await writeBudgetPage('budget/aides.html', 'out/web/budget/aides.html', {
    base, url: `${base}budget/aides.html`,
    title: `Aides publiques aux entreprises : ${aides} en 2024`,
    description: `Les ${n(budget.aides.length)} aides publiques aux entreprises de 2024, du rapport annexé au PLF 2027 : par instrument, par ministère, dispositif par dispositif, vérifiées ligne à ligne.`,
    bandeau: { racine: '../', section: 'budget', page: 'aides', annees: annees(A.aides) }, jsonld: [JEUX.aides],
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
    title: "Mieux piloter nos politiques publiques par la donnée",
    description: `Tableaux de bord ouverts et vérifiés : les ${n(sites)} sites web de l'État et l'argent public, ${depenses} de dépenses publiques en 2024, budget de l'État et aides.`,
    jsonld: [siteWeb(base)],
    vars: {
      sites: n(sites), admins: n(admins), demarches: n(demarches), depenses, budget: budgetEtat, aides,
      part_secu: secu.toFixed(1), part_reste: (argent.total_depenses - secu).toFixed(1),
      part_coll: part('S1313').toFixed(1), part_op: part('S13112').toFixed(1),
    },
    bandeau: { racine: '' },
  });

  // --- Page introuvable (servie par GitHub Pages pour toute adresse inconnue) ---
  await writePage('web/404.html', 'out/web/404.html', {
    base, title: 'Page introuvable', description: "Cette page n'existe pas ou plus : retrouvez les tableaux de bord du site.",
    robots: 'noindex', bandeau: { racine: '/' },
  });

  // --- Référencement : image d'aperçu, robots.txt et plan du site ---
  await writeOut('out/web/apercu.jpg', await readFile(path('web/apercu.jpg')));
  // Favicon : le logo du bandeau (quatre pavés de couleur).
  for (const f of ['favicon.svg', 'favicon.png', 'favicon.ico', 'apple-touch-icon.png']) {
    await writeOut(`out/web/${f}`, await readFile(path(`web/${f}`)));
  }
  if (base) {
    await writeOut('out/web/robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${base}sitemap.xml\n`);
    const urls = ['', 'sites/', 'sites/pilotage.html', 'budget/', 'budget/pilotage.html', 'budget/aides.html'].map(p => `  <url><loc>${base}${p}</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq></url>`);
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
const AUTEUR = { '@type': 'Person', name: 'Jean-Baptiste Le Dévéhat', url: 'https://jbledevehat.fr' };
const NOM_DU_SITE = "Piloter l'action publique par les données";

// Le site lui-même (page d'accueil).
const siteWeb = base => ({
  '@type': 'WebSite', name: NOM_DU_SITE, alternateName: 'Mieux piloter nos politiques publiques par la donnée',
  url: base, inLanguage: 'fr', author: AUTEUR, publisher: AUTEUR,
  description: "Tableaux de bord ouverts et vérifiés sur l'action publique : sites web de l'État, budget de l'État et argent public.",
});

// Fil d'Ariane d'une page, le même que celui du bandeau.
function filAriane(meta) {
  const S = meta.bandeau?.section && SECTIONS[meta.bandeau.section];
  if (!S || !meta.base) return null;
  const page = S.pages.find(p => p[0] === meta.bandeau.page);
  const etapes = [['Accueil', meta.base], [S.nom, meta.base + S.chemin], ...(page && page[2] !== S.chemin ? [[page[1], meta.base + page[2]]] : [])];
  return { '@type': 'BreadcrumbList', itemListElement: etapes.map(([name, item], i) => ({ '@type': 'ListItem', position: i + 1, name, item })) };
}

// Jeux de données de la section budget, décrits pour les moteurs de recherche de données.
function jeuxBudget(base, A) {
  const fichier = (chemin, format, nom) => ({ '@type': 'DataDownload', name: nom, encodingFormat: format, contentUrl: `${base}budget/${chemin}` });
  const commun = { inLanguage: 'fr', license: 'https://www.etalab.gouv.fr/licence-ouverte-open-licence/', isAccessibleForFree: true, creator: AUTEUR, dateModified: today, spatialCoverage: 'France', sameAs: REPO };
  return {
    argent: {
      '@type': 'Dataset', ...commun,
      name: 'Dépenses et recettes des administrations publiques françaises',
      description: "Dépenses de l'État, de la sécurité sociale, des collectivités locales et des opérateurs de l'État par fonction et sous-fonction, recettes par administration et impôt par impôt, et budget de l'État ministère par ministère, construits à partir des comptes de la Nation de l'Insee et des fichiers d'exécution de la DGFiP, contrôlés contre les chiffres officiels.",
      url: `${base}budget/`,
      keywords: ['budget de l\'État', 'dépenses publiques', 'recettes publiques', 'impôts', 'sécurité sociale', 'collectivités locales', 'finances publiques', 'open data'],
      temporalCoverage: `${A.insee[0]}/${A.etat[A.etat.length - 1]}`,
      isBasedOn: ['https://www.insee.fr/fr/statistiques/8574705?sommaire=8574832', 'https://data.economie.gouv.fr/explore/dataset/plrg-2024/'],
      distribution: [
        ...A.insee.map(a => fichier(`donnees/argent-public-${a}.json`, 'application/json', `Administrations publiques ${a}`)),
        ...A.etat.map(a => fichier(`donnees/depenses-${a}-par-programme.csv`, 'text/csv', `Budget de l'État ${a} par programme`)),
      ],
    },
    aides: {
      '@type': 'Dataset', ...commun,
      name: 'Aides publiques aux entreprises en 2024',
      description: "Les 469 aides aux entreprises recensées par le rapport annexé au projet de loi de finances pour 2027, avec leur montant, leur instrument, leur page dans le rapport et leur ministère de rattachement.",
      url: `${base}budget/aides.html`,
      keywords: ['aides aux entreprises', 'aides publiques', 'dépenses fiscales', 'crédit d\'impôt recherche', 'exonérations de cotisations', 'open data'],
      temporalCoverage: '2024',
      isBasedOn: 'https://www.tresor.economie.gouv.fr/Articles/54f1c35b-e6b0-4b6a-9929-1707e5c981ac/files/e0a8b1fa-faed-4809-9dc7-b06f0d1e2e0f',
      distribution: [fichier('donnees/aides-2024-rattachement-ministere.csv', 'text/csv', 'Aides et ministère de rattachement'), fichier('sources/aides-entreprises/aides-entreprises-2024.json', 'application/json', 'Aides extraites du rapport')],
    },
  };
}

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
    creator: AUTEUR,
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
  const racine = meta.base || '/';
  return [
    `<title>${esc(meta.title)}</title>`,
    `<link rel="icon" href="${racine}favicon.ico" sizes="48x48">`,
    `<link rel="icon" href="${racine}favicon.svg" type="image/svg+xml">`,
    `<link rel="apple-touch-icon" href="${racine}apple-touch-icon.png">`,
    `<meta name="description" content="${esc(meta.description)}">`,
    `<meta name="author" content="${AUTEUR.name}">`,
    // Grandes images et extraits complets autorisés dans les résultats de recherche.
    `<meta name="robots" content="${meta.robots || 'index, follow, max-image-preview:large, max-snippet:-1'}">`,
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
    // Données structurées (schema.org) : fil d'Ariane, site, jeux de données.
    ...[filAriane(meta), ...(meta.jsonld || [])].filter(Boolean).map(o => `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', ...o }).replace(/</g, '\\u003c')}</script>`),
  ].join('\n');
}

// Page complète du budget (budget/*.html) : on remplace son titre et sa description par les
// balises de référencement du site.
async function writeBudgetPage(source, target, meta) {
  const page = (await readFile(path(source), 'utf8'))
    .replace(/<title>[^<]*<\/title>\n?/, '')
    .replace(/<meta name="description"[^>]*>\n?/, '');
  if (!page.includes('</head>')) throw new Error(`${source} : balise </head> introuvable`);
  await writeOut(target, avecBandeau(page, source, meta.bandeau).replace('</head>', headTags(meta) + '\n</head>'));
}

// Fragment HTML de web/ placé dans une page complète, avec les balises de référencement et
// d'aperçu (réseaux sociaux). Le titre du fragment est remplacé par celui de la page, et les
// {{variables}} par leur valeur.
async function writePage(source, target, meta) {
  const page = avecBandeau(await readFile(path(source), 'utf8'), source, meta.bandeau).replace(/<title>[^<]*<\/title>\n?/, '')
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
