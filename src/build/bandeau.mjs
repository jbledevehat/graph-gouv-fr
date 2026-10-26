// Bandeau commun à toutes les pages du site : nom du site (vers l'accueil), sections, thème ;
// dans une section, une seconde ligne avec le fil d'Ariane, qui se termine par un sélecteur des
// pages de la section (Carte | Pilotage…) : la page courante n'est nommée qu'une fois.
// Il est inséré à la place du marqueur <!--bandeau--> de chaque page, à la construction.
// Sa hauteur est publiée dans la variable CSS --bandeau-h, pour les pages plein écran (carte,
// exploration du budget) dont les panneaux se placent en dessous. Sur ces pages, le panneau de
// gauche (marqué data-repliable) peut être masqué ; le choix est gardé d'une visite à l'autre.

export const SECTIONS = {
  sites: {
    nom: "Sites web de l'État", chemin: 'sites/',
    pages: [['carte', 'Carte', 'sites/'], ['pilotage', 'Pilotage', 'sites/pilotage.html']],
  },
  budget: {
    nom: "Budget de l'État", chemin: 'budget/', annees: true,
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
  /* La flèche devant le sélecteur reste accrochée à la section : elle ne commence jamais une ligne. */
  .bandeau .b-ariane li.b-sel::before { content: none; }
  .bandeau .b-ariane li.b-sec::after { content: "›"; margin-left: 6px; color: var(--control); }
  .bandeau .b-ariane a { color: var(--accent); text-decoration: none; }
  .bandeau .b-ariane a:hover { text-decoration: underline; }
  .bandeau .b-ariane [aria-current] { color: var(--ink); font-weight: 500; }
  .bandeau .b-pages { display: inline-flex; border: 1px solid var(--control); border-radius: 8px; overflow: hidden; }
  .bandeau .b-pages a { display: inline-flex; align-items: center; min-height: 28px; padding: 0 12px; color: var(--ink); background: var(--panel); text-decoration: none; font-size: 13px; font-weight: 500; }
  .bandeau .b-pages a + a { border-left: 1px solid var(--control); }
  .bandeau .b-pages a:hover { background: var(--panel-2); color: var(--ink); text-decoration: none; }
  .bandeau .b-pages a[aria-current] { background: var(--accent); color: var(--panel); }
  .bandeau .b-pages a:focus-visible { outline-offset: -3px; }
  .bandeau .b-annee { display: inline-flex; align-items: center; gap: 8px; margin-left: auto; font-size: 12.5px; color: var(--muted); }
  .bandeau .b-annee > span:first-child { font-weight: 500; }
  .bandeau .b-annee .b-pages > * { font-family: "IBM Plex Mono", ui-monospace, Menlo, monospace; padding: 0 10px; }
  .bandeau .b-annee .b-pages [aria-disabled] { display: inline-flex; align-items: center; min-height: 28px; color: var(--control); background: var(--panel); font-size: 13px; font-weight: 500; cursor: not-allowed; }
  .bandeau .b-annee .b-pages > * + * { border-left: 1px solid var(--control); }
  @media (max-width: 480px) {
    .bandeau .b-annee > span:first-child { display: none; }
    .bandeau .b-annee .b-pages > * { padding: 0 6px; font-size: 12px; }
  }
  .bandeau a:focus-visible, .bandeau button:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
  /* Panneau de gauche repliable (pages plein écran). */
  .p-replier { position: absolute; top: 8px; right: 8px; z-index: 2; width: 28px; height: 28px; display: grid; place-items: center; border: 1px solid var(--line); border-radius: 7px; background: var(--panel); color: var(--muted); font: 600 15px/1 "IBM Plex Sans", system-ui, sans-serif; cursor: pointer; }
  .p-replier:hover { background: var(--panel-2); color: var(--ink); }
  .p-deplier { position: fixed; z-index: 6; top: calc(16px + var(--bandeau-h, 0px)); left: 16px; display: inline-flex; align-items: center; gap: 6px; min-height: 36px; padding: 0 12px; border: 1px solid var(--line); border-radius: 9px; background: var(--panel); color: var(--ink); box-shadow: var(--shadow); font: 500 13px "IBM Plex Sans", system-ui, sans-serif; cursor: pointer; }
  .p-deplier:hover { background: var(--panel-2); }
  .p-replier:focus-visible, .p-deplier:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
  body.panneau-replie [data-repliable] { display: none !important; }
  body:not(.panneau-replie) .p-deplier { display: none; }
  @media (max-width: 640px) {
    .bandeau .b-wrap { padding-inline: 12px; }
    .bandeau .b-eyebrow { display: none; }
    .bandeau .b-theme span { display: none; }
  }
</style>`;

// Hauteur du bandeau, pour les pages plein écran.
const SCRIPT = `<script>
  (() => {
    const b = document.querySelector('.bandeau');
    const publier = () => document.documentElement.style.setProperty('--bandeau-h', b.getBoundingClientRect().height + 'px');
    publier();
    if ('ResizeObserver' in window) new ResizeObserver(publier).observe(b);
    // Année choisie (?annee=…) : affichée dans la liste, et reportée dans les liens vers les autres
    // pages de la section, même si cette page ne l'a pas (la page des aides : 2024 seulement), pour
    // la retrouver en revenant sur une autre page.
    const blocAnnee = b.querySelector('.b-annee');
    if (blocAnnee) {
      const liens = [...blocAnnee.querySelectorAll('[data-annee-choix]')];
      const toutes = [...blocAnnee.querySelectorAll('.b-pages > *')].map(e => e.textContent);
      const voulue = new URLSearchParams(location.search).get('annee');
      const active = liens.find(a => a.dataset.anneeChoix === voulue) || liens.find(a => a.dataset.anneeChoix === blocAnnee.dataset.reference);
      if (active) active.setAttribute('aria-current', 'page');
      const annee = toutes.includes(voulue) ? voulue : null;
      if (annee) document.addEventListener('DOMContentLoaded', () => {
        const base = new URL(b.querySelector('.b-ariane li.b-sec a').href);
        document.querySelectorAll('a[href]').forEach(a => {
          const u = new URL(a.href, location.href);
          if (u.origin !== location.origin || !u.pathname.startsWith(base.pathname) || u.searchParams.has('annee') || u.hash && u.pathname === location.pathname) return;
          if (/\.(json|csv|pdf|xlsx?)$/.test(u.pathname)) return;
          const [chemin, ancre] = a.getAttribute('href').split('#');
          a.setAttribute('href', chemin + (chemin.includes('?') ? '&' : '?') + 'annee=' + annee + (ancre !== undefined ? '#' + ancre : ''));
        });
      });
    }
    // Panneau de gauche repliable : un bouton dans le panneau le masque, un autre le rouvre. La
    // page est prévenue par un événement « resize », pour se redessiner sur toute la largeur.
    document.addEventListener('DOMContentLoaded', () => {
      const p = document.querySelector('[data-repliable]');
      if (!p) return;
      const CLE = 'gouvfr-panneau-replie';
      p.id ||= 'panneau-gauche';
      const replier = document.createElement('button'), deplier = document.createElement('button');
      replier.type = deplier.type = 'button';
      replier.className = 'p-replier'; replier.textContent = '‹'; replier.title = 'Masquer le panneau';
      replier.setAttribute('aria-label', 'Masquer le panneau'); replier.setAttribute('aria-controls', p.id);
      deplier.className = 'p-deplier'; deplier.innerHTML = '<span aria-hidden="true">›</span> Panneau';
      deplier.title = 'Afficher le panneau : recherche et filtres'; deplier.setAttribute('aria-controls', p.id);
      p.prepend(replier); document.body.append(deplier);
      const regler = (replie, focus) => {
        document.body.classList.toggle('panneau-replie', replie);
        replier.setAttribute('aria-expanded', 'true'); deplier.setAttribute('aria-expanded', 'false');
        try { replie ? localStorage.setItem(CLE, '1') : localStorage.removeItem(CLE); } catch (e) {}
        window.dispatchEvent(new Event('resize'));
        if (focus) (replie ? deplier : replier).focus();
      };
      let memo = false; try { memo = localStorage.getItem(CLE) === '1'; } catch (e) {}
      regler(memo, false);
      replier.onclick = () => regler(true, true);
      deplier.onclick = () => regler(false, true);
    });
  })();
</script>`;

const esc = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

// annees (section budget) : { toutes, page, reference } — toutes les années de la section, celles
// que la page sait afficher, et celle affichée par défaut.
export function bandeau({ racine = '', section = null, page = null, annees = null } = {}) {
  const S = section && SECTIONS[section];
  const sections = Object.entries(SECTIONS).map(([k, s]) =>
    `<a href="${racine}${s.chemin}"${k === section ? ' aria-current="true"' : ''}>${esc(s.nom)}</a>`).join('');
  const sousLigne = S ? (() => {
    const onglets = S.pages.map(([k, nom, href]) => `<a href="${racine}${href}"${k === page ? ' aria-current="page"' : ''}>${esc(nom)}</a>`).join('');
    const ariane = `<li><a href="${racine || './'}">Accueil</a></li><li class="b-sec"><a href="${racine}${S.chemin}">${esc(S.nom)}</a></li>`
      + `<li class="b-sel"><span class="b-pages" role="group" aria-label="Pages de la section ${esc(S.nom)}">${onglets}</span></li>`;
    // Choix de l'année (section budget) : boutons accolés, comme les pages de la section ; les
    // années que la page n'a pas sont grisées.
    const choixAnnee = S.annees && annees ? `<div class="b-annee" data-reference="${annees.reference}"><span>Année</span><span class="b-pages" role="group" aria-label="Année des données">${annees.toutes.map(a => annees.page.includes(a)
      ? `<a href="?annee=${a}" data-annee-choix="${a}">${a}</a>`
      : `<span aria-disabled="true" title="Pas de données pour ${a} sur cette page">${a}</span>`).join('')}</span></div>` : '';
    return `<div class="b-sub"><div class="b-wrap"><nav class="b-ariane" aria-label="Fil d'Ariane"><ol>${ariane}</ol></nav>${choixAnnee}</div></div>`;
  })() : '';
  return `${STYLE}
<header class="bandeau">
  <div class="b-wrap">
    <a class="b-brand" href="${racine || './'}"><span class="b-logo" aria-hidden="true"><i style="background:#4A3AA7"></i><i style="background:#D99A00"></i><i style="background:#1BAF7A"></i><i style="background:#2A78D6"></i></span><span class="b-name"><span class="b-eyebrow">Données publiques</span><strong>Piloter l'action publique par la donnée</strong></span></a>
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
