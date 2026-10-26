# L'argent public en 2024

Section « Budget de l'État » de [gouvfr.jbledevehat.fr](https://gouvfr.jbledevehat.fr/budget/) :
`index.html` est publié à l'adresse `/budget/`, `aides.html` à `/budget/aides.html`. La
construction du site (`src/build/export.mjs`) copie ces deux pages, `donnees/` et le JSON des
aides ; les données elles-mêmes se reconstruisent avec les scripts ci-dessous, lancés depuis ce
dossier `budget/`. Les scripts d'extraction du PDF des aides sont dans `scripts/aides/`.

Tableau de bord de **toute la dépense publique** de la France en 2024 (1 671,8 Md€, 57 % du PIB) :
État, sécurité sociale, collectivités locales et opérateurs, par fonction ; les recettes publiques
et les principaux impôts ; le **budget de l'État** ministère par ministère ; les **aides aux
entreprises** rattachées à leur ministère. Chaque montant est représenté par un rectangle à
l'échelle, dans le même style graphique que le tableau de bord des aides.

Proposition indépendante construite à partir de documents publics ; ce n'est pas un outil officiel.

## L'ensemble des administrations publiques (Insee, en milliards d'euros)

| | 2024 |
|---|---|
| Dépenses publiques | 1 671,8 |
| dont sécurité sociale | 758,8 |
| dont État (comptabilité nationale) | 469,2 |
| dont collectivités locales | 322,2 |
| dont opérateurs de l'État | 121,6 |
| Recettes publiques | 1 502,1 |
| Déficit public | 169,7 |

Dépenses consolidées : un transfert d'une administration à une autre n'est compté qu'une fois, chez
celle qui dépense en dernier. Source : [comptes de la Nation en 2024](https://www.insee.fr/fr/statistiques/8574707?sommaire=8574832),
tableaux 3.201, 3.215, 3.217 et 3.307.

## Le budget de l'État (DGFiP, en milliards d'euros)

| | 2024 |
|---|---|
| Recettes fiscales brutes | 467,2 |
| − remboursements et dégrèvements d'impôts d'État | 141,6 |
| = Recettes fiscales nettes | 325,7 |
| + recettes non fiscales | 23,2 |
| − prélèvements au profit des collectivités et de l'Union européenne | 67,7 |
| = **Recettes nettes** | **281,2** |
| **Dépenses nettes** (hors fonds de concours) | **435,1** |
| **Solde du budget général** | **−153,9** |
| Résultat de l'État (avec comptes spéciaux et budgets annexes) | −155,9 |
| Aides aux entreprises (rapport annexé au PLF 2027, périmètre élargi) | 166,1 |

Chacun de ces montants, sauf le dernier et le résultat de l'État, est recalculé à partir des
fichiers de la DGFiP et retrouve, au millier d'euros près, le tableau de l'article 1er du
[projet de loi d'approbation des comptes 2024](https://www.senat.fr/leg/pjl24-718.html).

## Sources

- **[Comptes de la Nation en 2024](https://www.insee.fr/fr/statistiques/8574707?sommaire=8574832)**,
  Insee : dépenses de toutes les administrations publiques par fonction, recettes, impôts.

Toutes les sources, leur adresse exacte, leur producteur, leur licence, leur date de téléchargement
et leur empreinte SHA-256 sont dans [`sources/SOURCES.md`](sources/SOURCES.md). En résumé :

- **[Loi relative aux résultats de la gestion 2024 (PLRG 2024)](https://data.economie.gouv.fr/explore/dataset/plrg-2024/)**,
  DGFiP, Licence Ouverte 2.0 : dépenses par programme et par nature, recettes ligne par ligne,
  comptes spéciaux, liste des dépenses fiscales.
- **[PLF 2025 - Dépenses selon destination](https://data.economie.gouv.fr/explore/dataset/plf25-depenses-2025-selon-destination/)**,
  Direction du budget, Licence Ouverte 2.0 : utilisé seulement pour rattacher chaque programme à
  son ministère, le fichier d'exécution ne le donnant pas.
- **[Rapport relatif aux aides publiques aux entreprises](https://www.tresor.economie.gouv.fr/Articles/54f1c35b-e6b0-4b6a-9929-1707e5c981ac/files/e0a8b1fa-faed-4809-9dc7-b06f0d1e2e0f)**,
  annexe au PLF 2027 : les 469 dispositifs extraits et vérifiés ligne à ligne dans le projet
  « Aides entreprises ».

## Méthode

- **Couleurs** : une par administration sur toute la vue d'ensemble, prises dans la palette du
  tableau de bord des aides et vérifiées pour les daltonismes : bleu pour l'État (comme les aides
  budgétaires), violet pour la sécurité sociale (comme les exonérations de cotisations), vert pour
  les opérateurs (comme les aides financières, versées surtout par des opérateurs), jaune pour les
  collectivités. Gris neutre pour ce qui ne revient pas à une seule administration, hachures pour
  le déficit ; dans la partie sur les aides, les hachures marquent le périmètre élargi.
- **Recettes par administration** : impôts et cotisations sont comptés chez l'administration qui
  les perçoit (tableaux Insee 3.203, 3.204, 3.205 et 3.212) ; leur somme retrouve exactement le
  total consolidé. Les autres recettes ne sont pas réparties, car elles contiennent des flux entre
  administrations que le total neutralise.

- **Dépenses** : dépenses constatées en crédits de paiement. Les fichiers incluent les fonds de
  concours (8,3 Md€) ; les dépenses nettes retirent les remboursements et dégrèvements d'impôts
  d'État (programme 200), qui sont des recettes restituées.
- **Ministères** : ceux du PLF 2025 (gouvernement d'octobre 2024). Quatre programmes supprimés en
  2025 sont rattachés à la main dans [`config/programmes-hors-plf2025.csv`](config/programmes-hors-plf2025.csv).
- **Aides aux entreprises**, rattachées à un ministère selon cet ordre :
  1. aide fiscale : le programme de sa dépense fiscale dans la liste officielle ;
  2. aide budgétaire ou financière : le premier programme cité par le rapport, hors plan de
     relance (programmes 362 à 364) quand un autre programme est cité ;
  3. sinon, le ministère de tutelle de l'opérateur qui la verse, selon la table justifiée ligne à
     ligne [`config/aides-operateurs.csv`](config/aides-operateurs.csv) ;
  4. exonérations de cotisations : sécurité sociale, hors budget de l'État.
- **Aides et crédits ne s'additionnent pas** : une aide versée par un opérateur n'est pas forcément
  comprise dans les crédits du ministère, et une aide fiscale est un impôt non perçu.
- **Anomalie signalée** : dans le fichier des recettes, la ligne « 17 (total) (total) »
  (−8,7 Md€) est en réalité la section 18 « Autres remboursements et dégrèvements d'impôts
  d'État », d'après la notice PDF officielle ; elle est renommée.

## Refaire le travail

```sh
sh scripts/telecharger.sh      # télécharge les fichiers officiels et met à jour sources/SOURCES.md
python3 scripts/insee.py       # administrations publiques (Insee) -> donnees/argent-public-2024.json
python3 scripts/construire.py  # budget de l'État et aides -> donnees/budget-etat-2024.json et CSV
python3 scripts/verifier.py    # compare les totaux au tableau officiel ; échoue en cas d'écart
python3 -m http.server 8767    # aperçu du seul budget : http://localhost:8767
```

Les scripts n'utilisent que la bibliothèque standard de Python 3.

## Interactions

- **Zoom** : dans chaque composition, un clic sur un rectangle qui a du détail l'agrandit
  (administration, puis fonction, puis sous-fonction ; ministère, puis mission, puis programme ;
  instrument, puis ministère, puis dispositif). Un fil d'étapes permet de remonter.
- **Barre des totaux** au-dessus de chaque composition : le montant et la part de chaque élément
  du niveau affiché ; un clic sur un élément zoome dessus.
- **Recherche** dans tous les comptes (fonctions, ministères, missions, programmes, impôts, aides),
  avec les sigles courants (CIR, TVA, CSG…) et quelques équivalents du langage courant
  (retraite → vieillesse, pensions) ; un résultat ouvre le graphique concerné, zoomé.

## Contenu

- `index.html` : vue d'ensemble (dépenses publiques par administration et par fonction, recettes
  et impôts, budget de l'État par ministère, aides aux entreprises, sources) ;
- `aides.html` : tableau de bord détaillé des aides aux entreprises ;
- `donnees/` : données construites (JSON lu par la page, CSV réutilisables) ;
- `sources/` : fichiers officiels, sans modification, et leur registre ;
- `config/` : tables de rattachement documentées et chiffres officiels de référence ;
- `scripts/` : téléchargement, construction, vérification.

## Licence

Code et données : [Licence Ouverte 2.0](LICENSE.md).
