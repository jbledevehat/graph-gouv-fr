// Changer d'année sans recharger la page (pages Pilotage et Jeunesse), avec une animation des blocs
// et l'évolution de chaque montant.
//
// La page confie son script à AnneeVive.page(demarrer) : demarrer() dessine la page pour l'année
// AnneeVive.voulue(). Pour une autre année, on garde l'ancienne page affichée, figée, pendant qu'une
// copie vierge de <main> se calcule, invisible, juste avant elle ; puis on échange les deux et chaque
// élément SVG marqué data-k part de la place et de la taille qu'il avait dans l'ancienne page.
//
// Évolutions : pendant le dessin, la page note les montants (noter(graphique, id, v)) et demande
// l'évolution d'un montant (evo(graphique, id, v)) par rapport à l'année précédente, ou, pendant un
// aperçu au survol du bandeau, à l'année choisie. Les montants de l'année précédente viennent de la
// même page, chargée pour cette année-là dans un cadre invisible (?mesure=1), qui les renvoie.
(() => {
  const params = new URLSearchParams(location.search);
  const MESURE = params.has('mesure');
  const reduit = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const nf1 = v => v.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const VALS = new Map();          // année -> Map(« graphique|id » -> montant)
  let courante = new Map(), annee = null, anneeValidee = null, anneeComp = null, force = null;
  let MODELE = null, demarrer = null, nettoyage = [];

  const AV = window.AnneeVive = {
    premiere: true,
    mesure: MESURE,
    annees: [],                    // années que la page sait afficher (fixées par la page)
    affichee: null,                // année effectivement dessinée (fixée par la page)
    redessiner: null,              // redessine les graphiques (après l'arrivée des montants de comparaison)
    mesurer: null,                 // en mesure : affiche les autres regroupements, pour noter leurs montants
    voulue: () => force || params.get('annee'),
    noter(g, id, v) { if (v > 0) courante.set(g + '|' + id, v); },
    evo(g, id, v) {
      const b = VALS.get(anneeComp)?.get(g + '|' + id);
      if (!(b > 0) || !(v > 0)) return '';
      const p = (v / b - 1) * 100;
      return (p >= 0.05 ? '+' : p <= -0.05 ? '−' : '') + nf1(Math.abs(p)) + ' %';
    },
    depuis: () => anneeComp ? (+anneeComp < +annee ? `depuis ${anneeComp}` : `par rapport à ${anneeComp}`) : '',
    comparee: () => anneeComp,
    // Écouteur hors de <main> (fenêtre, document) : retiré quand la page est redessinée pour une autre année.
    ecouter(cible, type, fn, opts) { cible.addEventListener(type, fn, opts); nettoyage.push(() => cible.removeEventListener(type, fn, opts)); },
    page(fn) {
      demarrer = fn;
      MODELE = document.querySelector('main').cloneNode(true);
      lancer();
    },
  };

  async function executer(an) {
    annee = an; courante = new Map();
    const anciens = nettoyage; nettoyage = [];
    await demarrer();
    anciens.forEach(f => f());
    if (AV.affichee) annee = AV.affichee;
    VALS.set(annee, courante);
    AV.premiere = false;
  }

  async function lancer() {
    await executer(AV.voulue());
    anneeValidee = annee;
    if (MESURE) {
      try { await AV.mesurer?.(); } catch (e) {}
      parent.postMessage({ type: 'annee-vive', annee, valeurs: [...courante] }, location.origin);
      return;
    }
    brancher();
    comparer(precedente(annee));
  }

  // ---------- Montants de comparaison ----------
  const precedente = an => AV.annees[AV.annees.indexOf(an) - 1] || null;
  const enAttente = new Map();
  function charger(an) {
    if (VALS.has(an)) return Promise.resolve(VALS.get(an));
    if (enAttente.has(an)) return enAttente.get(an);
    const p = new Promise(resolve => {
      const f = document.createElement('iframe');
      f.setAttribute('aria-hidden', 'true'); f.tabIndex = -1; f.title = 'Calcul des évolutions';
      f.style.cssText = 'position:absolute;left:-10000px;top:0;width:1200px;height:800px;visibility:hidden;border:0';
      const u = new URL(location.href); u.searchParams.set('annee', an); u.searchParams.set('mesure', '1'); u.hash = '';
      const fin = valeurs => { removeEventListener('message', recu); clearTimeout(t); f.remove(); enAttente.delete(an); if (valeurs) VALS.set(an, valeurs); resolve(valeurs); };
      const recu = e => { if (e.source === f.contentWindow && e.data?.type === 'annee-vive') fin(new Map(e.data.valeurs)); };
      const t = setTimeout(() => fin(null), 30000);
      addEventListener('message', recu);
      f.src = u.pathname + u.search;
      document.body.append(f);
    });
    enAttente.set(an, p);
    return p;
  }
  async function comparer(an) {
    if (an === anneeComp) return;
    anneeComp = an;
    if (an && !VALS.has(an)) await charger(an);
    if (anneeComp === an) AV.redessiner?.();
  }

  // ---------- Changement d'année ----------
  const GEO = { rect: ['x', 'y', 'width', 'height'] };
  const cle = el => `${el.closest('[id]')?.id}|${el.dataset.k}|${el.tagName}.${el.classList[0] || ''}`;
  const nombres = d => (d.match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/g) || []).map(Number);
  function releve(racine) {
    const m = new Map();
    racine.querySelectorAll('svg [data-k]').forEach(el => {
      if (el.tagName === 'path') m.set(cle(el), nombres(el.getAttribute('d') || ''));
      else if (GEO[el.tagName]) m.set(cle(el), GEO[el.tagName].map(a => +el.getAttribute(a)));
    });
    return m;
  }
  let style = null, enCours = false, demande = null, animation = 0;
  function styler() {
    if (style) return;
    style = document.createElement('style');
    style.textContent = `main svg text { transition: opacity .3s; }
      html.av-anime main svg text { opacity: 0 !important; transition: none; }
      #av-apercu { position: fixed; z-index: 30; left: 50%; bottom: calc(16px + env(safe-area-inset-bottom, 0px)); transform: translateX(-50%); width: max-content; max-width: calc(100vw - 24px);
        padding: 8px 14px; border: 1px solid var(--line); border-radius: 10px; background: var(--panel); color: var(--ink); box-shadow: var(--shadow); font: 13px/1.4 var(--sans); text-align: center; pointer-events: none; }
      #av-apercu b { font-weight: 600; }
      #av-apercu span { color: var(--muted); font-size: 12px; }`;
    document.head.append(style);
  }
  // Une seule bascule à la fois : la dernière demandée attend la fin de celle en cours.
  function basculer(an, opts = {}) {
    demande = [an, opts];
    if (!enCours) suivante();
  }
  async function suivante() {
    if (!demande) return;
    const [an, { apercu = false, historique = false }] = demande; demande = null;
    if (an === annee) { finir(an, apercu, historique); return suivante(); }
    enCours = true;
    try { await rendre(an, apercu); finir(an, apercu, historique); }
    catch (e) { location.href = '?annee=' + an; return; }
    finally { enCours = false; }
    suivante();
  }
  async function rendre(an, apercu) {
    styler();
    const ancien = document.querySelector('main'), avant = releve(ancien);
    const neuf = MODELE.cloneNode(true);
    // La nouvelle page se calcule avant l'ancienne dans le document (getElementById et
    // querySelector la trouvent d'abord), invisible et posée par-dessus ; l'ancienne reste affichée.
    neuf.style.cssText = `position:absolute;left:0;right:0;top:${ancien.getBoundingClientRect().top + scrollY}px;visibility:hidden;pointer-events:none`;
    ancien.before(neuf);
    force = an;
    anneeComp = apercu ? anneeValidee : precedente(an);
    const comp = anneeComp && !VALS.has(anneeComp) ? charger(anneeComp) : null;
    try { await executer(an); }
    catch (e) { neuf.remove(); throw e; }
    if (comp && !apercu) await Promise.race([comp, new Promise(r => setTimeout(r, 1500))]).then(() => AV.redessiner?.());
    // Deux images : la page a fini de se mettre en place (dont ses redessins au changement de taille).
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const y = scrollY;
    const pistes = [];
    if (!reduit) neuf.querySelectorAll('svg [data-k]').forEach(el => {
      const de = avant.get(cle(el));
      if (el.tagName === 'path') {
        const d = el.getAttribute('d') || '', vers = nombres(d);
        if (de && de.length === vers.length) pistes.push({ el, chemin: d, de, vers });
      } else if (GEO[el.tagName]) {
        const vers = GEO[el.tagName].map(a => +el.getAttribute(a));
        const depart = de || [vers[0] + vers[2] / 2, vers[1] + vers[3] / 2, 0, 0];
        pistes.push({ el, attrs: GEO[el.tagName], de: depart, vers });
      }
    });
    const poser = (p, e) => {
      const v = p.de.map((a, i) => a + (p.vers[i] - a) * e);
      if (p.chemin) { let i = 0; p.el.setAttribute('d', p.chemin.replace(/-?\d+(?:\.\d+)?(?:e-?\d+)?/g, () => v[i++])); }
      else p.attrs.forEach((a, i) => p.el.setAttribute(a, i >= 2 ? Math.max(0, v[i]) : v[i]));
    };
    pistes.forEach(p => poser(p, 0));
    neuf.style.cssText = '';
    ancien.remove();
    scrollTo(0, y);
    if (!pistes.length) return;
    document.documentElement.classList.add('av-anime');
    cancelAnimationFrame(animation);
    const t0 = performance.now(), duree = 700;
    await new Promise(fin => {
      const pas = t => {
        const p = Math.min(1, (t - t0) / duree), e = 1 - Math.pow(1 - p, 3);
        pistes.forEach(q => poser(q, e));
        if (p < 1) animation = requestAnimationFrame(pas);
        else { document.documentElement.classList.remove('av-anime'); fin(); }
      };
      animation = requestAnimationFrame(pas);
    });
  }
  function finir(an, apercu, historique) {
    const badge = document.getElementById('av-apercu');
    if (apercu) {
      let b = badge;
      if (!b) { b = document.createElement('div'); b.id = 'av-apercu'; b.setAttribute('aria-live', 'polite'); document.body.append(b); }
      b.hidden = false;
      b.innerHTML = `<b>Aperçu ${an}</b> · les pourcentages comparent à ${anneeValidee}<br><span>Cliquez sur l'année pour l'afficher.</span>`;
    } else {
      if (badge) badge.hidden = true;
      if (an !== anneeValidee || historique) {
        anneeValidee = an;
        if (historique) { const u = new URL(location.href); u.searchParams.set('annee', an); history.pushState({ annee: an }, '', u); }
        liens.forEach(a => { if (a.dataset.anneeChoix === an) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
      }
      majLiens(anneeValidee);
      comparer(precedente(an));
    }
  }
  // Liens du site : ils emportent l'année choisie.
  function majLiens(an) {
    const base = document.querySelector('.bandeau .b-ariane li.b-sec a');
    if (!base) return;
    const chemin = new URL(base.href).pathname;
    document.querySelectorAll('a[href]:not([data-annee-choix])').forEach(a => {
      const u = new URL(a.href, location.href);
      if (u.origin !== location.origin || !u.pathname.startsWith(chemin) || /\.(json|csv|pdf|xlsx?)$/.test(u.pathname) || u.hash && u.pathname === location.pathname) return;
      u.searchParams.set('annee', an); a.href = u.pathname + u.search + u.hash;
    });
  }

  // ---------- Bandeau : survol pour un aperçu, clic pour choisir ----------
  let liens = [];
  function brancher() {
    liens = [...document.querySelectorAll('.bandeau [data-annee-choix]')].filter(a => AV.annees.includes(a.dataset.anneeChoix));
    let tempo = 0;
    const revenir = () => { if (annee !== anneeValidee || demande || !document.getElementById('av-apercu')?.hidden) basculer(anneeValidee); };
    liens.forEach(a => {
      const an = a.dataset.anneeChoix;
      a.addEventListener('pointerenter', e => {
        if (e.pointerType !== 'mouse') return;
        clearTimeout(tempo);
        tempo = setTimeout(() => an === anneeValidee ? revenir() : basculer(an, { apercu: true }), 120);
      });
      a.addEventListener('click', e => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button) return;
        e.preventDefault(); clearTimeout(tempo);
        basculer(an, { historique: an !== anneeValidee });
      });
    });
    document.querySelector('.bandeau .b-annee .b-pages')?.addEventListener('pointerleave', () => { clearTimeout(tempo); tempo = setTimeout(revenir, 150); });
    addEventListener('popstate', () => {
      const a = new URLSearchParams(location.search).get('annee');
      basculer(AV.annees.includes(a) ? a : AV.annees.includes(document.querySelector('.bandeau .b-annee')?.dataset.reference) ? document.querySelector('.bandeau .b-annee').dataset.reference : AV.annees[AV.annees.length - 1]);
    });
    majLiens(anneeValidee);
  }
})();
