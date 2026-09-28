// Bloc-marque DSFR et ministères cités dans la page d'accueil des sites restés sans ministère
// (liste écrite par build). Cache versionné, relu au bout de subdomains.maxAgeDays.
import { FILES, config, readJsonIf, writeOut } from './context.mjs';
import { fetchMarque, pool } from './lib/http.mjs';

const VERSION = 2; // format du cache (mentions ajoutées)

export async function fetchMarques() {
  const urls = await readJsonIf(FILES.marquesToRead, []);
  const cache = await readJsonIf(FILES.marques, {});
  const stale = u => !cache[u] || cache[u].v !== VERSION || Date.now() - Date.parse(cache[u].checkedAt) > config.subdomains.maxAgeDays * 864e5;
  const todo = urls.filter(stale);
  console.log(`Bloc-marque : ${urls.length} sites sans ministère, ${todo.length} pages à lire…`);
  const { timeoutMs, userAgent, perIp, perIpGapMs, concurrency } = config.check;
  await pool(todo, concurrency, async u => {
    const r = await fetchMarque(u, { timeoutMs, userAgent, perIp, perIpGapMs });
    cache[u] = { marque: r.marque, mentions: r.mentions || [], checkedAt: new Date().toISOString(), v: VERSION };
  }, (d, n) => { if (d % 25 === 0 || d === n) process.stdout.write(`\r  ${d}/${n}`); });
  if (todo.length) console.log();
  await writeOut(FILES.marques, Object.fromEntries(Object.entries(cache).sort()));
  console.log(`  ${urls.filter(u => cache[u]?.marque).length} blocs-marques lus`);
}
