// Rapport de construction (out/rapport.md) : synthèse, changements depuis la V1, nouveaux sites.
import { config, today } from '../context.mjs';
import { isMinistry } from '../lib/text.mjs';
import { OFF } from './model.mjs';

const cell = s => String(s ?? '').replace(/\|/g, '\\|');

export function report({ map, v1, checkedOn }) {
  const s = map.stats;
  const { changes, checked } = s;
  const line = ({ e, c }) => `| ${e.label} | ${e['element type']} | ${cell(c.code ?? c.error)} | ${c.finalUrl || ''} |`;
  const table = (title, rows) => rows.length
    ? `\n## ${title} (${rows.length})\n\n| URL | Type V1 | Code / erreur | URL finale |\n|---|---|---|---|\n${rows.map(line).join('\n')}\n`
    : `\n## ${title} (0)\n`;
  const count = st => checked.filter(u => u.Statut === st).length;
  const additions = map.additions, newOrgs = map.newOrgs;
  const fromSource = src => additions.filter(a => a.Source.includes(src)).length;
  const orphans = additions.filter(a => a.tags.includes('À rattacher'));
  const ministries = newOrgs.filter(o => isMinistry(o.label));
  const addLine = a => `| ${a.label} | ${cell(a.Organisme)} | ${cell(a.Tutelle)} | ${a.Source.replace(/ \(.*\)/, '')} |`;
  return `# Carte des sites web publics de l'État — V2 (${today})

Carte V1 (2019) : ${config.v1.url}
Vérifications HTTP du ${checkedOn}.

## Synthèse

- V1 : **${v1.elements.length}** éléments, **${v1.connections.length}** connexions
- URLs de la V1 vérifiées : **${checked.length}** (en ligne ${count('En ligne')}, redirigées ${count('Redirigé')}, hors ligne ${count('Hors ligne')}, indéterminées ${count('Indéterminé')})
- Passent en « ${OFF} » : **${changes.archived.length + changes.redirected.length}** (${changes.archived.length} inaccessibles, ${changes.redirected.length} redirigées vers un autre site)
- Réactivés (« ${OFF} » → « Site web ») : **${changes.revived.length}**
- Administrations de la V1 renommées selon l'intitulé actuel : **${s.renamed.length}**
- Nouveaux sites : **${additions.length}**, dont ${additions.filter(a => a.type === 'Sous-domaine').length} sous-domaines (annuaire ${fromSource('Annuaire')}, DINUM ${fromSource('DINUM')}, certificats ${fromSource('crt.sh')}, démarches ${fromSource('Observatoire')}) ; **${orphans.length}** sans rattachement
- Nouvelles administrations (annuaire) : **${newOrgs.length}**, dont ${ministries.length} ministères et ${newOrgs.filter(o => o.tags.includes('Tutelle à préciser')).length} sans ministère de tutelle connu
- Sites de la V1 réorganisés selon l'annuaire : ${s.reorganized} liens de 2019 remplacés
- Entités de premier niveau de l'annuaire ajoutées (même sans site propre) : ${s.viaEntities}
- Doublons fusionnés (anciennes adresses qui mènent au même site) : ${s.merged}
- Sites portant des démarches essentielles (Observatoire) : ${s.demarcheSites} ; rattachés grâce à l'Observatoire : ${s.viaDemarches}
- Organismes reliés au site vers lequel redirige leur site déclaré : ${s.viaRedirectSites}
- Services en ligne et consultations de la V1 reclassés en site ou sous-domaine : ${s.retyped}
- Rattachements complémentaires : ${s.viaV1} sites de la V1 sans lien (annuaire, config/rattachements.csv), ${s.viaManual} organismes par config/tutelles.csv, ${s.viaPrefecture} sites de préfecture, ${s.viaMarque} sites par leur bloc-marque DSFR ou les ministères cités dans la page, ${s.viaKeyword} sites par leur nom de domaine
- Opérateurs de l'État (PLF) reconnus : **${s.matchedOps}** sur ${s.operateurs} ; ${s.viaOperators} administrations rattachées à leur ministère grâce au programme budgétaire
- V2 : **${map.elements.length}** éléments, **${map.connections.length}** connexions (${map.connections.length - s.v1Connections} nouvelles)
${map.warnings.length ? `\n### Avertissements\n\n${map.warnings.map(w => `- ${w}`).join('\n')}\n` : ''}
## Sites sans rattachement (${orphans.length})

${orphans.map(a => `- ${a.label} (${a.Source.replace(/ \(.*\)/, '')})`).join('\n')}

## Administrations renommées (${s.renamed.length})

| Intitulé 2019 | Intitulé actuel |
|---|---|
${s.renamed.map(([a, b]) => `| ${a} | ${b} |`).join('\n')}

## Nouveaux ministères (${ministries.length})

${ministries.map(o => `- ${o.label}`).join('\n')}
${table('Sites devenus inaccessibles', changes.archived)}${table('Sites redirigés vers un autre site', changes.redirected)}${table('Sites archivés de nouveau en ligne', changes.revived)}${table('Statut indéterminé — type inchangé, à revérifier', changes.unknown)}
## Nouveaux sites (${additions.length})

| URL | Organisme | Tutelle | Source |
|---|---|---|---|
${additions.map(addLine).join('\n')}

## Candidats écartés car redirigés vers un autre site (${s.skippedRedirects.length})

${s.skippedRedirects.map(c => `- ${c.url} → ${c.finalUrl}`).join('\n')}
`;
}
