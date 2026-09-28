#!/usr/bin/env node
// Carte des sites web publics de l'État : mise à jour à partir de la carte V1 (2019).
//
//   node src/cli.mjs fetch-sources     DINUM, annuaire, opérateurs, territoires, démarches -> donnees/sources/
//   node src/cli.mjs fetch-hierarchie  hiérarchie de l'annuaire (fil d'Ariane)            -> donnees/annuaire/
//   node src/cli.mjs fetch-subdomains  sous-domaines hors gouv.fr (crt.sh)                 -> donnees/sources/
//   node src/cli.mjs check             vérification HTTP (V1 + candidats)                  -> donnees/checks/
//   node src/cli.mjs build             carte V2 : liste des sites, graphe, page, rapport  -> donnees/, out/
//   node src/cli.mjs fetch-marques     bloc-marque DSFR des sites sans ministère          -> donnees/checks/
//   node src/cli.mjs all               toutes les étapes (build relancé après fetch-marques)
//
// Options de check : --only=map|candidates|new|unknown|roots|refused, --limit=N (essais).
import { fetchHierarchie } from './annuaire.mjs';
import { build } from './build/index.mjs';
import { check } from './check.mjs';
import { fetchMarques } from './marques.mjs';
import { fetchSources } from './sources.mjs';
import { fetchSubdomains } from './subdomains.mjs';

const options = Object.fromEntries(process.argv.slice(3).map(a => a.replace(/^--/, '').split('=')));

const steps = {
  'fetch-sources': fetchSources,
  'fetch-hierarchie': fetchHierarchie,
  'fetch-subdomains': fetchSubdomains,
  check: () => check(options),
  build,
  'fetch-marques': fetchMarques,
};
const all = [...Object.values(steps), build];

const cmd = process.argv[2];
try {
  if (cmd === 'all') for (const step of all) await step();
  else if (steps[cmd]) await steps[cmd]();
  else {
    console.log(`Usage : node src/cli.mjs <${[...Object.keys(steps), 'all'].join('|')}> [--only=…] [--limit=N]`);
    process.exitCode = 1;
  }
} catch (e) {
  console.error(`Erreur : ${e.message}`);
  process.exitCode = 1;
}
