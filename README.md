# Carte des sites web publics de l'État

**[gouvfr.jbledevehat.fr](https://gouvfr.jbledevehat.fr)** : les sites de l'État, rangés par
ministère selon l'[Annuaire de l'administration](https://lannuaire.service-public.gouv.fr).

Ce dépôt met à jour la carte réalisée en 2019 sous Kumu
([V1](https://kumu.io/jbledevehat/sites-web-gouvfr#liste-des-sites-web-en-gouvfr-v1)) : il vérifie
chaque site, ajoute les sites publics manquants, les rattache à leur administration et à leur
ministère, puis publie la carte et la liste des sites.

> **Source des données** : la liste des sites part de la
> [liste des noms de domaine des organismes publics](https://gitlab.adullact.net/dinum/noms-de-domaine-organismes-secteur-public) tenue par la
> **DINUM** (Direction interministérielle du numérique), complétée par l'Annuaire de
> l'administration, la liste des opérateurs de l'État, l'Observatoire des démarches en ligne et
> les journaux de certificats (détail dans [Sources](#sources)).

## Données

La liste des sites (sites, sous-domaines et sites archivés), mise à jour avec la carte :

- [`donnees/sites.csv`](donnees/sites.csv) (séparateur virgule, UTF-8) ;
- [`donnees/sites.json`](donnees/sites.json) (tableau d'objets, un par ligne) ;
- également téléchargeables depuis la carte : [sites.csv](https://gouvfr.jbledevehat.fr/sites.csv),
  [sites.json](https://gouvfr.jbledevehat.fr/sites.json).

| Champ | Contenu |
|---|---|
| `url` | Adresse du site |
| `domaine` | Domaine, sans `www.` |
| `type` | `site`, `sous-domaine` ou `archivé` |
| `statut` | `En ligne`, `Redirigé`, `Hors ligne` ou `Indéterminé` (dernière vérification) |
| `code_http`, `url_finale`, `verifie_le` | Résultat de la vérification HTTP |
| `site_parent` | Domaine du site dont il est un sous-domaine |
| `organisme` | Administration qui porte le site |
| `pole` | Ministère (ou Présidence, Premier ministre, Autorités indépendantes, Institutions et juridictions) ; vide si inconnu |
| `rattachement` | Règle qui a donné l'organisme ou le ministère (voir [Rattachements](#rattachements)) |
| `demarches_essentielles` | Démarches de l'[Observatoire](https://observatoire.numerique.gouv.fr/observatoire) proposées sur ce site |
| `anciennes_adresses` | Adresses fusionnées avec ce site (elles y redirigent) |
| `source` | Origine : carte V1 (2019), Annuaire de l'administration, DINUM, crt.sh, Observatoire |

La carte existe aussi en **PDF vectoriel** ([carte.pdf](https://gouvfr.jbledevehat.fr/carte.pdf),
bouton de téléchargement sur la carte) : même placement, tous les noms affichés, y compris ceux
des sous-domaines (lisibles en zoomant), texte cherchable.

Dans le CSV, les listes sont séparées par ` ; `. Le graphe complet (administrations, liens,
positions) est écrit dans `out/sites-gouv-fr-v2.gexf` à chaque construction, à ouvrir dans
[Gephi](https://gephi.org) ou [Gephi Lite](https://gephi.org/gephi-lite/).

## Utilisation

Node.js 22 ou plus, puis `npm install`.

```bash
npm run update
```

enchaîne toutes les étapes, qui peuvent aussi être lancées séparément :

| Commande | Rôle | Résultat |
|---|---|---|
| `npm run fetch:sources` | Télécharge les sources publiques (voir [Sources](#sources)) | `donnees/sources/` (non versionné) |
| `npm run fetch:hierarchie` | Lit le fil d'Ariane de chaque fiche nationale de l'annuaire, une page par seconde, relue tous les 90 jours | `donnees/annuaire/hierarchie.json` |
| `npm run fetch:subdomains` | Sous-domaines des domaines hors gouv.fr, lus dans les journaux de certificats ([crt.sh](https://crt.sh)), cache de 30 jours | `donnees/sources/crtsh.json` (non versionné) |
| `npm run check` | Vérifie en HTTP chaque site de la V1 et chaque candidat | `donnees/checks/latest.json` |
| `npm run build` | Construit la carte, la liste des sites et le rapport | `donnees/sites.*`, `out/` |
| `npm run fetch:marques` | Lit le bloc-marque des sites restés sans ministère (relancer `build` ensuite) | `donnees/checks/marques.json` |

Options de `check` : `--only=map` (sites de la V1), `candidates`, `new` (candidats jamais
vérifiés), `unknown` (restés indéterminés), `roots` (sites principaux indéterminés ou hors
ligne), `refused` (connexions refusées), `principaux` (relecture des sites principaux en
ligne, pour repérer ceux devenus vides ; un résultat non concluant ne remplace pas le
précédent) ; `--limit=N` pour un essai. Les autres résultats sont repris de la vérification
précédente.

`out/rapport.md` résume chaque construction : changements depuis la V1, nouveaux sites, sites
sans rattachement, avertissements.

Pour voir la carte en local : `python3 -m http.server 8765 --directory out/web`.

## Sources

- **Carte V1 (2019)** : instantané versionné dans `donnees/v1-2019/`.
- **[Annuaire de l'administration](https://lannuaire.service-public.gouv.fr)**
  ([API](https://api-lannuaire.service-public.fr)) : services nationaux (catégorie `SI`) et
  leurs sites, hors ordres professionnels, associations, ambassades, collectivités…
  (`sources.annuaire.excludeTypes`) ; hiérarchie lue sur le site (fil d'Ariane).
- **[Noms de domaine des organismes publics](https://gitlab.adullact.net/dinum/noms-de-domaine-organismes-secteur-public)**
  (DINUM). Si le fichier brut est remplacé par une page anti-robot, le dépôt est cloné avec git ;
  à défaut, la liste précédente est gardée. Le serveur est injoignable depuis GitHub Actions :
  les nouveaux domaines DINUM s'ajoutent lors d'une mise à jour locale.
- **[Opérateurs de l'État](https://www.data.gouv.fr/datasets/projet-de-loi-de-finances-pour-2026-plf-2026-jaune-operateurs-de-letat-liste-des-operateurs-et-categories)**
  (annexe « jaune » du PLF ; URL à changer à chaque nouveau PLF).
- **[Démarches essentielles](https://observatoire.numerique.gouv.fr/observatoire)** de
  l'Observatoire de la qualité des démarches en ligne.
- **Journaux de certificats** ([crt.sh](https://crt.sh)) et **départements et régions**
  ([geo.api.gouv.fr](https://geo.api.gouv.fr)).

## Règles

### Vérification HTTP

| Résultat | Effet sur un site de la V1 |
|---|---|
| En ligne (2xx/3xx, ou 401/403) | Reste actif ; un site archivé revenu en ligne redevient actif |
| Redirigé vers un autre site | Archivé ; si le site d'arrivée est sur la carte, l'adresse devient l'une de ses anciennes adresses |
| Hors ligne (domaine inexistant, page parquée, 404/410) | Archivé |
| Indéterminé (limitation de débit, délai dépassé, 5xx…) | Inchangé, listé dans le rapport |

Chaque URL est essayée en http, en https, puis avec `www.`, et les échecs sont réessayés plus
lentement. Un certificat TLS mal configuré n'empêche pas un site d'être en ligne. Les
redirections sont suivies une à une, en restant en https si un serveur renvoie vers http. Une
connexion refusée seule laisse le site « indéterminé ». Les requêtes vers une même adresse IP
sont espacées (`perIp`, `perIpGapMs`) : la plateforme des préfectures bannit les clients trop
rapides ; relancer plus tard `check --only=unknown`.

### Nouveaux sites

Un candidat est ajouté s'il répond et ne ressemble pas à un nom technique (`api.`, `recette`,
`solr`…, `candidates.excludePatterns` ; `xxxdev` ou `xxxval` seulement si `xxx` existe) :

- sites déclarés dans l'annuaire, quel que soit le domaine (`ademe.fr`, `insee.fr`…) ;
- domaines `*.gouv.fr` de la liste DINUM, et domaines de l'État qu'elle type (ambassades,
  académies, universités…, `candidates.dinumTypes`) ;
- **sous-domaines** d'un site de la carte, d'après la liste DINUM et les journaux de certificats
  (filtrés par le DNS). Un sous-domaine qui redirige, ou en erreur 500, 502 ou 503, n'est pas
  ajouté ;
- adresses des **démarches essentielles**. Source sûre : elles échappent aux filtres de noms,
  gardent leur adresse même si elles mènent à une page de connexion, et sont ajoutées même
  quand elles bloquent nos vérifications (URSSAF) ; seules celles absentes du DNS sont écartées.

Les sites d'organisations internationales sont exclus (`candidates.excludeDomains`).

Les **outils liés à la sécurité** ne figurent pas sur la carte, pour ne pas indiquer de cible :
gestionnaires de mots de passe (Vaultwarden, Bitwarden, Passbolt…), VPN et accès distant,
pare-feu, serveurs d'authentification (Keycloak, SSO, fournisseurs d'identité), supervision,
administration technique, sous-domaines de tests d'intrusion, webmails
(`candidates.securityPatterns`, testés sur chaque segment du nom). Restent les portes publiques :
démarches essentielles et exceptions de `candidates.securityKeep` (connexion à l'espace
professionnel des impôts, à l'ENT, à Resana).

Les **environnements hors production** sont retirés de la même façon : préproduction (`preprod`,
`pprod`, `ppd`, `pp`), prévisualisation, staging, recette et qualification (`qlf`), test, bac à
sable (`bas`, `sandbox`), hors production et intégration, maquettes et prototypes
(`candidates.nonProductionPatterns`). Les faux amis sont écartés : `bas-rhin`, `bas-carbone`,
« stage » (stage d'étudiant), noms de laboratoires (`pharmadev`, `mecadev`).

### Rattachements

Les règles s'appliquent dans cet ordre ; chacune ne traite que ce que les précédentes n'ont pas
rattaché. La colonne `rattachement` indique celle qui a servi.

1. **Site parent** : un sous-domaine rejoint la bulle de son site parent.
2. **Annuaire** : le site suit la chaîne de l'organisme qui le déclare (ministère > direction >
   … > organisme > site), V1 comprise ; les liens de 2019 sont alors remplacés. Si plusieurs
   services le déclarent :
   - le propriétaire manifeste l'emporte (sigle ou initiales égaux au domaine : OFB pour ofb.gouv.fr) ;
   - un site déclaré par un organisme et ses antennes lui appartient (eau-grandsudouest.fr →
     Agence de l'eau Adour-Garonne), sauf s'il est déclaré par un ministère ou par plus de
     100 services ;
   - un site déclaré par au moins 3 services d'un même ministère est rattaché au ministère
     (info.gouv.fr → Premier ministre).

   Un domaine déclaré qui redirige vaut pour le site d'arrivée. À défaut de hiérarchie, la
   tutelle se déduit de l'adresse (ministère majoritaire parmi les services au même endroit).
3. **`config/rattachements.csv`** (`domaine,administration`) : un domaine et ses sous-domaines.
4. **Type DINUM** : ambassade, académie, université…
5. **Opérateurs de l'État** : un établissement reconnu (nom, mots ou sigle) est placé sous le
   ministère de son programme chef de file (`config/programmes-ministeres.csv`).
6. **`config/tutelles.csv`** (`motif,ministere`) : caisses nationales, chambres consulaires…
7. **Préfectures** : `<département ou région>.gouv.fr`.
8. **Bloc-marque** DSFR de la page d'accueil (nom du ministère sous la Marianne) ou, à défaut,
   ministère cité dans la page.
9. **Observatoire des démarches** : administration et ministère de la démarche.
10. **Mot-clé du domaine** (`config/mots-cles-ministeres.csv` : `musee` → Culture…).

Autres règles :

- les **entités de premier niveau** de l'annuaire (directement sous un ministère ou à la racine
  d'une section) figurent sur la carte même sans site propre, hors cabinets ;
- le Premier ministre est relié à chaque ministère ; la « Présidence de la République » de
  l'annuaire est le nœud du Président (elysee.fr) ;
- les **doublons** (adresses qui mènent au même site) sont fusionnés en un seul site, avec ses
  anciennes adresses ; les sous-domaines d'un ancien domaine rejoignent la bulle du site d'arrivée ;
- les ministères de la V1 prennent leur intitulé actuel (`config/correspondances-2019.csv`, à
  mettre à jour après chaque remaniement) ;
- les « services en ligne » et « consultations » de la V1 deviennent des sites ou des
  sous-domaines.

## La carte

Page autonome ([sigma.js](https://www.sigmajs.org), source `web/carte.html`) : recherche,
légende filtrante (sites archivés masqués par défaut), mise en avant des démarches
essentielles, fiche de chaque élément, vue en liste par pôle, accessible au clavier et aux
lecteurs d'écran. Lien direct vers un site : `#ademe.fr`.

Le placement est calculé pendant `build` : chaque élément rejoint le pôle de son ministère (ou
« Autorités indépendantes », « Institutions et juridictions ») ; les sous-domaines sont
regroupés en bulles autour de leur site ; dans un pôle, une simulation de forces (d3-force)
donne sa place à chaque bulle ; les pôles sont ensuite empaquetés autour du Président, au
centre, et du Premier ministre.

## Le tableau de bord de pilotage

Page `pilotage.html` (source `web/pilotage.html`, données `out/web/pilotage.json`), même design
que la carte : chiffres clés, constats à traiter (démarches non accessibles, certificats en
erreur, sites sans HTTPS, sites de l'administration centrale hors .gouv.fr…), réponses des
serveurs par code HTTP, tableau par ministère dépliable par administration, indicateurs des
démarches essentielles de l'Observatoire, liste complète triable et filtrable, et feuille de
route. Présentée comme une proposition indépendante, pas comme un outil officiel.

Quelques conventions :

- un **accès restreint** (401, 403) n'est pas une erreur : outil interne, espace connecté ou
  pare-feu ;
- un **certificat en erreur** est une erreur visible dans le navigateur (expiré, autosigné,
  établi pour un autre nom) ; une chaîne de certificats incomplète, que les navigateurs
  complètent, n'est pas comptée ;
- un domaine qui affiche une page par défaut, « Site en construction » ou de parking est
  **hors ligne** : il figure dans la liste des domaines détenus sans site.

## Publication

La GitHub Action [`carte.yml`](.github/workflows/carte.yml) publie `out/web/` sur GitHub Pages :

- à chaque push sur `master`, la carte est reconstruite à partir des vérifications versionnées ;
- le 1er de chaque mois (ou à la demande, option « complet »), toutes les vérifications sont
  relancées, puis les résultats et la liste des sites sont versionnés avant publication.

Le domaine est fixé par `site.domain` dans `config/config.json` ; chez OVH, un enregistrement
`CNAME` `gouvfr` → `jbledevehat.github.io.` pointe vers GitHub Pages.

## Organisation du code

```
src/
  cli.mjs          commandes
  context.mjs      chemins, configuration, lecture et écriture des fichiers
  sources.mjs      téléchargement des sources
  annuaire.mjs     hiérarchie de l'annuaire et index de ses sites
  subdomains.mjs   sous-domaines (crt.sh)
  candidates.mjs   sélection des candidats
  check.mjs        vérification HTTP
  marques.mjs      lecture des blocs-marques
  build/           construction : V1, nouveaux sites, rattachements, doublons, exports (CSV, JSON, PDF), rapport
  graph.mjs        graphe, bulles, placement, GEXF et données de la page
  lib/             CSV, HTTP, URL, comparaison d'intitulés
config/            sources, filtres et tables de rattachement
donnees/           V1 (2019), vérifications, hiérarchie de l'annuaire, liste des sites
web/carte.html     page de la carte
```

## Version 1 (2019)

La première carte, réalisée à la main sous Kumu à partir de la liste
[gouvfrlist](https://github.com/bzg/gouvfrlist), du top 250 des démarches, de la
[liste des sites en gouv.fr de 2014](https://www.data.gouv.fr/fr/datasets/listes-des-sites-gouv-fr/)
et des [noms de domaine de l'AFNIC](https://opendata.afnic.fr). Ses fichiers d'origine (imports
Kumu, données AFNIC, images) sont conservés dans le tag
[`v1-2019`](https://github.com/jbledevehat/graph-gouv-fr/tree/v1-2019).

## Contributions

Questions et corrections bienvenues : ouvrez une issue ou proposez une *pull request* (un
rattachement manquant se corrige souvent dans `config/rattachements.csv`).

## Licence

Jean-Baptiste Le Dévéhat, 2019-2026, [Licence Ouverte 2.0](LICENSE.md).
