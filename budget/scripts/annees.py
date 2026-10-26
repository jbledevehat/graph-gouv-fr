# Écrit donnees/annees.json : les années disponibles pour chaque source, et les plus grands
# totaux, qui fixent l'échelle commune des surfaces : un milliard d'euros a la même surface quelle
# que soit l'année affichée.
# Usage : python3 scripts/annees.py   (depuis la racine du projet, après insee.py et construire.py)
import glob
import json
import re


def annees(motif):
    return sorted(re.search(r'(\d{4})\.json$', f).group(1) for f in glob.glob(f'donnees/{motif}-*.json'))


insee, etat = annees('argent-public'), annees('budget-etat')
G = {a: json.load(open(f'donnees/argent-public-{a}.json', encoding='utf-8')) for a in insee}
B = {a: json.load(open(f'donnees/budget-etat-{a}.json', encoding='utf-8')) for a in etat}
donnees = {
    '_note': "Années disponibles par source. insee : ensemble des administrations publiques (argent-public-AAAA.json) ; "
             "etat : budget de l'État ministère par ministère (budget-etat-AAAA.json) ; aides : aides aux entreprises. "
             "insee_ecart : années où le total des dépenses par fonction (tableau 3.307 de l'Insee) s'écarte de plus de 50 M€ "
             "du total des dépenses (tableau 3.201), signalées sur les pages. echelle : plus grands totaux, en milliards "
             "(insee) et en millions (etat), qui fixent l'échelle commune des surfaces.",
    'insee': insee,
    'insee_ecart': [a for a in insee if abs(G[a]['total_depenses'] - G[a]['total_depenses_par_nature']) > 0.05],
    'etat': etat,
    'aides': [a for a in etat if B[a]['aides']],
    'reference': '2024',
    'echelle': {
        'insee_md': round(max(max(g['total_depenses'], g['total_depenses_par_nature']) for g in G.values()), 3),
        'etat_m': round(max(sum(p['depenses'] for p in b['programmes'] if p['programme'] != '200') for b in B.values()), 3),
    },
}
with open('donnees/annees.json', 'w', encoding='utf-8') as f:
    json.dump(donnees, f, ensure_ascii=False, indent=1)
print('  -> donnees/annees.json', {k: donnees[k] for k in ('insee_ecart', 'etat', 'aides', 'echelle')})
