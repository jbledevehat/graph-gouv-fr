// Carte V1 (2019) : administrations renommées selon leur intitulé actuel, sites avec le résultat
// de leur vérification, connexions reprises sauf celles que remplace l'annuaire.
import { norm } from '../lib/text.mjs';
import { isUrl } from '../lib/url.mjs';
import { OFF } from './model.mjs';

export const verification = c => ({
  'Statut': c.statut,
  'Code HTTP': c.code ?? '',
  'URL finale': c.finalUrl || '',
  'Erreur': c.error || '',
  'Vérifié le': c.checkedAt.slice(0, 10),
});

export function loadV1(map, { v1, checks, renames, inAnnuaire }) {
  const byUrl = new Map(checks.filter(c => c.kind === 'map').map(c => [c.url, c]));
  const byLabel = new Map(), labelById = new Map(), renamed = [];
  const changes = { archived: [], revived: [], redirected: [], unknown: [] };
  for (const e of v1.elements) {
    const { id, label: v1Label, 'element type': type, tags, ...rest } = e;
    const label = !isUrl(v1Label) && renames.get(norm(v1Label)) || v1Label;
    labelById.set(id, label);
    if (label !== v1Label) renamed.push([v1Label, label]);
    const merged = byLabel.get(label);
    if (merged) { merged['Intitulé 2019'] += ` ; ${v1Label}`; continue; } // ex. DINSIC et Etalab -> DINUM
    const el = { label, type: type || '', tags: tags || [], ...rest, ...(label !== v1Label && { 'Intitulé 2019': v1Label }) };
    map.elements.push(el);
    byLabel.set(label, el);
    const c = isUrl(label) && byUrl.get(label.trim());
    if (!c) continue;
    // Un service en ligne qui redirige (authentification, portail) reste un service actif.
    const down = c.statut === 'Hors ligne' || (c.statut === 'Redirigé' && type !== 'Service web');
    let newType = type;
    if (c.statut === 'Indéterminé') {
      changes.unknown.push({ e, c }); // pas de conclusion : type inchangé
    } else if (down && type !== OFF) {
      newType = OFF;
      (c.statut === 'Redirigé' ? changes.redirected : changes.archived).push({ e, c });
    } else if (!down && type === OFF) {
      newType = 'Site web';
      changes.revived.push({ e, c });
    }
    Object.assign(el, { type: newType, ...(newType !== type && { 'Type précédent': type || '' }), ...verification(c) });
  }

  // Connexions (identifiants -> libellés). Les liens de 2019 entre un site déclaré dans l'annuaire
  // et une administration sont remplacés par la chaîne de l'annuaire.
  let reorganized = 0;
  for (const { from, to, direction, 'connection type': type, id, ...rest } of v1.connections) {
    const a = labelById.get(from), b = labelById.get(to);
    if ((inAnnuaire(a) && !isUrl(b)) || (inAnnuaire(b) && !isUrl(a))) { reorganized++; continue; }
    map.connect(a, b, type || '', { direction, ...rest });
  }
  map.labelByNorm = new Map(map.elements.filter(e => !isUrl(e.label)).map(e => [norm(e.label), e.label]));
  Object.assign(map.stats, { renamed, changes, reorganized, v1Connections: map.connections.length, checked: map.elements.filter(e => e.Statut) });
  return { labelById };
}
