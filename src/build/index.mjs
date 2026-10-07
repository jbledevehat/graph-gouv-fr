// Construction de la carte V2 : V1 vérifiée, nouveaux sites, rattachements, doublons, puis
// exports (liste des sites, graphe, page web, rapport).
import { annuaireIndex } from '../annuaire.mjs';
import { FILES, readConfigCsv, readJson, readJsonIf, today, writeOut } from '../context.mjs';
import { buildGraph, toGexf, toWebData } from '../graph.mjs';
import { flat, isMinistry, ministryMatcher, norm } from '../lib/text.mjs';
import { hostOf, isUrl, siteKey } from '../lib/url.mjs';
import { addCandidates, addRedirectTargets } from './additions.mjs';
import { securityFilter } from '../candidates.mjs';
import {
  addFirstLevelEntities, attachByDemarches, attachByKeyword, attachByMarque, attachManualTutelles,
  attachOperators, attachPrefectures, attachV1Sites, linkGovernment, retypeV1Services,
} from './attachments.mjs';
import { formerAddresses, mergeDuplicates } from './duplicates.mjs';
import { siteRecords, webMeta, writeSiteLists, writeWeb } from './export.mjs';
import { writePdf } from './pdf.mjs';
import { pilotageData } from './pilotage.mjs';
import { createMap, tag } from './model.mjs';
import { report } from './report.mjs';
import { loadV1 } from './v1.mjs';

async function loadInputs() {
  const checks = await readJson(FILES.checks);
  const ann = annuaireIndex(await readJsonIf(FILES.annuaire, []), await readJsonIf(FILES.hierarchie, {}));
  const demarches = await readJsonIf(FILES.demarches, []);
  const demarchesByKey = new Map();
  for (const d of demarches) {
    const key = d.url && siteKey(hostOf(d.url));
    if (!key) continue;
    if (!demarchesByKey.has(key)) demarchesByKey.set(key, []);
    demarchesByKey.get(key).push(d);
  }
  const links = await readConfigCsv('rattachements.csv');
  const adminByDomain = new Map(links.map(l => [siteKey(l.domaine.trim().toLowerCase()), l.administration.trim()]));
  return {
    v1: { elements: await readJson(FILES.v1Elements), connections: await readJson(FILES.v1Connections) },
    checks,
    ann,
    annSite: annuaireSiteLookup(ann, checks),
    // config/rattachements.csv : domaine ou l'un de ses domaines parents.
    adminFor: key => key.split('.').map((_, i, parts) => adminByDomain.get(parts.slice(i).join('.'))).find(Boolean),
    renames: new Map((await readConfigCsv('correspondances-2019.csv')).map(r => [norm(r.ancien), r.actuel.trim()])),
    demarches,
    demarchesByKey,
    demarcheHosts: new Set(demarchesByKey.keys()),
    operateurs: await readJsonIf(FILES.operateurs, []),
    programmes: await readConfigCsv('programmes-ministeres.csv'),
    tutelles: await readConfigCsv('tutelles.csv'),
    keywords: await readConfigCsv('mots-cles-ministeres.csv'),
    territoires: await readJsonIf(FILES.territoires, []),
    marques: await readJsonIf(FILES.marques, {}),
  };
}

// Fiche de l'annuaire d'un site. Un domaine déclaré qui redirige vers un autre site (l'ANCT
// déclare agence-cohesion-territoires.gouv.fr, qui redirige vers anct.gouv.fr) vaut pour le site
// d'arrivée si le nom ou le sigle de l'organisme correspond à ce domaine, face à un déclarant
// direct sans rapport avec lui.
function annuaireSiteLookup(ann, checks) {
  const viaRedirect = new Map();
  for (const c of checks) {
    if (c.kind !== 'candidate' || c.statut !== 'Redirigé' || !c.finalUrl) continue;
    const i = ann.site(c.key);
    if (i) viaRedirect.set(siteKey(hostOf(c.finalUrl)), i);
  }
  return key => {
    const direct = ann.site(key), red = viaRedirect.get(key);
    const label = flat(key.split('.')[0]);
    const matches = i => i && label.length >= 3 && flat(i.organisme).includes(label);
    if (red && matches(red) && !matches(direct)) return { ...red, tutelleVia: 'annuaire (domaine redirigé)' };
    return direct || null;
  };
}

// Ministères de la carte sous leurs intitulés actuels et anciens (bloc-marque, Observatoire).
function ministryNames(map, renames) {
  const names = [];
  for (const e of [...map.elements, ...map.newOrgs]) {
    if (!isMinistry(e.label) && norm(e.label) !== 'premier ministre') continue;
    names.push([e.label, e.label]);
    for (const old of String(e['Intitulé 2019'] || '').split(' ; ').filter(Boolean)) names.push([old, e.label]);
  }
  for (const [old, current] of renames) names.push([old, current]);
  return ministryMatcher(names);
}

// Sites qui portent des démarches essentielles (y compris par une ancienne adresse).
function tagDemarches(map, demarchesByKey) {
  let count = 0;
  for (const e of map.elements) {
    if (!isUrl(e.label)) continue;
    const found = [e.label, ...formerAddresses(e)].flatMap(l => demarchesByKey.get(siteKey(hostOf(l))) || []);
    if (!found.length) continue;
    e['Démarches essentielles'] = [...new Set(found.map(d => d.titre))].join(' ; ');
    tag(e, 'Démarche essentielle');
    count++;
  }
  map.stats.demarcheSites = count;
}

// Anciens domaines qui redirigent vers un site de la carte (eau-adour-garonne.fr ->
// eau-grandsudouest.fr) : leurs sous-domaines rejoignent la bulle du site d'arrivée.
function redirectAliases(map, checks, mergedInto) {
  const aliases = new Map();
  const onMap = new Set(map.elements.filter(e => isUrl(e.label)).map(e => siteKey(hostOf(e.label))));
  for (const c of checks) {
    if (c.statut !== 'Redirigé' || !c.finalUrl || !c.key) continue;
    const to = siteKey(hostOf(c.finalUrl));
    if (!onMap.has(c.key) && onMap.has(to) && to !== c.key) aliases.set(c.key, to);
  }
  for (const [old, canon] of mergedInto) {
    const from = siteKey(hostOf(old)), to = siteKey(hostOf(canon));
    if (from !== to && !onMap.has(from)) aliases.set(from, to);
  }
  return aliases;
}

// Adresses d'outils de sécurité (mots de passe, VPN, authentification…) retirées de la carte, V1
// comprise ; une démarche essentielle (porte publique, ex. l'espace particulier des impôts) et les
// exceptions de config.candidates.securityKeep restent.
function removeSecurityTools(map, checks) {
  const isSecurityTool = securityFilter();
  const sensitive = e => isUrl(e.label) && !e['Démarches essentielles'] && isSecurityTool(siteKey(hostOf(e.label)));
  const removed = new Set(map.elements.filter(sensitive).map(e => e.label));
  map.elements = map.elements.filter(e => !removed.has(e.label));
  map.connections = map.connections.filter(c => !removed.has(c.from) && !removed.has(c.to));
  // Total : sites retirés ici, plus candidats en ligne écartés dès leur sélection.
  const skipped = checks.filter(c => c.kind === 'candidate' && c.statut === 'En ligne' && isSecurityTool(c.key)).length;
  map.stats.securityRemoved = removed.size + skipped;
  console.log(`  Outils de sécurité retirés de la carte : ${map.stats.securityRemoved}`);
}

export async function build() {
  const input = await loadInputs();
  const map = createMap();
  const inAnnuaire = label => isUrl(label) && !!input.annSite(siteKey(hostOf(label)))?.section;

  const { labelById } = loadV1(map, { ...input, inAnnuaire });
  addCandidates(map, input);
  addRedirectTargets(map, input);
  map.freezeSiteKeys();
  attachV1Sites(map, { ...input, inAnnuaire });
  addFirstLevelEntities(map, input);
  const tutelleByOrg = attachOperators(map, input);
  attachManualTutelles(map, { ...input, tutelleByOrg });
  attachPrefectures(map, { ...input, labelById });
  const ministryOfText = ministryNames(map, input.renames);
  await writeOut(FILES.marquesToRead, attachByMarque(map, { ...input, ministryOfText }));
  attachByDemarches(map, { ...input, ministryOfText });
  attachByKeyword(map, input);
  linkGovernment(map);
  retypeV1Services(map);
  map.elements.push(...map.newOrgs, ...map.additions);
  const mergedInto = mergeDuplicates(map);
  tagDemarches(map, input.demarchesByKey);
  removeSecurityTools(map, input.checks);

  console.log('Calcul du placement du graphe…');
  const graph = buildGraph({ elements: map.elements, connections: map.connections, aliases: redirectAliases(map, input.checks, mergedInto) });
  const checkedOn = input.checks[0]?.checkedAt?.slice(0, 10) || today;
  const sites = siteRecords(graph);
  await writeSiteLists(sites, 'donnees');
  const webData = toWebData(graph, webMeta({ map, graph, checkedOn }));
  await writeOut('out/web/pilotage.json', JSON.stringify(pilotageData(graph, webData, input.demarches, input.checks)));
  await writeWeb(webData, sites);
  await writePdf(webData);
  console.log('  -> out/web/carte.pdf');
  await writeOut('out/sites-gouv-fr-v2.gexf', toGexf(graph));
  await writeOut('out/rapport.md', report({ map, v1: input.v1, checkedOn }));
  console.log(`  ${map.elements.length} éléments (${map.newOrgs.length} administrations et ${map.additions.length} sites nouveaux), ${map.connections.length} connexions ; ${sites.length} sites dans donnees/sites.csv`);
}
