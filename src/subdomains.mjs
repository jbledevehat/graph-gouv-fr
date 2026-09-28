// Sous-domaines des domaines hors gouv.fr, lus dans les journaux de certificats (base PostgreSQL
// publique de crt.sh, comme le script import-from-ct-logs.py de la DINUM, qui ne couvre que
// gouv.fr). Cache dans donnees/sources/crtsh.json, relu au bout de subdomains.maxAgeDays.
import { writeFile } from 'node:fs/promises';
import { annuaireIndex } from './annuaire.mjs';
import { FILES, config, path, readJson, readJsonIf, sleep, writeOut } from './context.mjs';
import { hostOf, isUrl, siteKey } from './lib/url.mjs';

export async function fetchSubdomains() {
  const { default: pg } = await import('pg');
  const elements = await readJson(FILES.v1Elements);
  const annuaire = await readJsonIf(FILES.annuaire, []);
  const suffix = '.' + config.candidates.suffix;
  const keys = new Set([
    ...elements.filter(e => isUrl(e.label)).map(e => siteKey(hostOf(e.label))),
    ...annuaireIndex(annuaire).sites.map(s => s.key),
  ].filter(k => k && !k.endsWith(suffix)));
  // Inutile d'interroger un domaine dont un parent est déjà interrogé.
  const hasQueriedParent = k => k.split('.').some((_, i, parts) => i > 0 && i < parts.length - 1 && keys.has(parts.slice(i).join('.')));
  const domains = [...keys].filter(k => !hasQueriedParent(k)).sort();

  const cache = await readJsonIf(FILES.crtsh, {});
  const fresh = d => cache[d] && Date.now() - Date.parse(cache[d].fetchedAt) < config.subdomains.maxAgeDays * 864e5;
  const todo = domains.filter(d => !fresh(d));
  console.log(`Journaux de certificats (crt.sh) : ${domains.length} domaines hors ${config.candidates.suffix}, ${todo.length} à interroger…`);

  let client = null;
  const connect = async () => {
    client = new pg.Client({ ...config.subdomains.crtsh, port: 5432, query_timeout: 300000 });
    client.on('error', () => {});
    await client.connect();
  };
  const query = d => client.query(`SELECT DISTINCT lower(a.name) AS name
      FROM certificate, LATERAL (SELECT * FROM x509_altnames(certificate)) a(name)
     WHERE plainto_tsquery($1) @@ identities(certificate)
       AND COALESCE(x509_notafter(certificate), 'infinity') > now() - interval '1 year'`, [d]);
  let done = 0, failed = 0;
  for (const d of todo) {
    let rows = null;
    for (let attempt = 1; attempt <= 2 && !rows; attempt++) {
      try {
        if (!client) await connect();
        rows = (await query(d)).rows;
      } catch (e) {
        await client?.end().catch(() => {});
        client = null;
        if (attempt === 2) { failed++; console.warn(`\n  ${d} : ${e.message}`); }
        else await sleep(10000);
      }
    }
    if (rows) {
      const names = [...new Set(rows.map(r => r.name.replace(/^\*\./, '')).filter(n => n.endsWith('.' + d)))].sort();
      cache[d] = { fetchedAt: new Date().toISOString(), names };
    }
    if (++done % 10 === 0 || done === todo.length) {
      process.stdout.write(`\r  ${done}/${todo.length}`);
      await writeFile(path(FILES.crtsh), JSON.stringify(cache));
    }
  }
  await client?.end().catch(() => {});
  await writeOut(FILES.crtsh, cache);
  const total = domains.reduce((n, d) => n + (cache[d]?.names.length || 0), 0);
  console.log(`\n  ${total} sous-domaines connus${failed ? `, ${failed} domaines en échec (relancer plus tard)` : ''}`);
}
