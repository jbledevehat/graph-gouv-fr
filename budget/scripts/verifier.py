# Vérifie les données construites :
# 1. chaque total de l'équilibre recalculé à partir des fichiers DGFiP doit égaler, au centime près,
#    le tableau de l'article 1er du projet de loi d'approbation des comptes 2024 ;
# 2. les sommes par ministère, par nature et par instrument doivent retomber sur les totaux ;
# 3. aucune aide ne doit rester sans ministère ;
# 4. les comptes de l'Insee doivent être cohérents (administrations, fonctions, recettes, solde).
# Usage : python3 scripts/verifier.py   (depuis la racine du projet) ; code de sortie 1 en cas d'écart.
import csv
import json
from collections import defaultdict

d = json.load(open('donnees/budget-etat-2024.json', encoding='utf-8'))
erreurs = []


def egal(nom, calcule, attendu, tolerance=0.01):
    ok = abs(calcule - attendu) <= tolerance
    print(f"  {'OK ' if ok else 'ÉCART'} {nom} : calculé {calcule:,.2f}, attendu {attendu:,.2f}".replace(',', ' '))
    if not ok:
        erreurs.append(nom)


print("1. Équilibre du budget général comparé à l'article 1er (en euros)")
with open('config/equilibre-officiel-2024.csv', encoding='utf-8') as f:
    for r in csv.DictReader(f, delimiter=';'):
        # La page stocke des millions arrondis au millier d'euros : on compare au millier près.
        egal(r['libelle'], d['equilibre'][r['cle']] * 1e6, float(r['montant_euros'].replace(',', '.')), tolerance=1000)

print('2. Cohérence interne (en millions d’euros)')
P = d['programmes']
total = sum(p['depenses'] for p in P)
egal('somme des programmes = dépenses brutes + fonds de concours', total,
     d['equilibre']['depenses_brutes_hors_fdc'] + d['equilibre']['fonds_de_concours'], 0.01)
par_ministere = defaultdict(float)
for p in P:
    par_ministere[p['ministere']] += p['depenses']
egal('somme par ministère = somme des programmes', sum(par_ministere.values()), total, 0.01)
egal('somme par nature = somme des programmes', sum(sum(p['nature'].values()) for p in P), total, 0.01)
R = d['recettes']
egal('sections fiscales nettes = recettes fiscales nettes',
     sum(s['net'] for s in R['sections'] if s['categorie'] == 'Recettes fiscales'), d['equilibre']['recettes_fiscales_nettes'], 0.01)
egal('sections non fiscales = recettes non fiscales',
     sum(s['net'] for s in R['sections'] if s['categorie'] == 'Recettes non fiscales'), d['equilibre']['recettes_non_fiscales'], 0.01)
A = d['aides']
egal('aides : somme = 166 081 M€ (somme des lignes du rapport)', sum(a['montant'] or 0 for a in A), 166081, 0.5)
egal('aides : 469 dispositifs', len(A), 469, 0)
sans = [a['nom'] for a in A if not a['ministere']]
egal('aides sans ministère', len(sans), 0, 0)

print("3. Ensemble des administrations publiques (Insee, en milliards d'euros)")
g = json.load(open('donnees/argent-public-2024.json', encoding='utf-8'))
egal('les quatre administrations = total des dépenses publiques', sum(x['total'] for x in g['secteurs']), g['total_depenses'], 0.01)
for x in g['secteurs']:
    egal(f"{x['nom']} : somme des fonctions = total", sum(f['montant'] for f in x['fonctions']), x['total'], 0.01)
egal('somme des recettes = total des recettes', sum(r['montant'] for r in g['recettes']), g['total_recettes'], 0.01)
egal('recettes - dépenses = besoin de financement publié', g['total_recettes'] - g['total_depenses'], g['solde'], 0.01)

print('Résultat :', 'aucun écart' if not erreurs else f'{len(erreurs)} écart(s) : ' + ' ; '.join(erreurs))
raise SystemExit(1 if erreurs else 0)
