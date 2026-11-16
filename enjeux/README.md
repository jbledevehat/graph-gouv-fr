# Tableaux de bord thématiques

Cinq tableaux de bord de [gouvfr.jbledevehat.fr](https://gouvfr.jbledevehat.fr/) sur les besoins des
Français, construits sur le même modèle, pour que élus, candidats, journalistes et citoyens partent
des mêmes chiffres. Chacun est une section du site, comme les autres tableaux de bord ; l'école est
une page de la section « Éducation et jeunesse », à côté du moral des jeunes (`jeunes/`).

| Adresse | Sujet | Données |
|---|---|---|
| `/pouvoir-achat/` | Pouvoir d'achat, travail et logement | `donnees/pouvoir-achat.json` |
| `/sante/` | Accès aux soins | `donnees/sante.json` |
| `/securite/` | Sécurité et justice | `donnees/securite.json` |
| `/jeunes/ecole.html` | L'école et l'insertion des jeunes | `donnees/ecole.json` |
| `/ecologie/` | Transition écologique et énergie | `donnees/ecologie.json` |

Les cinq pages sont produites à partir d'un seul gabarit, `tableau.html`, qui lit le fichier de
données de son sujet ; leurs adresses sont fixées dans `ADRESSES` (`commun.js`). La carte de chaque
tableau sur l'accueil est écrite à la construction (`porteAccueil`), au format des autres cartes. L'argent public consacré à chaque sujet n'est pas recopié : il est recalculé
dans la page à partir des comptes de l'Insee de la section budget (`budget/donnees/argent-public-AAAA.json`),
selon les codes de fonction indiqués dans le fichier du sujet.

Proposition indépendante construite à partir de documents publics ; ce n'est pas un outil officiel.

## Règles de saisie

- **Chaque chiffre vient d'une source officielle** (Insee, services statistiques ministériels,
  Drees, SSMSI, SDSE, Depp, SDES, Citepa, RTE, Assurance maladie, Eurostat, OCDE, Direction du
  budget…), lue dans le fichier ou la publication d'origine. Aucun chiffre de mémoire, aucun chiffre
  repris d'un article de presse ou d'un site non officiel.
- **Recopié, pas recalculé**, sauf mention explicite dans `calcul` (par exemple un passage en euros
  constants), avec la formule.
- **Un changement de méthode est signalé** (`ruptures`, avec ce qui a changé) : trait pointillé sur le
  graphique, courbe en pointillés à cet endroit, note sous le graphique, et évolution calculée après.
- **Le provisoire est marqué** (`provisoire` : liste des années).
- Les fichiers téléchargés de moins de 5 Mo sont gardés dans `sources/<sujet>/` ; tous sont décrits
  dans `sources/SOURCES-<sujet>.md` (adresse, producteur, licence, date, taille, SHA-256).

## Format d'un fichier de sujet (`donnees/<id>.json`)

```jsonc
{
  "id": "sante",
  "ordre": 2,
  "titre": "Accès aux soins",
  "eyebrow": "Santé",
  "besoin": "Puis-je voir un médecin à temps, près de chez moi ?",   // la question des Français
  "resume": "Deux ou trois phrases : ce que montre le tableau de bord, sans parti pris.",
  "presentation": "Une phrase : ce que contient le tableau de bord (carte de l'accueil).",
  "mise_a_jour": "2026-11-15",
  "couleur": "#2A78D6",                      // fixée par le gabarit, ne pas changer

  // Les trois indicateurs mis en avant sur la carte de l'accueil.
  "cles": ["sans-medecin-traitant", "…", "…"],

  // L'essentiel : 4 à 6 constats, chacun appuyé sur un indicateur de la page.
  "essentiel": [ { "titre": "Phrase courte", "texte": "Deux ou trois phrases chiffrées, sourcées.", "indicateur": "id-indicateur" } ],

  // Indicateurs : 6 à 9, ceux qui comptent le plus dans la vie des gens.
  "indicateurs": [
    {
      "id": "sans-medecin-traitant",
      "libelle": "Patients sans médecin traitant",
      "libelle_court": "facultatif : texte sous le chiffre de la carte de l'accueil",
      "question": "Combien de Français n'ont pas de médecin traitant ?",
      "unite": "%",                       // %, €, ans, jours, ‰, « pour 100 000 habitants », « Mt CO2e »…
      "decimales": 1,
      "sens": "baisse",                   // ce qui est souhaitable : « baisse », « hausse » ou « neutre »
      "evolution": "absolue",             // facultatif : « absolue » (points, années), « relative » (%) ou « aucune »
                                          // (taux de croissance) ; par défaut, absolue pour %, ans, points, jours, mois
      "axe_zero": false,                  // facultatif : axe resserré ; par défaut, seulement pour « ans » et « points »
      "definition": "Ce qui est compté exactement, le champ (France entière / métropole, âge…).",
      "piege": "Ce que l'indicateur ne dit pas, et la mauvaise lecture la plus fréquente.",
      "annees": [2015, 2016, 2017],
      "series": [
        { "id": "ensemble", "nom": "Ensemble", "valeurs": [11.2, null, 11.5] }
        // séries supplémentaires possibles (femmes/hommes, territoires…), 3 au plus
      ],
      "provisoire": [2025],
      "ruptures": [ { "annee": 2021, "texte": "Changement de questionnaire : 2021 ne se compare pas à 2020." } ],
      "objectif": { "annee": 2030, "valeur": 5, "libelle": "Objectif de la loi X", "source": "Titre et lien" },  // facultatif
      "calcul": "Facultatif : formule si le chiffre est recalculé.",
      "source": {
        "titre": "Titre exact de la publication ou du jeu de données",
        "producteur": "Drees",
        "url": "https://…",               // adresse exacte du fichier ou de la page
        "consulte_le": "2026-11-15",
        "fichier": "sources/sante/xxx.csv" // facultatif : copie gardée dans le dépôt
      }
    }
  ],

  // Comparaisons européennes : 1 à 3, même définition pour tous les pays (Eurostat, OCDE).
  "comparaisons": [
    {
      "id": "…", "libelle": "…", "unite": "%", "decimales": 1, "annee": 2024, "sens": "baisse",
      "definition": "…",
      "pays": [ { "nom": "France", "valeur": 7.4 }, { "nom": "Allemagne", "valeur": 3.4 }, { "nom": "Union européenne", "valeur": 5.9 } ],
      "source": { "titre": "…", "producteur": "Eurostat", "url": "…", "consulte_le": "…" }
    }
  ],

  // Performance de l'État : objectifs et résultats des rapports annuels de performance (RAP), lus
  // dans budget/sources/performance/ (2022 à 2025). 3 à 6 indicateurs parlants pour un citoyen.
  "performance": [
    { "mission": "Justice", "programme": "Justice judiciaire", "indicateur": "Délai moyen de traitement…",
      "sous_indicateur": "…", "unite": "mois", "annees": [2022, 2023, 2024, 2025],
      "realise": [ … ], "cible": [ … ], "sens": "baisse", "fichier": "RAP2025-Performance.csv" }
  ],

  // Argent public consacré au sujet : recalculé par la page (comptes de l'Insee, 2015 à 2024).
  "moyens": {
    "codes": ["GF07"],                    // fonctions (GF07) ou sous-fonctions (GF0403) de la nomenclature COFOG
    "texte": "Ce que recouvre ce périmètre, et ce qu'il laisse de côté."
  },

  // Idées reçues : 4 à 6 affirmations qui circulent, et ce que disent les chiffres. Ton neutre,
  // jamais de nom de personne ou de parti.
  "idees_recues": [
    { "affirmation": "« … »", "reponse": "Ce que disent les chiffres, en 2 à 4 phrases.", "indicateur": "id-indicateur" }
  ],

  // Questions à poser aux candidats : 3 à 5, factuelles, rattachées aux indicateurs.
  "questions_candidats": [ "Quel niveau visez-vous pour … en 2032, et avec quels moyens ?" ]
}
```
