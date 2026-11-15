# Registre des sources : Transition écologique et énergie

Fichiers officiels utilisés pour `donnees/ecologie.json`, tels que téléchargés, sans aucune
modification. L'empreinte SHA-256 permet de vérifier qu'un fichier est identique à l'original :
`shasum -a 256 <fichier>`. Les fichiers de plus de 5 Mo ne sont pas gardés dans le dépôt, mais
sont décrits ici avec leur empreinte.

## Non gardé : `Citepa2026_gaz_a_effet_de_serre.zip`

- **Contenu** : Inventaire Secten édition 2026 des émissions de gaz à effet de serre de la France, 1990-2025 (2025 provisoire). Archive de quatre classeurs. Utilisé : `01-Citepa_Emissions-par-substance_Secten-GES_2026-d.xlsx` (5 024 489 octets, SHA-256 `84ffe3ad6c19e9ebbdefd4f48be9b865943b69f419d2f8e510c8a542d977a130`), feuilles « Récapitulatif » (total hors et avec UTCATF), « CO2e-UE » (émissions par grand secteur) et « Objectifs-GES » (objectif 2030 de la loi et du projet de SNBC 3) ; et `20_Citepa_chiffres_cles_Secten-GES_ed2026-d.xlsx` (91 217 octets, SHA-256 `91e9a7596ac8757b2d2b01de72430c4362b7aff7924aee205cfe986ecebf1105`), feuille « CO2e » (part de la production d'électricité en 2024).
- **Jeu de données** : Secten, édition 2026 (« Citepa/Format Secten avril 2026 »)
- **Producteur** : Citepa, pour le ministère de la Transition écologique (Système national d'inventaires d'émission et de bilans pour l'atmosphère)
- **Adresse du fichier** : <https://www.citepa.org/wp-content/uploads/2026/06/Citepa2026_gaz_a_effet_de_serre.zip>
- **Page du jeu de données** : <https://www.citepa.org/donnees-air-climat/donnees-gaz-a-effet-de-serre/secten/>
- **Licence** : données publiques du Citepa (citation demandée : « Citepa/Format Secten avril 2026 »)
- **Téléchargé le** : 2026-11-15
- **Taille** : 6 741 224 octets (non gardé : plus de 5 Mo)
- **SHA-256** : `5636f03e8a2155568540440344562991917bbad1592b5d5ebc181f93ad918e91`

## Non gardés : autres fichiers Secten 2026 consultés

- `Citepa2026_donnees_par_secteur.zip` : <https://www.citepa.org/wp-content/uploads/2026/06/Citepa2026_donnees_par_secteur.zip>, 18 926 679 octets, SHA-256 `5784204ed5f6395d267adeb1311f544b73230ffd2dce33b96c687d444228c427`. Téléchargé le 2026-11-15, non utilisé (les totaux par secteur viennent du fichier 01 ci-dessus).
- `serie_longue_Citepa_Secten_ed_2026-d.xlsx` : <https://www.citepa.org/wp-content/uploads/2026/06/serie_longue_Citepa_Secten_ed_2026-d.xlsx>, 2 846 114 octets, SHA-256 `1d5e5fbb52cbb33efb616cdc8b1d0acafa2044f9fd87a96d7b87d7bcf2e1bdef`. Téléchargé le 2026-11-15, non utilisé.

## `sources/ecologie/insee-ip2130-empreinte-carbone-2025.xlsx`

- **Contenu** : Données de l'Insee Première n° 2130 « Émissions de gaz à effet de serre et empreinte carbone de la France en 2025 » (13 octobre 2026). Utilisé : tableau complémentaire 2 (émissions des résidents et empreinte, en milliers de tonnes et en tonnes par habitant, 1990-2025) et figure 1 (décomposition de l'empreinte 2025 : 571 Mt dont 296 Mt importées).
- **Jeu de données** : Insee Première n° 2130, octobre 2026
- **Producteur** : Insee et SDES (traitements Insee-SDES 2026 d'après Insee, Eurostat, Citepa, Douanes, OCDE)
- **Adresse du fichier** : <https://www.insee.fr/fr/statistiques/fichier/9074153/ip2130.xlsx>
- **Page du jeu de données** : <https://www.insee.fr/fr/statistiques/9074153>
- **Licence** : Licence Ouverte 2.0
- **Téléchargé le** : 2026-11-15
- **Taille** : 54 109 octets
- **SHA-256** : `bd4c5a6f2919cbb55ecb4b4ae3d5f779e40be2751829c84cdff31714463fc2ad`

## `sources/ecologie/insee-ipc-2015-energie-annuel.xml`

- **Contenu** : Indices annuels des prix à la consommation, base 2015, regroupement « Énergie » (France, France métropolitaine, départements d'outre-mer ; indices, variations, pondérations). Utilisé : série 001765155 (ensemble des ménages, France).
- **Jeu de données** : Indices des prix à la consommation, base 2015 (IPC-2015), séries arrêtées
- **Producteur** : Insee
- **Adresse du fichier** : <https://bdm.insee.fr/series/sdmx/data/IPC-2015/A....4007.......?startPeriod=2014>
- **Page du jeu de données** : <https://www.insee.fr/fr/statistiques/serie/001765155>
- **Licence** : Licence Ouverte 2.0
- **Téléchargé le** : 2026-11-15
- **Taille** : 25 083 octets
- **SHA-256** : `c1389097a0dca3e5f109f97a00c35ed840b4fca72b3dc282c82608deeec9fd4d`

## `sources/ecologie/insee-ipc-2015-electricite-annuel.xml`

- **Contenu** : Indice annuel des prix à la consommation, base 2015, ensemble des ménages, France, poste 04.5.1 « Électricité » (série 001764660).
- **Jeu de données** : IPC-2015, séries arrêtées
- **Producteur** : Insee
- **Adresse du fichier** : <https://bdm.insee.fr/series/sdmx/data/IPC-2015/A...0451..INDICE.ENSEMBLE.FE.....?startPeriod=2014>
- **Page du jeu de données** : <https://www.insee.fr/fr/statistiques/serie/001764660>
- **Licence** : Licence Ouverte 2.0
- **Téléchargé le** : 2026-11-15
- **Taille** : 3 088 octets
- **SHA-256** : `d5bb6eb0e9801cb652193e034e327da7aa4367e96db47fadc9ce92b741888d19`

## `sources/ecologie/insee-ipc-2015-ensemble-annuel.xml`

- **Contenu** : Indices annuels des prix à la consommation, base 2015, ensemble des ménages, France : « Ensemble » (série 001764363, utilisée) et « Ensemble y compris loyers fictifs » (série 001765177, non utilisée).
- **Jeu de données** : IPC-2015, séries arrêtées
- **Producteur** : Insee
- **Adresse du fichier** : <https://bdm.insee.fr/series/sdmx/data/IPC-2015/A...00..INDICE.ENSEMBLE.FE.....?startPeriod=2014>
- **Page du jeu de données** : <https://www.insee.fr/fr/statistiques/serie/001764363>
- **Licence** : Licence Ouverte 2.0
- **Téléchargé le** : 2026-11-15
- **Taille** : 4 628 octets
- **SHA-256** : `d9331b47cac44abdba44bf9c2a6d50de8bff424a91127797a4ee10610dfd621e`

## `sources/ecologie/sdes-essentiel-precarite-energetique-2024.pdf`

- **Contenu** : « En 2024, la précarité énergétique a augmenté dans un contexte de fin progressive des mesures exceptionnelles de soutien aux ménages », Les Essentiels, septembre 2026. Utilisé : graphique 1 (indicateur de précarité énergétique brut et corrigé de la météo, 2016-2024, valeurs lues sur les étiquettes du graphique) et texte (3,5 millions de ménages ; 12,1 % sans bouclier ; 10,3 % avec chèque énergie ; hausse des prix de l'électricité en 2024).
- **Jeu de données** : Précarité énergétique 2024, modèle Prometheus 2026 (CGDD)
- **Producteur** : SDES (ministère de la Transition écologique)
- **Adresse du fichier** : <https://www.ecologie.gouv.fr/sites/default/files/publications/statistiques_sdes_essentiel_08_preecarite_%20energeetique_2024_sept%202026.pdf>
- **Page du jeu de données** : <https://www.ecologie.gouv.fr/politiques-publiques/collection-essentiels>
- **Licence** : Licence Ouverte 2.0
- **Téléchargé le** : 2026-11-15
- **Taille** : 766 172 octets
- **SHA-256** : `8b9a478d21a5cf92969c29ebc7bf063b7a09aae86fb8a3822a94d8953d5a828d`

## Non gardé : tableau de bord de l'ONPE, édition novembre 2025

- **Contenu** : Tableau de bord de la précarité énergétique (ONPE). Consulté seulement pour la valeur de 2023 publiée en 2025 (10,1 %), citée pour montrer les révisions du modèle, et pour la définition de l'indicateur de ressenti du froid.
- **Producteur** : Observatoire national de la précarité énergétique
- **Adresse du fichier** : <https://www.precarite-energie.org/wp-content/uploads/2026/06/onpe-tableau-de-bord-de-la-precarite-energetique-2025-v2.pdf>
- **Téléchargé le** : 2026-11-15
- **Taille** : 4 775 253 octets (non gardé : document de contexte)
- **SHA-256** : `1d6a48679358724a625b2d3d75ffe6f7e506e1d9ee50a2c0bcf0d3b3f9390243`

## `sources/ecologie/sdes-bilan-energetique-2025-provisoire-figures.xlsx`

- **Contenu** : Données des figures du bilan énergétique provisoire de la France en 2025. Utilisé : figure 3 (facture énergétique de la France par énergie, 1970-2025, en milliards d'euros de 2025 ; 2025 provisoire).
- **Jeu de données** : Bilan énergétique de la France en 2025, données provisoires (publié le 22 avril 2026, modifié le 21 mai 2026)
- **Producteur** : SDES, d'après DGDDI, enquête auprès des raffineurs, RTE, enquête gazière
- **Adresse du fichier** : <https://www.statistiques.developpement-durable.gouv.fr/media/9281/download?inline>
- **Page du jeu de données** : <https://www.statistiques.developpement-durable.gouv.fr/bilan-energetique-de-la-france-en-2025-donnees-provisoires>
- **Licence** : Licence Ouverte 2.0
- **Téléchargé le** : 2026-11-15
- **Taille** : 48 216 octets
- **SHA-256** : `c81455984b49d1b63c73145923fe07c53a12a2f5587ff905e560e9e01e5ce562`

Non gardé et non utilisé : « Séries longues du bilan énergétique provisoire de la France en 2025 »,
<https://www.statistiques.developpement-durable.gouv.fr/media/9283/download?inline>, 648 578 octets,
SHA-256 `3108c8056060091835f7beb8ae9270546ca77998a38630d0da9d60b376da71de`, téléchargé le 2026-11-15.

## `sources/ecologie/eurostat-nrg_ind_ren-part-renouvelables.json`

- **Contenu** : Part de l'énergie renouvelable dans la consommation finale brute d'énergie (indicateur REN, en %), France, Allemagne, Italie, Espagne, Union européenne à 27, 2015-2025 (2025 provisoire). Mise à jour Eurostat du 15 septembre 2026.
- **Jeu de données** : nrg_ind_ren
- **Producteur** : Eurostat
- **Adresse du fichier** : <https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/nrg_ind_ren?format=JSON&lang=fr&nrg_bal=REN&unit=PC&geo=EU27_2020&geo=FR&geo=DE&geo=IT&geo=ES&sinceTimePeriod=2015>
- **Page du jeu de données** : <https://ec.europa.eu/eurostat/databrowser/view/nrg_ind_ren/default/table?lang=fr>
- **Licence** : CC BY 4.0 (politique de réutilisation d'Eurostat)
- **Téléchargé le** : 2026-11-15
- **Taille** : 4 614 octets
- **SHA-256** : `537a4ba61c3529d6ea42b0ac304208c2281c5f6e6a8ada46743ce2e1d51385e0`

## `sources/ecologie/eurostat-sdg_13_10-ges-par-habitant.json`

- **Contenu** : Émissions nationales de gaz à effet de serre hors UTCATF, en tonnes par habitant, France, Allemagne, Italie, Espagne, 2015-2024. Mise à jour Eurostat du 22 avril 2026. L'agrégat Union européenne n'est pas diffusé dans ce jeu de données.
- **Jeu de données** : sdg_13_10
- **Producteur** : Eurostat (d'après les inventaires transmis à l'Agence européenne pour l'environnement)
- **Adresse du fichier** : <https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/sdg_13_10?format=JSON&lang=fr&unit=T_HAB&src_crf=TOTX4_MEMO&geo=FR&geo=DE&geo=IT&geo=ES&sinceTimePeriod=2015>
- **Page du jeu de données** : <https://ec.europa.eu/eurostat/databrowser/view/sdg_13_10/default/table?lang=fr>
- **Licence** : CC BY 4.0 (politique de réutilisation d'Eurostat)
- **Téléchargé le** : 2026-11-15
- **Taille** : 5 142 octets
- **SHA-256** : `480e68ad2b259eded5463758a3b0b7199a6b78dd2466b952d7852d0867971aaf`

## `sources/ecologie/eurostat-env_air_gge-ges-total.json`

- **Contenu** : Émissions de gaz à effet de serre hors UTCATF, en millions de tonnes, Union européenne à 27, France, Allemagne, Italie, Espagne, 2015-2024. Mise à jour Eurostat du 2 juin 2026. Sert au calcul de la valeur par habitant de l'Union européenne (3 017,18798 Mt en 2024).
- **Jeu de données** : env_air_gge
- **Producteur** : Eurostat
- **Adresse du fichier** : <https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/env_air_gge?format=JSON&lang=fr&unit=MIO_T&airpol=GHG&src_crf=TOTX4_MEMO&geo=EU27_2020&geo=FR&geo=DE&geo=IT&geo=ES&sinceTimePeriod=2015>
- **Page du jeu de données** : <https://ec.europa.eu/eurostat/databrowser/view/env_air_gge/default/table?lang=fr>
- **Licence** : CC BY 4.0 (politique de réutilisation d'Eurostat)
- **Téléchargé le** : 2026-11-15
- **Taille** : 4 191 octets
- **SHA-256** : `36466487df5ca898fe8db68f9f346ecea9fdc9bac1b9b1805824dae4b2c0adb5`

## `sources/ecologie/eurostat-demo_gind-population-moyenne.json`

- **Contenu** : Population moyenne annuelle (indicateur AVG), Union européenne à 27, France, Allemagne, Italie, Espagne, 2015-2025. Mise à jour Eurostat du 27 octobre 2026. Sert au calcul de la valeur par habitant de l'Union européenne (450 669 521 habitants en 2024) ; la même division redonne les valeurs publiées dans sdg_13_10 pour les quatre pays.
- **Jeu de données** : demo_gind
- **Producteur** : Eurostat
- **Adresse du fichier** : <https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/demo_gind?format=JSON&lang=fr&indic_de=AVG&geo=EU27_2020&geo=FR&geo=DE&geo=IT&geo=ES&sinceTimePeriod=2015>
- **Page du jeu de données** : <https://ec.europa.eu/eurostat/databrowser/view/demo_gind/default/table?lang=fr>
- **Licence** : CC BY 4.0 (politique de réutilisation d'Eurostat)
- **Téléchargé le** : 2026-11-15
- **Taille** : 4 028 octets
- **SHA-256** : `690253fe258bfe0269d2d6393832ab4762f9d81ef5732f38b49787d8e9305c80`

## Texte officiel : code de l'énergie, article L100-4 (non téléchargé)

- **Contenu** : Objectifs de la politique énergétique nationale : réduction de 40 % des émissions de gaz à effet de serre entre 1990 et 2030 ; part des énergies renouvelables de 23 % de la consommation finale brute d'énergie en 2020 et d'au moins 33 % en 2030. Version en vigueur depuis le 24 juin 2023 (loi n° 2023-491 du 22 juin 2023).
- **Producteur** : Légifrance (DILA)
- **Adresse** : <https://www.legifrance.gouv.fr/codes/section_lc/LEGITEXT000023983208/LEGISCTA000023985174/>
- **Licence** : Licence Ouverte 2.0
- **Consulté le** : 2026-11-15

## Performance de l'État

Indicateurs lus dans les fichiers déjà présents du dépôt : `budget/sources/performance/RAP2025-Performance.csv`
et `budget/sources/performance/Performance-execution-cible-2022-2024.csv` (mission « Écologie,
développement et mobilité durables », programmes 174, 203 et 345).
