// Bandeau commun à toutes les pages du site : nom du site (vers l'accueil), sections, thème ;
// dans une section, une seconde ligne avec le fil d'Ariane et les onglets de ses pages.
// Il est inséré à la place du marqueur <!--bandeau--> de chaque page, à la construction.
// Sa hauteur est publiée dans la variable CSS --bandeau-h, pour les pages plein écran (carte,
// exploration du budget) dont les panneaux se placent en dessous.

export const SECTIONS = {
  sites: {
    nom: "Sites web de l'État", chemin: 'sites/',
    pages: [['carte', 'Carte', 'sites/'], ['pilotage', 'Pilotage', 'sites/pilotage.html']],
  },
  budget: {
    nom: "Budget de l'État", chemin: 'budget/',
    pages: [['exploration', 'Exploration', 'budget/'], ['pilotage', 'Pilotage', 'budget/pilotage.html'], ['aides', 'Aides aux entreprises', 'budget/aides.html']],
  },
};

const STYLE = `<style>
  /* Bandeau commun (src/build/bandeau.mjs) : il utilise les jetons de couleur de la page. */
  .bandeau { position: sticky; top: 0; z-index: 20; background: var(--panel); border-bottom: 1px solid var(--line); padding-top: env(safe-area-inset-top, 0px); font-family: "IBM Plex Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  .bandeau .b-wrap { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 18px; padding: 8px 20px; }
  .bandeau .b-brand { display: inline-flex; align-items: center; gap: 10px; margin-right: auto; color: var(--ink); text-decoration: none; min-width: 0; }
  .bandeau .b-logo { display: grid; grid-template-columns: 11px 7px; grid-template-rows: 7px 11px; gap: 2px; flex: none; }
  .bandeau .b-logo i { display: block; border-radius: 2px; }
  .bandeau .b-name { display: flex; flex-direction: column; min-width: 0; }
  .bandeau .b-eyebrow { font: 500 11px/1.2 "IBM Plex Mono", ui-monospace, Menlo, monospace; letter-spacing: .08em; text-transform: uppercase; color: var(--accent); }
  .bandeau .b-name strong { font-size: 15px; line-height: 1.25; }
  .bandeau .b-sections { display: flex; flex-wrap: wrap; gap: 6px; }
  .bandeau .b-sections a { display: inline-flex; align-items: center; min-height: 32px; padding: 0 12px; border: 1px solid var(--control); border-radius: 7px; color: var(--ink); text-decoration: none; font-weight: 500; font-size: 13px; }
  .bandeau .b-sections a:hover { background: var(--panel-2); }
  .bandeau .b-sections a[aria-current] { background: var(--accent); border-color: var(--accent); color: var(--panel); }
  .bandeau .b-theme { display: flex; align-items: center; gap: 6px; }
  .bandeau .b-theme span { font-size: 12px; color: var(--muted); }
  .bandeau .b-theme button { min-height: 26px; padding: 0 9px; border: 1px solid var(--control); border-radius: 999px; background: transparent; color: var(--ink); font: 500 12px "IBM Plex Sans", system-ui, sans-serif; cursor: pointer; }
  .bandeau .b-theme button[aria-pressed="true"] { background: var(--accent-soft); border-color: var(--accent); }
  .bandeau .b-sub { border-top: 1px solid var(--line); background: var(--panel-2); }
  .bandeau .b-sub .b-wrap { padding-block: 4px; gap: 4px 18px; }
  .bandeau .b-ariane ol { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 6px; margin: 0; padding: 0; list-style: none; font-size: 12.5px; color: var(--muted); }
  .bandeau .b-ariane li + li::before { content: "›"; margin-right: 6px; color: var(--control); }
  .bandeau .b-ariane a { color: var(--accent); text-decoration: none; }
  .bandeau .b-ariane a:hover { text-decoration: underline; }
  .bandeau .b-ariane [aria-current] { color: var(--ink); font-weight: 500; }
  .bandeau .b-pages { display: flex; flex-wrap: wrap; gap: 2px; margin-left: auto; }
  .bandeau .b-pages a { display: inline-flex; align-items: center; min-height: 30px; padding: 0 12px; border-radius: 6px; color: var(--ink); text-decoration: none; font-size: 13px; font-weight: 500; border-bottom: 2px solid transparent; }
  .bandeau .b-pages a:hover { background: var(--panel); }
  .bandeau .b-pages a[aria-current] { color: var(--accent); border-bottom-color: var(--accent); border-radius: 6px 6px 0 0; }
  .bandeau a:focus-visible, .bandeau button:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
  @media (max-width: 640px) {
    .bandeau .b-wrap { padding-inline: 12px; }
    .bandeau .b-eyebrow { display: none; }
    .bandeau .b-theme span { display: none; }
    .bandeau .b-pages { margin-left: 0; }
  }
</style>`;

// Hauteur du bandeau, pour les pages plein écran.
const SCRIPT = `<script>
  (() => {
    const b = document.querySelector('.bandeau');
    const publier = () => document.documentElement.style.setProperty('--bandeau-h', b.getBoundingClientRect().height + 'px');
    publier();
    if ('ResizeObserver' in window) new ResizeObserver(publier).observe(b);
  })();
</script>`;

const esc = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

export function bandeau({ racine = '', section = null, page = null } = {}) {
  const S = section && SECTIONS[section];
  const sections = Object.entries(SECTIONS).map(([k, s]) =>
    `<a href="${racine}${s.chemin}"${k === section ? ' aria-current="true"' : ''}>${esc(s.nom)}</a>`).join('');
  const sousLigne = S ? (() => {
    const courante = S.pages.find(p => p[0] === page);
    const ariane = `<li><a href="${racine || './'}">Accueil</a></li><li><a href="${racine}${S.chemin}">${esc(S.nom)}</a></li>`
      + (courante ? `<li aria-current="page">${esc(courante[1])}</li>` : '');
    const onglets = S.pages.map(([k, nom, href]) => `<a href="${racine}${href}"${k === page ? ' aria-current="page"' : ''}>${esc(nom)}</a>`).join('');
    return `<div class="b-sub"><div class="b-wrap"><nav class="b-ariane" aria-label="Fil d'Ariane"><ol>${ariane}</ol></nav><nav class="b-pages" aria-label="Pages de la section ${esc(S.nom)}">${onglets}</nav></div></div>`;
  })() : '';
  return `${STYLE}
<header class="bandeau">
  <div class="b-wrap">
    <a class="b-brand" href="${racine || './'}"><span class="b-logo" aria-hidden="true"><i style="background:#4A3AA7"></i><i style="background:#D99A00"></i><i style="background:#1BAF7A"></i><i style="background:#2A78D6"></i></span><span class="b-name"><span class="b-eyebrow">Données publiques</span><strong>Piloter l'action publique par les données</strong></span></a>
    <nav class="b-sections" aria-label="Sections du site">${sections}</nav>
    <div class="b-theme" role="group" aria-label="Thème">
      <span aria-hidden="true">Thème</span>
      <button type="button" data-theme-choice="auto" aria-pressed="true">Système</button>
      <button type="button" data-theme-choice="light" aria-pressed="false">Clair</button>
      <button type="button" data-theme-choice="dark" aria-pressed="false">Sombre</button>
    </div>
  </div>
  ${sousLigne}
</header>
${SCRIPT}`;
}

// Remplace le marqueur de la page par le bandeau ; une page sans marqueur est une erreur.
export function avecBandeau(html, source, opts) {
  if (!html.includes('<!--bandeau-->')) throw new Error(`${source} : marqueur <!--bandeau--> introuvable`);
  return html.replace('<!--bandeau-->', bandeau(opts));
}
