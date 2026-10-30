#!/bin/sh
# Télécharge les fichiers officiels utilisés par le tableau de bord, puis met à jour le registre
# des sources (sources/SOURCES.md) avec leur empreinte SHA-256.
# Usage : sh scripts/telecharger.sh   (depuis la racine du projet)
set -eu

PLRG=https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/plrg-2024/attachments
PLF25=https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/plf25-depenses-2025-selon-destination/exports/csv?delimiter=%3B

recuperer() {
  echo "  $2"
  curl -sS -L --fail --max-time 300 -o "$2" "$1"
}

mkdir -p sources/plrg-2024 sources/plf-2025 sources/insee
echo "Loi relative aux résultats de la gestion 2024 (DGFiP) :"
recuperer "$PLRG/annexe1_etat_cp_2024_csv" sources/plrg-2024/Annexe1-Etat_CP-2024.csv
recuperer "$PLRG/annexe1_etat_recettes_csv" sources/plrg-2024/Annexe1-Etat_Recettes-2024.csv
recuperer "$PLRG/annexe1_etat_titre_cat_2024_csv" sources/plrg-2024/Annexe1-Etat_Titre_Cat-2024.csv
recuperer "$PLRG/listdepfisc_plrn_2024_csv" sources/plrg-2024/ListDepFisc-PLRN-2024.csv
recuperer "$PLRG/annexe2_etat_cp_2024_csv" sources/plrg-2024/Annexe2-Etat_CP-2024.csv
recuperer "$PLRG/annexe2_etat_recouvt_2024_csv" sources/plrg-2024/Annexe2-Etat_Recouvt-2024.csv
recuperer "$PLRG/annexe2_etat_comptable_2024_csv" sources/plrg-2024/Annexe2-Etat_Comptable-2024.csv
recuperer "$PLRG/annexe2_dec_auto_2024_csv" sources/plrg-2024/Annexe2-Dec_Auto-2024.csv
echo "Projet de loi de finances pour 2025, dépenses selon destination (Direction du budget) :"
recuperer "$PLF25" sources/plf-2025/PLF2025-Depenses-selon-destination.csv

echo "Insee, comptes de la Nation en 2024 :"
for f in 8574705/t_3201.xlsx 8574707/T_3307.xlsx 8574705/t_3217.xlsx 8574705/t_3215_prov.xlsx 8574705/t_3203.xlsx 8574705/t_3204.xlsx 8574705/t_3205.xlsx 8574705/t_3212.xlsx; do
  recuperer "https://www.insee.fr/fr/statistiques/fichier/$f" "sources/insee/$(basename "$f")"
done

# Les PDF de présentation (notices) sont dans une archive : on n'en garde que trois.
TMP=$(mktemp -d)
recuperer "$PLRG/notices_par_fichiers_csv_plrg_2024_zip" "$TMP/notices.zip"
unzip -o -q "$TMP/notices.zip" Annexe1-Etat_CP-2024.pdf Annexe1-Etat_Recettes.pdf ListDepFisc-PLRN-2024.pdf -d sources/plrg-2024
rm -rf "$TMP"

echo "Détail par programme (autorisations d'engagement, actions, indicateurs de performance) :"
API=https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets
PLRG23=$API/projet-de-loi-relatif-aux-resultats-de-la-gestion-et-portant-approbation-des-comptes-de-lannee-plrg-2023/attachments
PLRG25=$API/projet-de-loi-relatif-aux-resultats-de-la-gestion-et-portant-approbation-des-comptes-de-lannee-plrg-2025/attachments
mkdir -p sources/plrg-2023 sources/plrg-2025 sources/plf-2023 sources/plf-2024 sources/performance
recuperer "$PLRG23/annexe1_etat_ae_2023_csv" sources/plrg-2023/Annexe1-Etat_AE-2023.csv
recuperer "$PLRG/annexe1_etat_ae_2024_csv" sources/plrg-2024/Annexe1-Etat_AE-2024.csv
recuperer "$PLRG25/annexe1_etat_ae_2025csv" sources/plrg-2025/Annexe1-Etat_AE-2025.csv
recuperer "$API/plf-2023-credits_destination_nature/exports/csv?delimiter=%3B" sources/plf-2023/PLF2023-Credits-destination-nature.csv
recuperer "$API/nomenclature-par-destination-lfi-2023/exports/csv?delimiter=%3B" sources/plf-2023/LFI2023-Nomenclature-destination.csv
recuperer "$API/plf-2024-depenses-2024-selon-nomenclatures-destination-et-nature/exports/csv?delimiter=%3B" sources/plf-2024/PLF2024-Depenses-destination-nature.csv
recuperer "$API/performance-execution-et-atteinte-de-la-cible-du-budget-de-l-etat-jusqu-au-niveau-sous-indicateur/exports/csv?delimiter=%3B" sources/performance/Performance-execution-cible-2022-2024.csv
recuperer "$API/performance-de-la-depense-rap-2025/exports/csv?delimiter=%3B" sources/performance/RAP2025-Performance.csv


echo "Politique en faveur de la jeunesse et politiques de l'enfance (annexes aux PLF 2025 à 2027) :"
AN=https://www.assemblee-nationale.fr/dyn/contenu/visualisation
mkdir -p sources/jeunesse
recuperer "https://www.jeunes.gouv.fr/media/5072/download" sources/jeunesse/DPT-jeunesse-PLF2022.pdf
recuperer "https://www2.assemblee-nationale.fr/static/17/Annexes-DL/PLF2025-Oranges/07-Orange_Jeunesse.pdf" sources/jeunesse/DPT-jeunesse-PLF2025.pdf
recuperer "$AN/1090086/file/7-DPT2026_Jeunesse.pdf" sources/jeunesse/DPT-jeunesse-PLF2026.pdf
recuperer "$AN/1129682/file/7-DPT%202027%20-%20Politique%20en%20faveur%20de%20la%20jeunesse.pdf" sources/jeunesse/DPT-jeunesse-PLF2027.pdf
recuperer "$AN/1129792/file/26-Jaune%202027%20-%20Politiques%20de%20l%27enfance.pdf" sources/jeunesse/Jaune-politiques-enfance-PLF2027.pdf

echo "Collectivités : dépenses par fonction (DGFiP) et bulletins de contrôle (DGCL) :"
mkdir -p sources/collectivites
python3 scripts/collectivites.py --refaire
BIS=https://www.collectivites-locales.gouv.fr/files/files/Etudes-et-statistiques/BIS/2025
recuperer "$BIS/BIS%20203%20-%20Fonction%20des%20r%C3%A9gions_2.pdf" sources/collectivites/BIS203-fonction-regions-2024.pdf
recuperer "$BIS/BIS%20205%20-%20Fonction%20des%20communes%20V4.pdf" sources/collectivites/BIS205-fonction-communes-2024.pdf

python3 scripts/registre.py
