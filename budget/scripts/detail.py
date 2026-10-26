# Écrit donnees/detail-etat-AAAA.json : le détail de chaque programme du budget général de l'État,
# lu par la page de pilotage quand on ouvre un ministère, une mission ou un programme :
# - prévu et réalisé : crédits votés, modifiés en cours d'année, reportés, dépensés, annulés, pour
#   les crédits de paiement (ce qui est payé dans l'année) et les autorisations d'engagement
#   (ce que l'État peut s'engager à payer, parfois sur plusieurs années) ;
# - la nature fine des dépenses (catégories de la loi organique : rémunérations, cotisations,
#   transferts aux ménages, aux entreprises, aux collectivités…) ;
# - la répartition par action et sous-action prévue par le projet de loi de finances de l'année,
#   le seul document qui la publie en données ouvertes ;
# - les indicateurs de performance : cible, réalisé et appréciation du rapport annuel de performance.
# Aucun chiffre n'est saisi à la main. Les contrôles arrêtent le script en cas d'écart.
# Usage : python3 scripts/detail.py [année]   (depuis la racine du projet, après construire.py)
import csv
import json
import re
import sys
from collections import defaultdict

ANNEE = sys.argv[1] if len(sys.argv) > 1 else '2024'
SRC = f'sources/plrg-{ANNEE}'
EUR = 1e6
# Même tolérance que construire.py : en 2023, certains montants sont arrondis à six chiffres.
TOLERANCE = 2e6 if ANNEE == '2023' else 1


def nombre(s):
    s = (s or '').strip().replace(' ', '').replace(' ', '').replace('\xa0', '')
    if s in ('', '-'):
        return 0.0
    return float(s.replace(',', '.'))


def lire(chemin):
    with open(chemin, encoding='utf-8-sig', newline='') as f:
        texte = f.read().replace('\r\n', '\n').replace('\r', ' ')
    return [r for r in csv.DictReader(texte.splitlines(), delimiter=';') if r.get('Mission') != 'Mission']


def numero(libelle):
    m = re.search(r'-\s*(\d+)\s*$', libelle.strip())
    return m.group(1) if m else None


def code_prog(s):
    """« 146.0 », « 0146 », « P146 » -> « 146 »."""
    return str(int(float(re.sub(r'^P', '', s.strip()))))


def texte(s):
    return re.sub(r'\s+', ' ', (s or '').replace(' ', ' ').replace('\xa0', ' ')).strip()


def arrondi(v):
    return round(v, 3)


budget = json.load(open(f'donnees/budget-etat-{ANNEE}.json', encoding='utf-8'))
programmes = {p['programme']: {} for p in budget['programmes']}
depenses_publiees = {p['programme']: p['depenses'] for p in budget['programmes']}

# --- Prévu et réalisé (crédits de paiement et autorisations d'engagement) ---
# Votés (LFI) + loi de finances rectificative + reports de l'année précédente + mouvements
# réglementaires (virements, transferts, décrets) + fonds de concours et attributions de produits
# + fongibilité = crédits ouverts. Ouverts = dépensés + annulés − ouverts en fin de gestion par la
# loi d'approbation des comptes + reportés sur l'année suivante.
CP = [('lfi', 'LFI'), ('lfr', 'LFR'), ('report_entrant', 'Report_N-1'), ('mouvements', 'Mvts_reglementaires'),
      ('fonds_de_concours', 'FDC_et_ADP'), ('fongibilite', 'Fongibilite_asymetrique'), ('ouverts', 'Total_CP_Ouverts'),
      ('depenses', 'Depenses_constatees'), ('ouvertures_fin', 'Modif_Ouvertures'), ('annulations_fin', 'Modif_Annulations'),
      ('report_sortant', 'Report_N+1')]
libelles = {}
for r in lire(f'{SRC}/Annexe1-Etat_CP-{ANNEE}.csv'):
    libelles[re.sub(r'\s*-\s*\d+\s*$', '', r['Programme']).strip()] = numero(r['Programme'])
    d = programmes[numero(r['Programme'])].setdefault('cp', defaultdict(float))
    for k, c in CP:
        d[k] += nombre(r.get(c))
for r in lire(f'{SRC}/Annexe1-Etat_AE-{ANNEE}.csv'):
    # En 2024, un libellé trop long est coupé avant son numéro : on le retrouve par son début.
    p = numero(r['Programme']) or next((n for l, n in libelles.items() if l.startswith(r['Programme'].strip())), None)
    if p is None:
        raise SystemExit(f"Programme introuvable : {r['Programme']}")
    d = programmes[p].setdefault('ae', defaultdict(float))
    d['lfi'] += nombre(r['LFI'])
    d['ouvertes'] += nombre(r['Total_AE_Ouvertes'])
    d['consommees'] += nombre(r['AE_Consommees'])
for p, v in programmes.items():
    cp = v['cp']
    # budget-etat-AAAA.json est arrondi au millier d'euros.
    if abs(cp['depenses'] / EUR - depenses_publiees[p]) > (TOLERANCE + 500) / EUR:
        raise SystemExit(f'Programme {p} : dépenses différentes de budget-etat-{ANNEE}.json')
    if abs(cp['ouverts'] - sum(cp[k] for k in ('lfi', 'lfr', 'report_entrant', 'mouvements', 'fonds_de_concours', 'fongibilite'))) > TOLERANCE:
        raise SystemExit(f'Programme {p} : les crédits ouverts ne retombent pas sur leurs composantes')
    if abs(cp['ouverts'] - cp['depenses'] - cp['annulations_fin'] + cp['ouvertures_fin'] - cp['report_sortant']) > TOLERANCE:
        raise SystemExit(f'Programme {p} : les crédits ouverts ne retombent pas sur dépensés, annulés et reportés')
    v['cp'] = {k: arrondi(x / EUR) for k, x in cp.items()}
    v['ae'] = {k: arrondi(x / EUR) for k, x in v.get('ae', {}).items()}

# --- Nature fine : catégories de la loi organique relative aux lois de finances (article 5) ---
CATEGORIES = {
    '10': 'Dotations des pouvoirs publics',
    '21': "Rémunérations d'activité", '22': 'Cotisations et contributions sociales', '23': 'Prestations sociales et allocations diverses',
    '31': 'Fonctionnement courant', '32': 'Subventions pour charges de service public (opérateurs)',
    '41': 'Intérêts de la dette négociable', '42': 'Intérêts de la dette non négociable', '43': 'Charges financières diverses',
    '51': "Investissements de l'État (biens corporels)", '52': "Investissements de l'État (biens incorporels)", '53': "Subventions pour charges d'investissement",
    '61': 'Transferts aux ménages', '62': 'Transferts aux entreprises', '63': 'Transferts aux collectivités territoriales', '64': 'Transferts aux autres collectivités', '65': 'Appels en garantie',
    '71': 'Prêts et avances', '72': 'Dotations en fonds propres', '73': 'Participations financières',
}
cat = defaultdict(lambda: defaultdict(float))
for r in lire(f'{SRC}/Annexe1-Etat_Titre_Cat-{ANNEE}.csv'):
    c = r['Categorie'].strip()
    if c not in CATEGORIES:
        raise SystemExit(f'Catégorie inconnue : {c}')
    cat[numero(r['Programme'])][c] += nombre(r['Depenses'])
for p, v in programmes.items():
    if abs(sum(cat[p].values()) / EUR - depenses_publiees[p]) > (TOLERANCE + 500) / EUR:
        raise SystemExit(f'Programme {p} : la ventilation par catégorie ne retombe pas sur le total')
    v['categories'] = {c: arrondi(x / EUR) for c, x in sorted(cat[p].items()) if abs(x) >= 500}

# --- Actions et sous-actions (prévision du projet de loi de finances de l'année) ---
# Trois formats selon l'année ; on n'en garde que le budget général, en crédits de paiement.
if ANNEE == '2023':
    noms = {}
    for r in lire('sources/plf-2023/LFI2023-Nomenclature-destination.csv'):
        if r['type_de_budget'] == 'BG':
            noms[r['code_programme_action_ou_sous_action'].lstrip('0')] = texte(r['libelle_complet'])
    # Quand la sous-action est donnée, l'action est vide : elle se lit dans le code de la sous-action.
    lignes = [(code_prog(r['programme']), a, noms.get(a), r['sous_action'], noms.get(r['sous_action']), nombre(r['cp']))
              for r in lire('sources/plf-2023/PLF2023-Credits-destination-nature.csv') if r['typebudget'] == 'BG'
              for a in [r['action'] or r['sous_action'].rsplit('-', 1)[0]]]
    loi = 'projet de loi de finances pour 2023'
elif ANNEE == '2024':
    lignes = []
    for r in lire('sources/plf-2024/PLF2024-Depenses-destination-nature.csv'):
        if r['type_mission'] != 'BG':
            continue
        p = code_prog(r['programme'])
        a = f"{p}-{r['action']}" if r['action'] else ''
        lignes.append((p, a, texte(r['libelle_action']), f"{a}-{r['sous_action']}" if r['sous_action'] else '', texte(r['libelle_sousaction']), nombre(r['cp_plf'])))
    loi = 'projet de loi de finances pour 2024'
else:
    lignes = [(code_prog(r['programme']), r['action'], texte(r['libelle_action']), r['sous_action'], texte(r['libelle_sous_action']), nombre(r['credit_de_paiement']))
              for r in lire('sources/plf-2025/PLF2025-Depenses-selon-destination.csv') if r['typebudget'] == 'BG']
    loi = 'projet de loi de finances pour 2025'

actions = defaultdict(dict)
for p, a, la, s, ls, cp in lignes:
    if not a:
        continue
    act = actions[p].setdefault(a, {'code': a.split('-')[-1], 'libelle': la or f'Action {a}', 'cp': 0.0, 'sous_actions': {}})
    act['cp'] += cp
    if s:
        # Le libellé d'une sous-action reprend souvent celui de l'action : « Frapper à distance - Porte-avions ».
        court = re.sub(r'^' + re.escape(act['libelle']) + r'\s*[-–:]\s*', '', ls or '') if ls else ''
        sa = act['sous_actions'].setdefault(s, {'code': s.split('-')[-1], 'libelle': court or ls or f'Sous-action {s}', 'cp': 0.0})
        sa['cp'] += cp
sans_libelle = 0
for p, v in programmes.items():
    liste = []
    for a in sorted(actions.get(p, {}).values(), key=lambda a: a['code']):
        sas = [{**s, 'cp': arrondi(s['cp'] / EUR)} for s in sorted(a['sous_actions'].values(), key=lambda s: s['code']) if abs(s['cp']) >= 500]
        sans_libelle += sum(1 for s in sas if s['libelle'] == f"Sous-action {a['code']}-{s['code']}" or s['libelle'].startswith('Sous-action ' + p)) + (a['libelle'] == f'Action {p}-{a["code"]}')
        if abs(a['cp']) >= 500 or sas:
            liste.append({'code': a['code'], 'libelle': a['libelle'], 'cp': arrondi(a['cp'] / EUR), **({'sous_actions': sas} if sas else {})})
    v['actions'] = liste

# --- Indicateurs de performance (rapports annuels de performance) ---
# Les indicateurs de mission reprennent ceux d'un programme : on ne garde que ceux des programmes.
# Appréciation : « cible atteinte », « amélioration » (sans atteindre la cible), « absence
# amélioration », ou donnée non renseignée ou non retenue.
STATUT = {'cible atteinte': 'atteinte', 'amélioration': 'progres', 'absence amélioration': 'non', 'donnée non renseignée': 'nd', 'donnée non retenue': 'nd', '': 'nd'}
if ANNEE == '2025':
    perf = [{'p': r['code_programme'], 'oc': r['code_externe_objectif'], 'o': r['libelle_objectif'], 'ic': r['code_externe_indicateur'], 'i': r['libelle_indicateur'],
             's': r['libelle_sous_indicateur'], 'u': r['unite'], 'f': r['facteur_de_performance'],
             'c': r['2025_cible'] or r['abs_2025_cible'], 'r': r['exec_2025'] or r['abs_exec_2025'], 'a': r['atteinte_de_la_cible_2025'],
             'n1': r['exec_2024'] or r['absexec_2024'], 'k': (int(r['ordre_obj'] or 0), int(r['ordre_ind'] or 0), int(r['ordre_ssi'] or 0))}
            for r in lire('sources/performance/RAP2025-Performance.csv') if r['type_de_secteur'] == 'Programme' and r['budget'] == 'BG']
    source_perf = 'rapports annuels de performance 2025'
else:
    perf = [{'p': code_prog(r['code_programme']), 'oc': r['code_externe_objectif'], 'o': r['libelle_objectif'], 'ic': r['code_externe_indicateur'], 'i': r['libelle_indicateur'],
             's': r['libelle_sous_indicateur'], 'u': r['unite'], 'f': r['facteur_de_performance'], 'c': r['cible'], 'r': r['execution'], 'a': r['atteinte_de_la_cible'],
             'n1': '', 'k': (r['code_externe_objectif'], float(r['ordre_ind'] or 0), float(r['code_interne_sous_indicateur'] or 0))}
            for r in lire('sources/performance/Performance-execution-cible-2022-2024.csv') if r['type_de_secteur'] == 'Programme' and r['annee'] == f'{ANNEE}.0']
    source_perf = f'rapports annuels de performance {ANNEE}'


def valeur(s):
    """« 21 883 082 », « 94.0 », « 27.44 » : chiffres tels que publiés, en notation française."""
    s = texte(s)
    if re.fullmatch(r'-?\d+(\.\d+)?', s):
        v = float(s)
        return (f'{v:,.0f}' if v == int(v) else f'{v:,.2f}'.rstrip('0').rstrip('.')).replace(',', ' ').replace('.', ',')
    return s


statuts_inconnus = {r['a'] for r in perf} - set(STATUT)
if statuts_inconnus:
    raise SystemExit(f'Appréciations inconnues : {statuts_inconnus}')
hors_budget = sorted({r['p'] for r in perf} - set(programmes))
par_prog = defaultdict(list)
for r in sorted(perf, key=lambda r: r['k']):
    if r['p'] in programmes:
        par_prog[r['p']].append(r)
for p, v in programmes.items():
    objectifs = []
    for r in par_prog.get(p, []):
        if not objectifs or objectifs[-1]['code'] != r['oc']:
            objectifs.append({'code': r['oc'], 'libelle': texte(r['o']), 'indicateurs': []})
        inds = objectifs[-1]['indicateurs']
        if not inds or inds[-1]['code'] != r['ic']:
            inds.append({'code': r['ic'], 'libelle': texte(r['i']), 'pour': r['f'], 'mesures': []})
        m = {'libelle': texte(r['s']), 'unite': texte(r['u']), 'cible': valeur(r['c']), 'realise': valeur(r['r']), 'statut': STATUT[r['a']]}
        if r['n1']:
            m['annee_precedente'] = valeur(r['n1'])
        inds[-1]['mesures'].append(m)
    v['objectifs'] = objectifs

# --- Sortie ---
tot = lambda k: sum(v['cp'][k] for v in programmes.values())
mesures = [m for v in programmes.values() for o in v['objectifs'] for i in o['indicateurs'] for m in i['mesures']]
compte = {s: sum(1 for m in mesures if m['statut'] == s) for s in ('atteinte', 'progres', 'non', 'nd')}
donnees = {
    '_note': (f"Détail par programme du budget général de l'État en {ANNEE}, en millions d'euros. cp et ae : crédits de paiement et autorisations "
              f"d'engagement, du vote à l'exécution (loi d'approbation des comptes {ANNEE}). categories : dépenses par catégorie de la loi "
              f"organique. actions : répartition prévue par le {loi} (prévision, pas exécution). objectifs : indicateurs de performance des "
              f"{source_perf}, avec la cible, le réalisé et l'appréciation officielle (atteinte, progres, non, nd = non renseignée ou non retenue)."),
    'annee': ANNEE,
    'source_actions': loi,
    'source_performance': source_perf,
    'categories': CATEGORIES,
    'totaux': {'cp': {k: arrondi(tot(k)) for k, _ in CP}, 'mesures': compte},
    'programmes': programmes,
}
with open(f'donnees/detail-etat-{ANNEE}.json', 'w', encoding='utf-8') as f:
    json.dump(donnees, f, ensure_ascii=False, separators=(',', ':'))
sans_actions = [p for p, v in programmes.items() if not v['actions']]
sans_perf = [p for p, v in programmes.items() if not v['objectifs']]
print(f'  -> donnees/detail-etat-{ANNEE}.json : {len(programmes)} programmes, {len(mesures)} mesures de performance {compte}')
print(f'     sans actions au {loi} : {", ".join(sans_actions) or "aucun"} ; sans indicateurs : {", ".join(sans_perf) or "aucun"}')
print(f'     indicateurs de programmes absents du budget général : {", ".join(hors_budget) or "aucun"} ; libellés manquants : {sans_libelle}')
