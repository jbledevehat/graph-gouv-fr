# Vérifie les données construites :
# 1. chaque total de l'équilibre recalculé à partir des fichiers DGFiP doit égaler, au centime près,
#    le tableau de l'article 1er du projet de loi d'approbation des comptes de l'année (2023, 2024) ;
# 2. les sommes par ministère, par nature et par instrument doivent retomber sur les totaux ;
# 3. aucune aide ne doit rester sans ministère ;
# 4. les comptes de l'Insee doivent être cohérents (administrations, fonctions, recettes, solde).
# Usage : python3 scripts/verifier.py   (depuis la racine du projet) ; code de sortie 1 en cas d'écart.
import csv
import json
ANNEES_INSEE = [str(a) for a in range(2019, 2025)]
ANNEES_ETAT = ['2023', '2024', '2025']
from collections import defaultdict

erreurs = []


def egal(nom, calcule, attendu, tolerance=0.01):
    ok = abs(calcule - attendu) <= tolerance
    print(f"  {'OK ' if ok else 'ÉCART'} {nom} : calculé {calcule:,.2f}, attendu {attendu:,.2f}".replace(',', ' '))
    if not ok:
        erreurs.append(nom)


for annee in ANNEES_ETAT:
    d = json.load(open(f'donnees/budget-etat-{annee}.json', encoding='utf-8'))
    print(f"  {annee}")
    print("  1. Équilibre du budget général comparé à l'article 1er (en euros)")
    with open(f'config/equilibre-officiel-{annee}.csv', encoding='utf-8') as f:
        for r in csv.DictReader(f, delimiter=';'):
            # La page stocke des millions arrondis au millier d'euros : on compare au millier près ;
            # en 2023, à 1 M€ près, car quatorze montants du fichier source sont arrondis (voir construire.py).
            egal(r['libelle'], d['equilibre'][r['cle']] * 1e6, float(r['montant_euros'].replace(',', '.')), tolerance=1e6 if annee == '2023' else 1000)

    print('  2. Cohérence interne (en millions d’euros)')
    tol = 2 if annee == '2023' else 0.01  # 2023 : montants sources arrondis, voir plus haut
    P = d['programmes']
    total = sum(p['depenses'] for p in P)
    egal('somme des programmes = dépenses brutes + fonds de concours', total,
         d['equilibre']['depenses_brutes_hors_fdc'] + d['equilibre']['fonds_de_concours'], tol)
    par_ministere = defaultdict(float)
    for p in P:
        par_ministere[p['ministere']] += p['depenses']
    egal('somme par ministère = somme des programmes', sum(par_ministere.values()), total, tol)
    egal('somme par nature = somme des programmes', sum(sum(p['nature'].values()) for p in P), total, tol)
    R = d['recettes']
    egal('sections fiscales nettes = recettes fiscales nettes',
         sum(s['net'] for s in R['sections'] if s['categorie'] == 'Recettes fiscales'), d['equilibre']['recettes_fiscales_nettes'], tol)
    egal('sections non fiscales = recettes non fiscales',
         sum(s['net'] for s in R['sections'] if s['categorie'] == 'Recettes non fiscales'), d['equilibre']['recettes_non_fiscales'], tol)
    if annee == '2024':
        A = d['aides']
        egal('aides : somme = 166 081 M€ (somme des lignes du rapport)', sum(a['montant'] or 0 for a in A), 166081, 0.5)
        egal('aides : 469 dispositifs', len(A), 469, 0)
        sans = [a['nom'] for a in A if not a['ministere']]
        egal('aides sans ministère', len(sans), 0, 0)

print("3. Ensemble des administrations publiques (Insee, en milliards d'euros), année par année")
for annee in ANNEES_INSEE:
    g = json.load(open(f'donnees/argent-public-{annee}.json', encoding='utf-8'))
    print(f'  {annee}')
    egal('les quatre administrations = total des dépenses publiques', sum(x['total'] for x in g['secteurs']), g['total_depenses'], 0.01)
    for x in g['secteurs']:
        egal(f"{x['nom']} : somme des fonctions = total", sum(f['montant'] for f in x['fonctions']), x['total'], 0.01)
        d_ = x['recettes']['detail']
        egal(f"{x['nom']} : détail des impôts = impôts", d_['production'] + d_['revenu'] + d_['capital'] + d_['transferts'] + d_['non_recouvrables'], x['recettes']['impots'], 0.01)
    egal('somme des recettes = total des recettes', sum(r['montant'] for r in g['recettes']), g['total_recettes'], 0.01)
    egal('recettes - dépenses (tableau 3.201) = besoin de financement publié', g['total_recettes'] - g['total_depenses_par_nature'], g['solde'], 0.01)
    egal('dépenses par fonction (3.307) = dépenses par nature (3.201), à 50 M€ près', g['total_depenses'], g['total_depenses_par_nature'], 0.05)

print('Résultat :', 'aucun écart' if not erreurs else f'{len(erreurs)} écart(s) : ' + ' ; '.join(erreurs))
raise SystemExit(1 if erreurs else 0)
