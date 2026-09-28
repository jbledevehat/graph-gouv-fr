// Chemins, configuration et lecture / écriture des fichiers du projet.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseConfigCsv } from './lib/csv.mjs';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const path = (...parts) => join(ROOT, ...parts);
export const config = JSON.parse(await readFile(path('config/config.json'), 'utf8'));
export const today = new Date().toISOString().slice(0, 10);

// Fichiers de données.
export const FILES = {
  v1Elements: 'donnees/v1-2019/elements.json',
  v1Connections: 'donnees/v1-2019/connections.json',
  checks: 'donnees/checks/latest.json',
  marques: 'donnees/checks/marques.json',
  hierarchie: 'donnees/annuaire/hierarchie.json',
  dinumCsv: 'donnees/sources/dinum-domains.csv',
  dinum: 'donnees/sources/dinum.json',
  annuaire: 'donnees/sources/annuaire.json',
  operateurs: 'donnees/sources/operateurs.json',
  territoires: 'donnees/sources/territoires.json',
  demarches: 'donnees/sources/demarches.json',
  crtsh: 'donnees/sources/crtsh.json',
  marquesToRead: 'out/marques-a-lire.json',
  progress: 'out/progression.txt',
};

export async function readJson(file) {
  const full = path(file);
  if (!existsSync(full)) throw new Error(`${file} introuvable : lancez d'abord l'étape précédente.`);
  return JSON.parse(await readFile(full, 'utf8'));
}

// Lecture d'un fichier facultatif (source absente : valeur par défaut).
export const readJsonIf = async (file, fallback) => existsSync(path(file)) ? readJson(file) : fallback;

export async function writeOut(file, content) {
  const full = path(file);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, typeof content === 'string' ? content : JSON.stringify(content, null, 2) + '\n');
  console.log(`  -> ${file}`);
}

// Un objet par ligne : fichier compact, différences lisibles dans Git.
export const jsonLines = rows => '[\n' + rows.map(r => JSON.stringify(r)).join(',\n') + '\n]\n';

// Fichiers de config/ au format CSV (lignes « # » ignorées).
export const readConfigCsv = async name => existsSync(path('config', name)) ? parseConfigCsv(await readFile(path('config', name), 'utf8')) : [];

// Avancement d'une longue étape, lisible pendant qu'elle tourne (out/progression.txt).
export function progress(what) {
  const started = Date.now();
  return (done, total) => {
    process.stdout.write(`\r  ${done}/${total}`);
    const left = done ? Math.round((Date.now() - started) / done * (total - done) / 60000) : '?';
    mkdir(path('out'), { recursive: true })
      .then(() => writeFile(path(FILES.progress), `${new Date().toLocaleTimeString('fr-FR')} : ${done}/${total} ${what}, environ ${left} min restantes\n`))
      .catch(() => {});
  };
}

// Téléchargement avec trois essais (les serveurs sources sont parfois lents à répondre).
export async function download(url, label) {
  let last;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(120000), headers: { 'user-agent': config.check.userAgent } });
      if (res.ok) return res;
      last = new Error(`${label}: HTTP ${res.status}`);
    } catch (e) {
      last = new Error(`${label}: ${e.cause?.code || e.cause?.message || e.message}`);
    }
    if (attempt < 3) await new Promise(r => setTimeout(r, 5000 * attempt));
  }
  throw last;
}

export const sleep = ms => new Promise(r => setTimeout(r, ms));
