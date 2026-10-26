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

python3 scripts/registre.py
