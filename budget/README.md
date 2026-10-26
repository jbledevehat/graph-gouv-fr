# L'argent public en 2024

Section « Budget de l'État » de [gouvfr.jbledevehat.fr](https://gouvfr.jbledevehat.fr/budget/) :
`index.html` (exploration) est publié à l'adresse `/budget/`, `pilotage.html` à
`/budget/pilotage.html` et `aides.html` à `/budget/aides.html`. La construction du site
(`src/build/export.mjs`) copie ces pages en y insérant le bandeau commun, `donnees/` et le JSON des
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

## Estimations : fraude, évitement fiscal, aides non demandées

La page d'exploration montre aussi, en cercles et non en rectangles, ce qui échappe aux comptes :
à droite les **recettes perdues** (fraude aux cotisations et aux prestations, fraude de
professionnels de santé, TVA non déclarée, évitement fiscal des multinationales), à gauche les
**aides non demandées** (non-recours au RSA et au minimum vieillesse). Ce ne sont pas des comptes
mais des estimations publiées, rassemblées dans
[`donnees/estimations.json`](donnees/estimations.json) avec, pour chacune, son année de
référence (souvent antérieure à 2024), sa méthode, sa fiabilité et sa source ; les documents
d'origine sont dans `sources/estimations/` et au registre. Le disque plein est la borne basse de
la fourchette, le cercle pointillé la borne haute, à la même échelle que les comptes.

| Estimation | Montant | Année | Source |
|---|---|---|---|
| Fraude aux cotisations sociales | ≈ 7,3 Md€ (52 % de 14 Md€) | 2024-2025 | HCFiPS, janvier 2026 |
| Fraude aux prestations par des bénéficiaires | ≈ 5,0 Md€ (36 %) | 2024-2025 | HCFiPS, janvier 2026 |
| Fraude de professionnels de santé | ≈ 1,7 Md€ (12 %) | 2024-2025 | HCFiPS, janvier 2026 |
| TVA non déclarée | 6 à 10 Md€ (minorant) | 2019 | DGFiP Analyses n° 7, 2024 |
| Évitement fiscal des multinationales | 4,6 à 14 Md€ | 2015-2019 | CAE note n° 54 ; CEPII Lettre n° 400 |
| RSA non demandé | ≈ 2,5 Md€ | 2021 | DREES, Études et Résultats n° 1370, 2026 |
| Minimum vieillesse non demandé (personnes seules) | 0,79 à 1,09 Md€ | 2016 | DREES, Dossier n° 97, 2022 |
| *À part :* fraude fiscale, tous impôts | 20,5 à 100 Md€ | 1996-2018 | Cour des comptes, 2025 (trois estimations anciennes) |

La fraude fiscale tous impôts n'a pas d'estimation fiable : la Cour des comptes (décembre 2025)
recense trois estimations anciennes, faites hors de l'administration et « fragiles et
divergentes » (17,4 à 22,7 Md€ en 1996, 20,5 à 25,6 Md€ en 2007, 80 à 100 Md€ en 2018 selon le
syndicat Solidaires Finances publiques). Leur fourchette est dessinée à part, en grand cercle en
petits points, avec ces réserves ; elle recouvre en partie la TVA et l'évitement fiscal et ne
s'ajoute pas au total. Le non-recours à l'assurance chômage, à la complémentaire santé solidaire
et à la prime d'activité n'est pas chiffré en euros (seuls des taux existent) ; le chiffre de
10 Md€ d'aides non demandées, souvent cité, n'a pas de source publique vérifiable.

## Refaire le travail

```sh
sh scripts/telecharger.sh      # télécharge les fichiers officiels et met à jour sources/SOURCES.md
for a in $(seq 2019 2024); do python3 scripts/insee.py $a; done   # administrations publiques (Insee) -> donnees/argent-public-AAAA.json
for a in 2023 2024 2025; do python3 scripts/construire.py $a; done  # budget de l'État (et aides en 2024) -> donnees/budget-etat-AAAA.json et CSV
python3 scripts/annees.py      # années disponibles et échelle commune -> donnees/annees.json
python3 scripts/verifier.py    # compare les totaux au tableau officiel ; échoue en cas d'écart
python3 -m http.server 8767    # aperçu du seul budget : http://localhost:8767
```

Les scripts n'utilisent que la bibliothèque standard de Python 3.

## Années

Un bloc « Année » dans le bandeau (un bouton par année, comme les pages de la section) permet de changer d'année ;
l'année est dans l'adresse (`?annee=2022`) et suit le visiteur d'une page à l'autre de la section.
Les années disponibles sont dans [`donnees/annees.json`](donnees/annees.json), écrit par
`scripts/annees.py` :

| Source | Années | Pages |
|---|---|---|
| Ensemble des administrations publiques (Insee, comptes de la Nation, base 2020) | 2019 à 2024 | exploration ; pilotage, parties 1 et 2 |
| Budget de l'État ministère par ministère (DGFiP) | 2023 à 2025 | pilotage, partie 3 |
| Aides aux entreprises (rapport annexé au PLF 2027) | 2024 | pilotage, partie 4 ; page des aides |

**Même échelle pour toutes les années.** Un milliard d'euros a la même surface quelle que soit
l'année : la surface du dessin est proportionnelle au total, rapporté au plus grand total de
toutes les années (2024 pour l'Insee, qui remplit la zone). Une année plus petite occupe donc une
partie de la zone seulement. Dans le pilotage, la vue d'ensemble de chaque composition n'occupe
que la part du cadre correspondant à son montant (le reste, en pointillés, rappelle ce que vaut le
cadre entier) ; le zoom, lui, remplit le cadre.

**Pourquoi 2019.** Les tableaux de l'Insee remontent plus loin, mais de 2009 à 2018 le total des
dépenses par fonction (tableau 3.307, qui donne la composition) dépasse de 14 à 20 Md€ celui du
tableau 3.201 (qui équilibre recettes et déficit), sans explication de l'Insee. À partir de 2019,
les deux concordent : on commence donc à 2019. `scripts/annees.py` signalerait sur les pages toute
année où cet écart dépasserait 50 M€.

**État.** 2023 et 2025 viennent des fichiers des projets de loi relatifs aux résultats de la
gestion, contrôlés contre leur article 1er. Ces deux années, les recettes y sont brutes, les
remboursements d'impôts n'étant pas ventilés par impôt : le financement de l'État y montre les
impôts nets en un seul bloc. En 2023, quatorze grands montants du fichier sont arrondis à six
chiffres significatifs (notation scientifique), d'où des contrôles à 1 M€ près (écart constaté :
moins de 0,6 M€). Les deux projets de loi ont été rejetés par l'Assemblée nationale (celui de 2025
adopté avec modifications par le Sénat) ; leurs montants sont ceux de l'exécution arrêtée par le
Gouvernement. Les ministères sont ceux du PLF 2025 pour toutes les années, pour qu'elles se
comparent ; trois programmes absents du PLF 2025 sont rattachés au ministère de leur mission
(`config/programmes-hors-plf2025.csv`). Pour 2025, l'Insee n'a pas encore publié les comptes de
l'ensemble des administrations : le pilotage ne montre que l'État.

Les estimations (fraude, non-recours) n'existent pas chaque année : ce sont des études ponctuelles.
Pour l'année affichée, la page montre l'estimation de cette année si elle existe (le RSA en a deux,
2018 et 2021), sinon celle de l'année la plus proche, atténuée et datée ; sa fiche le dit.

## Interactions

Page d'exploration (`index.html`), sur le modèle de la carte des sites : les dépenses à gauche et
ce qui les finance (impôts, cotisations, autres recettes, emprunt) à droite, à la même échelle.

- **Zoom et déplacement** : molette, pincement, glisser, boutons + et −, « Tout » ; au clavier,
  + et −, flèches, 0. Les noms apparaissent à mesure qu'on zoome.
- **Fiche** : un clic sur un bloc ouvre son explication, sa part sur 100 € et son détail.
- **PDF** : le bouton de téléchargement, à côté du zoom, donne l'exploration de l'année affichée en
  PDF vectoriel (`/budget/pdf/argent-public-AAAA.pdf`, construit par `src/build/pdf-budget.mjs`) :
  même composition et même échelle, tous les noms et montants, estimations, sources. Police
  IBM Plex Sans (SIL OFL, `src/build/polices/`).
- **Recettes** : par administration, chacune avec ses impôts (consommation et production, revenu
  et patrimoine, successions, part reversée par une autre administration) et ses cotisations
  (versées ou imputées, comme les retraites des fonctionnaires que l'État paie lui-même) ; ou par
  type de recette, impôt par impôt (TVA, CSG, impôt sur le revenu, taxe foncière…, tableau 3.217
  de l'Insee, sans la part des droits de douane qui revient à l'Union européenne). L'impôt sur le
  revenu et l'impôt sur les sociétés sont comptés après crédits d'impôt. Quand un total est net
  (impôts reversés, impôts jamais encaissés), sa fiche le dit : ses sous-blocs, eux, sont avant
  ces déductions.
- **Regroupements**, à côté du titre de chaque moitié : dépenses par administration ou par
  fonction, recettes par administration ou par type.
- **Panneau** : recherche, cases
  pour afficher ou atténuer chaque administration, l'emprunt et les autres recettes, cases pour
  mettre en avant une ou plusieurs fonctions.

Page de pilotage (`pilotage.html`) :

- **Zoom** : dans chaque composition, un clic sur un rectangle qui a du détail l'agrandit
  (administration, puis fonction, puis sous-fonction ; ministère, puis mission, puis programme ;
  instrument, puis ministère, puis dispositif). Un fil d'étapes permet de remonter.
- **Barre des totaux** au-dessus de chaque composition : le montant et la part de chaque élément
  du niveau affiché ; un clic sur un élément zoome dessus.
- **Explications** : chaque fonction, sous-fonction, administration, mission, type d'aide et
  type de recette a un « C'est quoi ? » et des exemples concrets en langage courant
  ([`donnees/explications.json`](donnees/explications.json), rédigé à partir de la nomenclature
  COFOG appliquée par l'Insee et des lois de finances) ; le montant est traduit en « sur 100 €
  d'argent public, X € vont ici ».
- **Recherche** dans tous les comptes (fonctions, ministères, missions, programmes, impôts, aides),
  avec les sigles courants (CIR, TVA, CSG…) et quelques équivalents du langage courant
  (retraite → vieillesse, pensions) ; un résultat ouvre le graphique concerné, zoomé.

## Contenu

- `index.html` : exploration plein écran des dépenses et des recettes ;
- `pilotage.html` : tableau de bord (dépenses publiques par administration et par fonction, recettes
  et impôts, budget de l'État par ministère, aides aux entreprises, sources) ;
- `aides.html` : tableau de bord détaillé des aides aux entreprises ;
- `donnees/` : données construites (JSON lu par la page, CSV réutilisables) ;
- `sources/` : fichiers officiels, sans modification, et leur registre ;
- `config/` : tables de rattachement documentées et chiffres officiels de référence ;
- `scripts/` : téléchargement, construction, vérification.

## Licence

Code et données : [Licence Ouverte 2.0](LICENSE.md).
