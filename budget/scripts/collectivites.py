#!/usr/bin/env python3
"""Dépenses des collectivités par fonction, à partir des balances comptables de la DGFiP.

Source : « Balances comptables des collectivités et des établissements publics locaux avec la
présentation croisée nature-fonction » (data.economie.gouv.fr), une ligne par budget, fonction et
compte. Le script demande au portail les sommes par catégorie de collectivité et par fonction, pour
les budgets principaux et les opérations réelles (opérations budgétaires moins les opérations
d'ordre), et les garde dans sources/collectivites/balances-fonction-AAAA.json.

- Fonctionnement : comptes 60 à 67, sauf 675 et 676 (cessions d'immobilisations).
- Investissement : comptes 20 (dont 204, subventions d'équipement versées), 21 et 23.

Les communes de moins de 3 500 habitants n'ont pas à présenter leurs dépenses par fonction : elles
n'apparaissent pas dans ces sommes. Les syndicats et les établissements publics locaux (caisses des
écoles, centres d'action sociale…) non plus : on ne garde que les collectivités elles-mêmes.

Usage (depuis budget/) : python3 scripts/collectivites.py [--refaire]
"""
import json, os, sys, urllib.parse, urllib.request

ANNEES = {
    '2024': 'balances-comptables-des-collectivites-et-des-etablissements-publics-locaux-avec-la-presentation-croisee-nature-fonction-2024',
    '2025': 'balances-comptables-des-collectivites-et-des-etablissements-publics-locaux-avec-la-presentation-croisee-nature-fonction-2025',
}
PORTAIL = 'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/{}/records'
CATEGORIES = ['Commune', 'PARIS', 'GFP', 'EPT', 'ML', 'DEPT', 'REG', 'CTU']
NATURES = {
    'fonctionnement': "startswith(compte,'6') and not startswith(compte,'68') and not startswith(compte,'675') and not startswith(compte,'676')",
    'investissement': "(startswith(compte,'20') or startswith(compte,'21') or startswith(compte,'23'))",
}
REEL = 'sum(obnetdeb)-sum(oobdeb)-sum(obnetcre)+sum(oobcre)'
DOSSIER = 'sources/collectivites'


def demander(jeu, nature):
    """Sommes par catégorie et par code de fonction, en euros."""
    cats = ','.join(f"'{c}'" for c in CATEGORIES)
    params = {'select': f'categ,nomen,fonction,{REEL} as m', 'where': f"cbudg='1' and categ in ({cats}) and {NATURES[nature]}",
              'group_by': 'categ,nomen,fonction', 'limit': '20000'}
    url = PORTAIL.format(jeu) + '?' + urllib.parse.urlencode(params)
    with urllib.request.urlopen(url, timeout=600) as r:
        return json.load(r)['results']


def telecharger(an, refaire=False):
    f = f'{DOSSIER}/balances-fonction-{an}.json'
    if os.path.exists(f) and not refaire:
        return json.load(open(f, encoding='utf-8'))
    lignes = {}
    for nature in NATURES:
        for r in demander(ANNEES[an], nature):
            cle = (r['categ'], r['nomen'], r['fonction'] or '')
            lignes.setdefault(cle, {'fonctionnement': 0.0, 'investissement': 0.0})[nature] = round(r['m'], 2)
    out = {'_note': f"Sommes des balances comptables {an} de la DGFiP par catégorie de collectivité, nomenclature et code de fonction : "
                    "budgets principaux, opérations réelles, en euros. Produit par budget/scripts/collectivites.py.",
           'jeu_de_donnees': 'https://data.economie.gouv.fr/explore/dataset/' + ANNEES[an] + '/',
           'lignes': [[c, n, fo, v['fonctionnement'], v['investissement']] for (c, n, fo), v in sorted(lignes.items())]}
    os.makedirs(DOSSIER, exist_ok=True)
    json.dump(out, open(f, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    return out


def fonction(code):
    """Code de fonction M57 sans le chapitre de vote : 93222 (fonctionnement) ou 90222 (investissement) -> 222.
    Les chapitres 92, 94 et 95 (opérations non ventilées) et les codes vides donnent None."""
    code = str(code or '')
    if code[:2] in ('90', '93') and len(code) > 2:
        return code[2:]
    if not code or code[0] == '9':
        return None
    return code


if __name__ == '__main__':
    for an in ANNEES:
        d = telecharger(an, '--refaire' in sys.argv)
        print(f'{an} : {len(d["lignes"])} lignes')
