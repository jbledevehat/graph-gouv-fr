# Les acteurs publics

Page [`/acteurs/`](https://gouvfr.jbledevehat.fr/acteurs/) : qui fait le service public ? Un
organigramme qui se lit de haut en bas, sur un mur zoomable, rangé comme l'argent public sur la
page budget :

1. **Administration**, avec les couleurs de la page budget : l'État (bleu), la sécurité sociale
   (violet), les collectivités locales (jaune), les opérateurs de l'État (vert), et en gris les
   partenaires hors administrations publiques (associations, chambres et ordres professionnels,
   Banque de France, Caisse des dépôts) ;
2. **Fonction** (nomenclature COFOG, comme la page budget), avec la dépense de l'administration
   pour cette fonction (Insee, tableau 3.307) ;
3. **Organisation** : un type d'organisme de l'[Annuaire de l'administration](https://lannuaire.service-public.gouv.fr/themes)
   (les agences régionales de santé), pas chacune de ses implantations, avec un résumé de sa mission ;
4. **Services rattachés**, pour les ministères, les institutions et juridictions et les autorités
   indépendantes : directions, sous-directions, bureaux…, d'après les « services fils » de l'annuaire
   (près de 8 000 services, sur six niveaux).

Au départ, seuls les blocs du premier niveau sont affichés : la pastille « + » sous un bloc ouvre
ce qu'il contient, « − » le referme, et deux boutons ouvrent ou ferment tout. Un clic sur un bloc
l'ouvre aussi et affiche sa fiche. Un autre bouton inverse les deux premiers niveaux (par
fonction, puis par administration). Administrations et fonctions gardent l'ordre de la page budget ; organisations et services sont
rangés par ordre alphabétique. Des cases à cocher, comme sur la page budget, masquent des
administrations ou des fonctions ; les montants des blocs ne comptent alors que ce qui reste affiché.

## Fichiers

| Fichier | Contenu |
|---|---|
| `index.html` | La page : un mur plein écran, déplacé et zoomé comme la carte des sites ; les blocs du premier niveau en colonnes côte à côte, puis à chaque niveau une grille compacte (4 colonnes au plus) où le contenu d'un bloc ouvert s'insère dans un bandeau sous sa rangée, pour que l'arbre ne s'étale pas en largeur ; tous les encarts d'un même niveau ont la même taille ; un clic sur un encart l'ouvre, zoome dessus et affiche sa fiche (le bandeau est inséré à la construction du site) |
| `scripts/annuaire.mjs` | Lit les thèmes, les types d'organismes, le nombre de fiches et les textes de mission de l'annuaire (site et API) |
| `sources/annuaire.json` | Résultat brut, textes officiels non retouchés |
| `scripts/hierarchie.mjs` | Suit, dans l'API de l'annuaire, les « services fils » de chaque fiche nationale, niveau par niveau |
| `sources/hierarchie.json` | Résultat brut : chaque service (nom, sigle, type, lien) et ses services fils |
| `config/resumes.json` | Pour chaque organisation : nom usuel, sigle, nature (`famille`), `administration` (`etat`, `secu`, `coll`, `op`, `hors`) et `fonction` (code COFOG `GF01` à `GF10`) selon les règles de la comptabilité nationale, résumé, et `source` (`annuaire` si le résumé s'appuie sur le texte de l'annuaire, `redaction` sinon) |
| `config/argent-public.json` | Pour chaque organisation, les lignes d'argent public qui la financent : programme (`P156`) ou action (`P308/02`) du budget de l'État, ou tous les programmes d'un ministère ; catégorie de collectivités (`ofgl`) ou fonction départementale (`ofgl_fonctions`) ; fonction des balances DGFiP (`balances`) ; montant tiré d'un rapport officiel (`montant`, `source`, `url`) ; ou une `note` quand il n'y a pas d'argent public propre. Écrit à la main |
| `scripts/ofgl.mjs` | Lit sur le portail de l'OFGL les dépenses d'une année des collectivités (communes, départements, régions, intercommunalités, SDIS, CCAS, MDPH) et des départements par fonction |
| `sources/ofgl-AAAA.json` | Résultat brut, en euros |
| `scripts/construire.mjs` | Assemble `donnees/acteurs.json`, avec les dépenses par administration et par fonction de la page budget (`budget/donnees/argent-public-AAAA.json`, dernière année Insee) ; s'arrête si une organisation n'a pas de résumé ou de classement, ou si un résumé ne correspond plus à rien |
| `donnees/acteurs.json` | Données de la page, publiées à côté |
| `donnees/services.json` | Services rattachés, sous forme compacte (un service par ligne, ses fils désignés par leur numéro) ; la page en crée les encarts à l'ouverture |

## Mise à jour

```bash
node acteurs/scripts/annuaire.mjs
node acteurs/scripts/hierarchie.mjs
node acteurs/scripts/ofgl.mjs 2024
node acteurs/scripts/construire.mjs
```

Si l'annuaire ajoute un type d'organisme, `construire.mjs` le signale : ajouter son résumé dans
`config/resumes.json`. Le texte de mission de l'annuaire n'est montré dans la fiche que s'il a
servi au résumé : certaines fiches reprennent par erreur le texte d'une autre structure.

## Classement

Règles de la comptabilité nationale : les hôpitaux publics (CHU, Samu, centres de
pharmacovigilance) relèvent de la sécurité sociale ; les autorités publiques indépendantes dotées
de la personnalité morale (AMF, HAS, Arcom, AFLD, ANJ, ART, ASNR, H2A, Hcéres, Médiateur national
de l'énergie) des opérateurs ; la Banque de France et la Caisse des dépôts ne sont pas des
administrations publiques. Chaque organisation n'a qu'une fonction, la principale ; la recherche
fondamentale (CNRS) est dans les services généraux, comme dans la COFOG.

## Argent public

Chaque organisation reçoit un montant d'argent public de l'année des dépenses Insee, avec sa source :

- **État** : programmes du budget général (`budget/donnees/budget-etat-AAAA.json` et
  `detail-etat-AAAA.json`) ; un programme compte pour sa dépense exécutée, une action pour le montant
  prévu par la loi de finances (l'exécution n'est publiée que par programme) ; un ministère reçoit
  tous ses programmes, hors pouvoirs publics.
- **Collectivités** : dépenses totales hors remboursements d'emprunts, budgets principaux (OFGL),
  par catégorie ou, pour les départements, par fonction (PMI, autonomie, archives…).
- **Sécurité sociale, opérateurs, partenaires** : montants des rapports officiels, avec leur adresse.

Un montant couvre tout le réseau (toutes les Caf, toutes les mairies). Quand plusieurs
organisations se partagent le même argent (programme 156 pour les impôts, 176 pour la police…), il
est marqué « partagé » et la fiche liste les autres. Les montants ne s'additionnent pas : celui d'un
ministère comprend ceux de ses services. Les organisations sans argent public propre (ordres
professionnels financés par leurs membres, Banque de France…) ont une explication à la place.

## À venir

- **Vue en rectangles** à l'échelle des montants (bascule avec le mur).
- **Effectifs** de chaque organisation : emplois des opérateurs (annexe « jaune » du PLF),
  plafonds d'emplois des ministères, fonction publique territoriale et hospitalière (Insee,
  Siasp), organismes de sécurité sociale (Ucanss).
- **Détail des réseaux locaux** (ARS, Caf, préfectures…) : implantations et organisation interne.
