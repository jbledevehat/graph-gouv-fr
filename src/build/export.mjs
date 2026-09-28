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

// Page web : carte.html dans une page complète, données, domaine personnalisé de GitHub Pages.
export async function writeWeb(webData, rows) {
  await writeOut('out/web/graph.json', JSON.stringify(webData));
  await writeSiteLists(rows, 'out/web');
  if (config.site?.domain) await writeOut('out/web/CNAME', config.site.domain + '\n');
  const page = await readFile(path('web/carte.html'), 'utf8');
  await writeOut('out/web/index.html', `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
</head>
<body>
${page}
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
