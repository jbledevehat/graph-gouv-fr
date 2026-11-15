# Registre des sources : Sécurité et justice

Fichiers officiels utilisés pour `donnees/securite.json`, tels que téléchargés, sans aucune
modification. L'empreinte SHA-256 permet de vérifier qu'un fichier est identique à l'original :
`shasum -a 256 <fichier>`.

## `sources/securite/donnee-reg-data.gouv-2025-geographie2026-produit-le2026-06-25.csv`

- **Contenu** : Nombre de faits, victimes ou mis en cause enregistrés par la police et la gendarmerie nationales, par région et par an, 2016 à 2025, pour les 18 indicateurs du SSMSI. Le total France des indicateurs `atteintes-biens`, `violences-physiques`, `violences-sexuelles`, `homicides` et `escroqueries` est la somme des 18 régions.
- **Jeu de données** : Bases statistiques communale, départementale et régionale de la délinquance enregistrée par la police et la gendarmerie nationales (édition juillet 2026, données produites le 25 juin 2026)
- **Producteur** : SSMSI (ministère de l'Intérieur)
- **Adresse du fichier** : <https://static.data.gouv.fr/resources/bases-statistiques-communale-departementale-et-regionale-de-la-delinquance-enregistree-par-la-police-et-la-gendarmerie-nationales/20260709-120055/donnee-reg-data.gouv-2025-geographie2026-produit-le2026-06-25.csv>
- **Page du jeu de données** : <https://www.data.gouv.fr/datasets/bases-statistiques-communale-departementale-et-regionale-de-la-delinquance-enregistree-par-la-police-et-la-gendarmerie-nationales>
- **Licence** : Licence Ouverte 2.0
- **Téléchargé le** : 2026-11-15
- **Taille** : 346 163 octets
- **SHA-256** : `c4eb0da46ca1e1a955ea8a8bcd1fb03e7ad956fdb0105508f58106db48150328`

## `sources/securite/donnee-dep-data.gouv-2025-geographie2026-produit-le2026-06-25.csv`

- **Contenu** : Même contenu par département ; utilisé pour vérifier que la somme des départements est identique à celle des régions (contrôle).
- **Jeu de données** : Bases statistiques de la délinquance enregistrée (édition juillet 2026)
- **Producteur** : SSMSI (ministère de l'Intérieur)
- **Adresse du fichier** : <https://static.data.gouv.fr/resources/bases-statistiques-communale-departementale-et-regionale-de-la-delinquance-enregistree-par-la-police-et-la-gendarmerie-nationales/20260709-120038/donnee-dep-data.gouv-2025-geographie2026-produit-le2026-06-25.csv>
- **Page du jeu de données** : <https://www.data.gouv.fr/datasets/bases-statistiques-communale-departementale-et-regionale-de-la-delinquance-enregistree-par-la-police-et-la-gendarmerie-nationales>
- **Licence** : Licence Ouverte 2.0
- **Téléchargé le** : 2026-11-15
- **Taille** : 2 001 231 octets
- **SHA-256** : `05fd70cbfe72f694826a8431630aa798071ab1f653b61fafbfc90a816b0122b1`

## `sources/securite/fichier-metadonnees-data-gouv-geographie-delinquance-juillet2026.pdf`

- **Contenu** : Documentation des bases : définition des 18 indicateurs, remplacement en juillet 2025 des « coups et blessures volontaires » par les violences physiques intrafamiliales et hors cadre familial (séries recalculées depuis 2016), comptage des escroqueries au lieu de résidence de la victime.
- **Jeu de données** : Bases statistiques de la délinquance enregistrée (édition juillet 2026)
- **Producteur** : SSMSI (ministère de l'Intérieur)
- **Adresse du fichier** : <https://static.data.gouv.fr/resources/bases-statistiques-communale-departementale-et-regionale-de-la-delinquance-enregistree-par-la-police-et-la-gendarmerie-nationales/20260709-120136/fichier-metadonnees-data-gouv-geographie-delinquance-juillet2026.pdf>
- **Page du jeu de données** : <https://www.data.gouv.fr/datasets/bases-statistiques-communale-departementale-et-regionale-de-la-delinquance-enregistree-par-la-police-et-la-gendarmerie-nationales>
- **Licence** : Licence Ouverte 2.0
- **Téléchargé le** : 2026-11-15
- **Taille** : 277 329 octets
- **SHA-256** : `b409750fa411754884b616bdfcb2a1e6c8b554d4693b9e590ccae01e61c29945`

## `sources/securite/cube-cvs-diffusion.csv`

- **Contenu** : Résultats détaillés des enquêtes Cadre de vie et sécurité, millésimes 2007 à 2019 ; colonne PROP_ENSEMBLE du module « Sentiment d'insécurité dans le quartier ou le village », sans ventilation (indicateur `sentiment-insecurite`).
- **Jeu de données** : Indicateurs annuels de la victimation et du sentiment d'insécurité issus des enquêtes Cadre de vie et sécurité
- **Producteur** : SSMSI (ministère de l'Intérieur), Insee, ONDRP
- **Adresse du fichier** : <https://static.data.gouv.fr/resources/indicateurs-annuels-de-la-victimation-et-du-sentiment-dinsecurite-issus-des-enquetes-cadre-de-vie-et-securite/20250626-224824/cube-cvs-diffusion.csv>
- **Page du jeu de données** : <https://www.data.gouv.fr/datasets/indicateurs-annuels-de-la-victimation-et-du-sentiment-dinsecurite-issus-des-enquetes-cadre-de-vie-et-securite>
- **Licence** : Licence Ouverte 2.0
- **Téléchargé le** : 2026-11-15
- **Taille** : 4 224 166 octets
- **SHA-256** : `9b2a3bc894d33e680c36ede3c8fcde2bdc539ce3f0fe0f6b61fff90df36c7c1f`

## `sources/securite/dictionnaire-variables.xlsx`

- **Contenu** : Dictionnaire des variables du fichier précédent (définition de PROP_ENSEMBLE, VAL_DIFF, MILLESIME, PERIODE_REF).
- **Jeu de données** : Indicateurs annuels de la victimation et du sentiment d'insécurité issus des enquêtes Cadre de vie et sécurité
- **Producteur** : SSMSI (ministère de l'Intérieur)
- **Adresse du fichier** : <https://static.data.gouv.fr/resources/indicateurs-annuels-de-la-victimation-et-du-sentiment-dinsecurite-issus-des-enquetes-cadre-de-vie-et-securite/20250626-212633/dictionnaire-variables.xlsx>
- **Page du jeu de données** : <https://www.data.gouv.fr/datasets/indicateurs-annuels-de-la-victimation-et-du-sentiment-dinsecurite-issus-des-enquetes-cadre-de-vie-et-securite>
- **Licence** : Licence Ouverte 2.0
- **Téléchargé le** : 2026-11-15
- **Taille** : 11 675 octets
- **SHA-256** : `66d5aa97b548f7e456341426386c57828e3fdd15f40303ba61b241933a7102f5`

## `sources/securite/mensuelle_janvier_2016_.xlsx`

- **Contenu** : Situation au 1er janvier 2016 : tableau 6 (capacité opérationnelle, personnes écrouées détenues, densité carcérale) et chiffres clés ; indicateurs `detenus` et `densite-carcerale`.
- **Jeu de données** : Statistique mensuelle de la population écrouée et détenue en France
- **Producteur** : Ministère de la Justice, administration pénitentiaire (DAP-SSER)
- **Adresse du fichier** : <https://static.data.gouv.fr/resources/statistique-mensuelle-de-la-population-detenue-et-ecrouee-en-fran-0/20160901-100603/mensuelle_janvier_2016_.xlsx>
- **Page du jeu de données** : <https://www.data.gouv.fr/datasets/statistique-mensuelle-de-la-population-ecrouee-et-detenue-en-france>
- **Licence** : Licence Ouverte 1.0 (fr-lo)
- **Téléchargé le** : 2026-11-15
- **Taille** : 527 470 octets
- **SHA-256** : `24ad90e56b2740b1738472ad4c8268c6b590ae941be71daae046f1e381dc6e64`

## `sources/securite/mensuelle_janvier_2017.xlsx`

- **Contenu** : Situation au 1er janvier 2017 : tableau 6 (capacité opérationnelle, personnes écrouées détenues, densité carcérale) et chiffres clés ; indicateurs `detenus` et `densite-carcerale`.
- **Jeu de données** : Statistique mensuelle de la population écrouée et détenue en France
- **Producteur** : Ministère de la Justice, administration pénitentiaire (DAP-SSER)
- **Adresse du fichier** : <https://static.data.gouv.fr/resources/statistique-mensuelle-de-la-population-detenue-et-ecrouee-en-fran-0/20170118-105525/mensuelle_janvier_2017.xlsx>
- **Page du jeu de données** : <https://www.data.gouv.fr/datasets/statistique-mensuelle-de-la-population-ecrouee-et-detenue-en-france>
- **Licence** : Licence Ouverte 1.0 (fr-lo)
- **Téléchargé le** : 2026-11-15
- **Taille** : 453 147 octets
- **SHA-256** : `bf3a11487628332f330a7b16220c447dc052d519f8fec5d43ef66ef6079cd344`

## `sources/securite/mensuelle_janvier_2018.xlsx`

- **Contenu** : Situation au 1er janvier 2018 : tableau 6 (capacité opérationnelle, personnes écrouées détenues, densité carcérale) et chiffres clés ; indicateurs `detenus` et `densite-carcerale`.
- **Jeu de données** : Statistique mensuelle de la population écrouée et détenue en France
- **Producteur** : Ministère de la Justice, administration pénitentiaire (DAP-SSER)
- **Adresse du fichier** : <https://static.data.gouv.fr/resources/statistique-mensuelle-de-la-population-ecrouee-et-detenue-en-france/20180122-103121/mensuelle_janvier_2018.xlsx>
- **Page du jeu de données** : <https://www.data.gouv.fr/datasets/statistique-mensuelle-de-la-population-ecrouee-et-detenue-en-france>
- **Licence** : Licence Ouverte 1.0 (fr-lo)
- **Téléchargé le** : 2026-11-15
- **Taille** : 530 658 octets
- **SHA-256** : `c82fa5d23d7dfe7eeb93ac3c86165b64add87a04f0290e12ad20a4d361b67044`

## `sources/securite/mensuelle-janvier-2019.xlsx`

- **Contenu** : Situation au 1er janvier 2019 : tableau 6 (capacité opérationnelle, personnes écrouées détenues, densité carcérale) et chiffres clés ; indicateurs `detenus` et `densite-carcerale`.
- **Jeu de données** : Statistique mensuelle de la population écrouée et détenue en France
- **Producteur** : Ministère de la Justice, administration pénitentiaire (DAP-SSER)
- **Adresse du fichier** : <https://static.data.gouv.fr/resources/statistique-mensuelle-de-la-population-ecrouee-et-detenue-en-france/20190307-114107/mensuelle-janvier-2019.xlsx>
- **Page du jeu de données** : <https://www.data.gouv.fr/datasets/statistique-mensuelle-de-la-population-ecrouee-et-detenue-en-france>
- **Licence** : Licence Ouverte 1.0 (fr-lo)
- **Téléchargé le** : 2026-11-15
- **Taille** : 546 969 octets
- **SHA-256** : `87df2b81757a7d531dfcc02e089fc996726173c64d91afdb32d3a122d00fd0f8`

## `sources/securite/stat-etablissements-janvier-2020.pdf`

- **Contenu** : Situation au 1er janvier 2020 : tableau 6 (capacité opérationnelle, personnes écrouées détenues, densité carcérale) et chiffres clés (PDF, page 12) ; indicateurs `detenus` et `densite-carcerale`.
- **Jeu de données** : Statistique mensuelle de la population écrouée et détenue en France
- **Producteur** : Ministère de la Justice, administration pénitentiaire (DAP-SSER)
- **Adresse du fichier** : <https://static.data.gouv.fr/resources/statistique-mensuelle-de-la-population-ecrouee-et-detenue-en-france/20261011-153102/stat-etablissements-janvier-2020.pdf>
- **Page du jeu de données** : <https://www.data.gouv.fr/datasets/statistique-mensuelle-de-la-population-ecrouee-et-detenue-en-france>
- **Licence** : Licence Ouverte 1.0 (fr-lo)
- **Téléchargé le** : 2026-11-15
- **Taille** : 1 301 967 octets
- **SHA-256** : `971943ac940f730bb68f6de83a85ea01918daaf5a03b4544043dff8e53cba498`

## `sources/securite/stat-etablissements-janvier-2021-corr3-v2.pdf`

- **Contenu** : Situation au 1er janvier 2021 : tableau 6 (capacité opérationnelle, personnes écrouées détenues, densité carcérale) et chiffres clés (PDF, pages 12 et 14 ; densité 103,4 %) ; indicateurs `detenus` et `densite-carcerale`.
- **Jeu de données** : Statistique mensuelle de la population écrouée et détenue en France
- **Producteur** : Ministère de la Justice, administration pénitentiaire (DAP-SSER)
- **Adresse du fichier** : <https://static.data.gouv.fr/resources/statistique-mensuelle-de-la-population-ecrouee-et-detenue-en-france/20261011-153630/stat-etablissements-janvier-2021-corr3-v2.pdf>
- **Page du jeu de données** : <https://www.data.gouv.fr/datasets/statistique-mensuelle-de-la-population-ecrouee-et-detenue-en-france>
- **Licence** : Licence Ouverte 1.0 (fr-lo)
- **Téléchargé le** : 2026-11-15
- **Taille** : 1 537 815 octets
- **SHA-256** : `baae832d7a8f59a009e57a433fd92d367b4d49af6204c6a3c7721987ed72d1ee`

## `sources/securite/statistique-etablissements-personnes-ecroues-en-france-01012022-ok.pdf`

- **Contenu** : Situation au 1er janvier 2022 : tableau 6 (capacité opérationnelle, personnes écrouées détenues, densité carcérale) et chiffres clés (PDF, pages 7 et 8) ; indicateurs `detenus` et `densite-carcerale`.
- **Jeu de données** : Statistique mensuelle de la population écrouée et détenue en France
- **Producteur** : Ministère de la Justice, administration pénitentiaire (DAP-SSER)
- **Adresse du fichier** : <https://static.data.gouv.fr/resources/statistique-mensuelle-de-la-population-ecrouee-et-detenue-en-france/20261011-154800/statistique-etablissements-personnes-ecroues-en-france-01012022-ok.pdf>
- **Page du jeu de données** : <https://www.data.gouv.fr/datasets/statistique-mensuelle-de-la-population-ecrouee-et-detenue-en-france>
- **Licence** : Licence Ouverte 1.0 (fr-lo)
- **Téléchargé le** : 2026-11-15
- **Taille** : 4 747 900 octets
- **SHA-256** : `0ee99dd31fb19287b773836d55fbab75ea6d4c31ed2212bf69665bc3e70926fe`

## `sources/securite/statistique-etablissements-20230101.xlsx`

- **Contenu** : Situation au 1er janvier 2023 : tableau 6 (capacité opérationnelle, personnes écrouées détenues, densité carcérale) et chiffres clés ; indicateurs `detenus` et `densite-carcerale`.
- **Jeu de données** : Statistique mensuelle de la population écrouée et détenue en France
- **Producteur** : Ministère de la Justice, administration pénitentiaire (DAP-SSER)
- **Adresse du fichier** : <https://static.data.gouv.fr/resources/statistique-mensuelle-de-la-population-ecrouee-et-detenue-en-france/20261011-155346/statistique-etablissements-20230101.xlsx>
- **Page du jeu de données** : <https://www.data.gouv.fr/datasets/statistique-mensuelle-de-la-population-ecrouee-et-detenue-en-france>
- **Licence** : Licence Ouverte 1.0 (fr-lo)
- **Téléchargé le** : 2026-11-15
- **Taille** : 1 240 332 octets
- **SHA-256** : `afda268e30090a2df8d5ddeb8b8e50bc4ba3e4f8a0057418f5a6dbba78dacbd8`

## `sources/securite/statistiques-etablissements-20240101.xlsx`

- **Contenu** : Situation au 1er janvier 2024 : tableau 6 (capacité opérationnelle, personnes écrouées détenues, densité carcérale) et chiffres clés ; indicateurs `detenus` et `densite-carcerale`.
- **Jeu de données** : Statistique mensuelle de la population écrouée et détenue en France
- **Producteur** : Ministère de la Justice, administration pénitentiaire (DAP-SSER)
- **Adresse du fichier** : <https://static.data.gouv.fr/resources/statistique-mensuelle-de-la-population-ecrouee-et-detenue-en-france/20261011-160116/statistiques-etablissements-20240101.xlsx>
- **Page du jeu de données** : <https://www.data.gouv.fr/datasets/statistique-mensuelle-de-la-population-ecrouee-et-detenue-en-france>
- **Licence** : Licence Ouverte 1.0 (fr-lo)
- **Téléchargé le** : 2026-11-15
- **Taille** : 1 278 424 octets
- **SHA-256** : `2539545ae433740fcb4ee46e755cc96d2fc03c5e3afc42a427eec87fe1953872`

## `sources/securite/statistique-etablissements-personnes-ecrouees-01012025.xlsx`

- **Contenu** : Situation au 1er janvier 2025 : tableau 6 (capacité opérationnelle, personnes écrouées détenues, densité carcérale) et chiffres clés ; indicateurs `detenus` et `densite-carcerale`.
- **Jeu de données** : Statistique mensuelle de la population écrouée et détenue en France
- **Producteur** : Ministère de la Justice, administration pénitentiaire (DAP-SSER)
- **Adresse du fichier** : <https://static.data.gouv.fr/resources/statistique-mensuelle-de-la-population-ecrouee-et-detenue-en-france/20261011-160647/statistique-etablissements-personnes-ecrouees-01012025.xlsx>
- **Page du jeu de données** : <https://www.data.gouv.fr/datasets/statistique-mensuelle-de-la-population-ecrouee-et-detenue-en-france>
- **Licence** : Licence Ouverte 1.0 (fr-lo)
- **Téléchargé le** : 2026-11-15
- **Taille** : 1 080 218 octets
- **SHA-256** : `498ad669d99c7a3659b94dfb53e5aa6a6d51a8c456c7ad54592e92cd268d11a0`

## `sources/securite/statistique-etablissements-01012026.xlsx`

- **Contenu** : Situation au 1er janvier 2026 : tableau 6 (capacité opérationnelle, personnes écrouées détenues, densité carcérale) et chiffres clés (prévenus, densité des maisons d'arrêt 165,3 %) ; indicateurs `detenus` et `densite-carcerale`.
- **Jeu de données** : Statistique mensuelle de la population écrouée et détenue en France
- **Producteur** : Ministère de la Justice, administration pénitentiaire (DAP-SSER)
- **Adresse du fichier** : <https://static.data.gouv.fr/resources/statistique-mensuelle-de-la-population-ecrouee-et-detenue-en-france/20261013-161712/statistique-etablissements-01012026.xlsx>
- **Page du jeu de données** : <https://www.data.gouv.fr/datasets/statistique-mensuelle-de-la-population-ecrouee-et-detenue-en-france>
- **Licence** : Licence Ouverte 1.0 (fr-lo)
- **Téléchargé le** : 2026-11-15
- **Taille** : 1 075 253 octets
- **SHA-256** : `62e5c6ae3fd63004262bfbc0c9071f22ba8b719808241b2e0a7cc90ba79c53fd`

## `sources/securite/statistique-etablissements-01092026.xlsx`

- **Contenu** : Situation au 1er septembre 2026 : tableau 6 (capacité opérationnelle, personnes écrouées détenues, densité carcérale) et chiffres clés (90 020 détenus, 63 348 places, densité 142,1 %, 8 347 matelas au sol), cités dans les textes ; indicateurs `detenus` et `densite-carcerale`.
- **Jeu de données** : Statistique mensuelle de la population écrouée et détenue en France
- **Producteur** : Ministère de la Justice, administration pénitentiaire (DAP-SSER)
- **Adresse du fichier** : <https://static.data.gouv.fr/resources/statistique-mensuelle-de-la-population-ecrouee-et-detenue-en-france/20261013-162028/statistique-etablissements-01092026.xlsx>
- **Page du jeu de données** : <https://www.data.gouv.fr/datasets/statistique-mensuelle-de-la-population-ecrouee-et-detenue-en-france>
- **Licence** : Licence Ouverte 1.0 (fr-lo)
- **Téléchargé le** : 2026-11-15
- **Taille** : 1 061 779 octets
- **SHA-256** : `c7f92c3688cc60a81751623da12c04f48f66b29bcc692595c2d069ccfead1ae7`

## `sources/securite/Chiffres_cles_Justice_2026.pdf`

- **Contenu** : Les chiffres clés de la Justice, édition 2026 (données 2025) : taux de réponse pénale 87,8 %, 4 240 265 affaires traitées par les parquets dont 2 527 313 sans mis en cause ; cités dans les idées reçues.
- **Jeu de données** : Les chiffres clés de la Justice 2026
- **Producteur** : Ministère de la Justice, SG, SSER (ex-SDSE)
- **Adresse du fichier** : <https://www.justice.gouv.fr/sites/default/files/2026-10/Chiffres_cles_Justice_2026.pdf>
- **Page du jeu de données** : <https://www.justice.gouv.fr/documentation/etudes-et-statistiques>
- **Licence** : Non précisée (publication du ministère de la Justice)
- **Téléchargé le** : 2026-11-15
- **Taille** : 2 484 318 octets
- **SHA-256** : `d7b1c0c3483f7a231026129a61ea41e9ae5876a3379c4076cf2fc447c489dcc2`

## `sources/securite/Chiffres_Cles_2025_corrV2.pdf`

- **Contenu** : Les chiffres clés de la Justice, édition 2025 corrigée (données 2024) : taux de réponse pénale 86,5 % ; contrôle, non repris dans les séries.
- **Jeu de données** : Les chiffres clés de la Justice 2025
- **Producteur** : Ministère de la Justice, SG, SSER (ex-SDSE)
- **Adresse du fichier** : <https://www.justice.gouv.fr/sites/default/files/2026-03/Chiffres_Cles_2025_corrV2.pdf>
- **Page du jeu de données** : <https://www.justice.gouv.fr/documentation/etudes-et-statistiques/chiffres-cles-justice-2025>
- **Licence** : Non précisée (publication du ministère de la Justice)
- **Téléchargé le** : 2026-11-15
- **Taille** : 2 350 479 octets
- **SHA-256** : `1ed771cfa5825cb4406f0c1b8b9980aff3fe6e0b303e159717072a22e5f38029`

## `sources/securite/crim_off_cat-homicides-taux.json`

- **Contenu** : Homicides intentionnels (ICCS0101) pour 100 000 habitants, France, Allemagne, Italie, Espagne, 2015 à 2024 (comparaison `homicides-europe`). Aucune valeur pour l'Union européenne.
- **Jeu de données** : Infractions enregistrées par la police par type d'infraction (crim_off_cat), mise à jour du 29 avril 2026
- **Producteur** : Eurostat
- **Adresse du fichier** : <https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/crim_off_cat?format=JSON&lang=fr&iccs=ICCS0101&unit=P_HTHAB&geo=FR&geo=DE&geo=IT&geo=ES&geo=EU27_2020&sinceTimePeriod=2015>
- **Page du jeu de données** : <https://ec.europa.eu/eurostat/databrowser/view/crim_off_cat/default/table>
- **Licence** : Politique de diffusion d'Eurostat (réutilisation libre avec mention de la source, CC BY 4.0)
- **Téléchargé le** : 2026-11-15
- **Taille** : 3 332 octets
- **SHA-256** : `01f26d12897700e15b3f0be9220917fdf42b42d903441b949ab9ad33ba4a5ae4`

## `sources/securite/crim_off_cat-homicides-nombre.json`

- **Contenu** : Nombre d'homicides intentionnels, mêmes pays, 2022 à 2024 (France : 882 en 2024), pour la note de définition.
- **Jeu de données** : Infractions enregistrées par la police par type d'infraction (crim_off_cat)
- **Producteur** : Eurostat
- **Adresse du fichier** : <https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/crim_off_cat?format=JSON&lang=fr&iccs=ICCS0101&unit=NR&geo=FR&geo=DE&geo=IT&geo=ES&sinceTimePeriod=2022>
- **Page du jeu de données** : <https://ec.europa.eu/eurostat/databrowser/view/crim_off_cat/default/table>
- **Licence** : Politique de diffusion d'Eurostat (réutilisation libre avec mention de la source, CC BY 4.0)
- **Téléchargé le** : 2026-11-15
- **Taille** : 2 838 octets
- **SHA-256** : `ee63aff22fb88018b55427aecb0d94d85b282625cd6170104e38af74aa523baa`

## `sources/securite/crim_pris_cap.json`

- **Contenu** : Capacité officielle des prisons et nombre réel de détenus, en nombre et pour 100 000 habitants, 2018 à 2024 (comparaison `detenus-europe`).
- **Jeu de données** : Capacité des prisons et nombre de personnes détenues (crim_pris_cap)
- **Producteur** : Eurostat
- **Adresse du fichier** : <https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/crim_pris_cap?format=JSON&lang=fr&geo=FR&geo=DE&geo=IT&geo=ES&geo=EU27_2020&sinceTimePeriod=2018>
- **Page du jeu de données** : <https://ec.europa.eu/eurostat/databrowser/view/crim_pris_cap/default/table>
- **Licence** : Politique de diffusion d'Eurostat (réutilisation libre avec mention de la source, CC BY 4.0)
- **Téléchargé le** : 2026-11-15
- **Taille** : 4 287 octets
- **SHA-256** : `d964df30d5fc943ca0ff3025e928392148d6eead86cc202df08c456f9398c409`

## `sources/securite/crim_just_job-juges-policiers.json`

- **Contenu** : Juges professionnels et agents de police pour 100 000 habitants, 2018 à 2024 (comparaison `juges-europe` ; les agents de police ne sont pas repris, la série française s'arrêtant en 2022).
- **Jeu de données** : Personnel dans le système de justice pénale par sexe (crim_just_job)
- **Producteur** : Eurostat
- **Adresse du fichier** : <https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/crim_just_job?format=JSON&lang=fr&isco08=OC2612A&isco08=OC5412&sex=T&unit=P_HTHAB&geo=FR&geo=DE&geo=IT&geo=ES&geo=EU27_2020&sinceTimePeriod=2018>
- **Page du jeu de données** : <https://ec.europa.eu/eurostat/databrowser/view/crim_just_job/default/table>
- **Licence** : Politique de diffusion d'Eurostat (réutilisation libre avec mention de la source, CC BY 4.0)
- **Téléchargé le** : 2026-11-15
- **Taille** : 3 521 octets
- **SHA-256** : `e68c1c56b86c15a717c330713bc4b28d6dce2eb24a7019ba807093dbbe286293`

## Sources consultées, non conservées

### Performance de l'État (fichiers déjà présents dans le dépôt)

- **Contenu** : indicateurs des rapports annuels de performance des missions Justice et Sécurités (bloc `performance` et indicateur `delai-justice-civile`).
- **Fichiers** : `budget/sources/performance/RAP2025-Performance.csv` et `budget/sources/performance/Performance-execution-cible-2022-2024.csv`, décrits dans `budget/sources/SOURCES.md`.
- **Remarque** : quand les deux fichiers donnent une valeur différente pour la même année (révision), la valeur du RAP 2025, plus récente, est retenue : affaires pénales terminées en moins de douze mois 2024 (78,8 contre 79,9), mise à exécution des peines 2023 (88,1 contre 88,0), cellule individuelle 2023 et 2024 (39 et 37 contre 38,9 et 37,17), élucidation des cambriolages par la gendarmerie 2024 (9,3 contre 9,32).

### Enquête Vécu et ressenti en matière de sécurité (VRS), rapport d'enquête édition 2025

- **Contenu** : page de présentation et infographies (texte de transcription) du rapport publié le 29 octobre 2026 : taux de plainte par atteinte (cambriolage avec effraction 67 %, violences physiques 21 %, violences sexuelles 4 %), évolution du sentiment d'insécurité dans le quartier (+14 % entre 2022 et 2023, +8 % entre 2023 et 2024, +5 % entre 2024 et 2025), 2,9 millions de débits frauduleux en 2024. Ces chiffres sont cités dans les textes ; aucune série n'en est tirée.
- **Producteur** : SSMSI (ministère de l'Intérieur)
- **Adresse de la page** : <https://statistiques.interieur.gouv.fr/ssmsi/publications/vecu-et-ressenti-en-matiere-de-securite-victimation-delinquance-et-sentiment-0>
- **Fichiers non téléchargés** : le PDF (<https://statistiques.interieur.gouv.fr/ssmsi/files/ssmsi/2026-11/SSMSI%20-%20VRS-2026.pdf>) et les données (<https://statistiques.interieur.gouv.fr/ssmsi/files/ssmsi/2026-10/Donn%C3%A9es_de_la_publication.zip>) renvoient une erreur 403 aux téléchargements automatiques ; les niveaux (en %) du sentiment d'insécurité VRS n'ont donc pas pu être lus.
- **Consulté le** : 2026-11-15
