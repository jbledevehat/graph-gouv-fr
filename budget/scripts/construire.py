# Construit les données du tableau de bord à partir des fichiers officiels de sources/ :
# - donnees/budget-etat-2024.json, lu par la page ;
# - des CSV réutilisables (dépenses par programme, recettes, rattachement des aides).
# Aucun chiffre n'est saisi à la main : tout vient des fichiers sources, des tables de
# rattachement de config/ (documentées) ou d'un calcul expliqué ci-dessous.
# Usage : python3 scripts/construire.py   (depuis la racine du projet)
import csv
import hashlib
import json
import re
from collections import Counter, defaultdict

EUR = 1e6  # Les montants publiés sont en euros ; la page travaille en millions d'euros.


def nombre(s):
    """Montant d'un CSV officiel (virgule décimale) ; 0 pour une case vide."""
    s = (s or '').strip().replace(' ', '').replace(' ', '')
    if s in ('', '-'):
        return 0.0
    return float(s.replace(',', '.'))


def lire(chemin, sep=';'):
    with open(chemin, encoding='utf-8-sig') as f:
        return list(csv.DictReader(f, delimiter=sep))


def numero_programme(libelle):
    """« Diplomatie culturelle et d'influence - 185 » -> « 185 »."""
    m = re.search(r'-\s*(\d+)\s*$', libelle.strip())
    return m.group(1) if m else None


# --- Ministère de chaque programme (PLF 2025, complété par config/) ---
ministere_du_programme = {}
for r in lire('sources/plf-2025/PLF2025-Depenses-selon-destination.csv'):
    ministere_du_programme[r['programme'].lstrip('0')] = r['libelle_ministere']
complements = {r['programme']: r for r in lire('config/programmes-hors-plf2025.csv')}
for p, r in complements.items():
    ministere_du_programme.setdefault(p, r['ministere'])

# --- Dépenses du budget général par programme ---
programmes = {}
for r in lire('sources/plrg-2024/Annexe1-Etat_CP-2024.csv'):
    p = numero_programme(r['Programme'])
    prog = programmes.setdefault(p, {
        'programme': p,
        'libelle': re.sub(r'\s*-\s*\d+\s*$', '', r['Programme']).strip(),
        'mission': r['Mission'],
        'ministere': ministere_du_programme.get(p),
        'credits_lfi': 0.0, 'credits_ouverts': 0.0, 'depenses': 0.0,
        'nature': defaultdict(float), 'transferts_entreprises': 0.0,
        'source_ministere': 'PLF 2025' if p not in complements else 'config/programmes-hors-plf2025.csv',
    })
    prog['credits_lfi'] += nombre(r['LFI'])
    prog['credits_ouverts'] += nombre(r['Total_CP_Ouverts'])
    prog['depenses'] += nombre(r['Depenses_constatees'])
sans_ministere = [p for p, v in programmes.items() if not v['ministere']]
if sans_ministere:
    raise SystemExit('Programmes sans ministère : ' + ', '.join(sans_ministere))

NATURES = {'1': 'Dotations des pouvoirs publics', '2': 'Personnel', '3': 'Fonctionnement', '4': 'Charge de la dette',
           '5': 'Investissement', '6': 'Interventions', '7': 'Opérations financières'}
for r in lire('sources/plrg-2024/Annexe1-Etat_Titre_Cat-2024.csv'):
    p = numero_programme(r['Programme'])
    titre = r['Titre'].replace('Titre', '').strip()
    programmes[p]['nature'][titre] += nombre(r['Depenses'])
    if r['Categorie'].strip() == '62':  # Titre 6, catégorie 62 : transferts aux entreprises
        programmes[p]['transferts_entreprises'] += nombre(r['Depenses'])
for v in programmes.values():
    if abs(sum(v['nature'].values()) - v['depenses']) > 1:
        raise SystemExit(f"Programme {v['programme']} : la ventilation par nature ne retombe pas sur le total")

# --- Recettes du budget général ---
recettes_lignes = lire('sources/plrg-2024/Annexe1-Etat_Recettes-2024.csv', sep=',')
sections = []
for r in recettes_lignes:
    if r['Niveau hiérarchique de la ligne'] != '3':
        continue
    libelle = r['Section'].replace(' (total)', '').strip()
    # Le CSV nomme « 17 (total) (total) » la section 18 « Autres remboursements et dégrèvements
    # d'impôts d'État » ; la notice PDF officielle (Annexe1-Etat_Recettes.pdf) la nomme correctement.
    if r['Section'].endswith('(total) (total)'):
        libelle = "18 - Autres remboursements et dégrèvements d'impôts d'État (non ventilés par impôt)"
    if r['Catégorie'] == 'Fonds de concours et attributions de produits' and libelle.startswith('Prélèvements'):
        continue  # ligne de prévision sans exécution, doublon de catégorie dans le fichier
    sections.append({
        'categorie': r['Catégorie'], 'section': libelle,
        'prevision': nombre(r['Total des prévisions']) / EUR,
        'brut': nombre(r['Total des recouvrements']) / EUR,
        'net': nombre(r['Total des recettes**']) / EUR,
    })
# Détail par impôt (montants bruts recouvrés, avant remboursements) et par prélèvement.
details = []
for r in recettes_lignes:
    if r['Niveau hiérarchique de la ligne'] != '2':
        continue
    details.append({
        'categorie': r['Catégorie'], 'section': r['Section'].strip(),
        'ligne': r['Ligne de prévision'].replace(' (total)', '').strip(),
        'prevision': nombre(r['Total des prévisions']) / EUR,
        'recouvre': nombre(r['Total des recouvrements']) / EUR,
    })
totaux_recettes = {r['Catégorie'].replace(' (total)', ''): {
    'prevision': nombre(r['Total des prévisions']) / EUR,
    'brut': nombre(r['Total des recouvrements']) / EUR,
    'net': nombre(r['Total des recettes**']) / EUR,
} for r in recettes_lignes if r['Niveau hiérarchique de la ligne'] == '4'}

# --- Équilibre du budget général (même calcul que l'article 1er du projet de loi) ---
rf = totaux_recettes['Recettes fiscales']
rnf = totaux_recettes['Recettes non fiscales']['net']
psr = -totaux_recettes["Prélèvements sur les recettes de l'État"]['net']
fdc = totaux_recettes['Fonds de concours et attributions de produits']['net']
rd_etat = programmes['200']['depenses'] / EUR
depenses_brutes_avec_fdc = sum(v['depenses'] for v in programmes.values()) / EUR
equilibre = {
    'recettes_fiscales_brutes': rf['brut'],
    'remboursements_degrevements_etat': rf['brut'] - rf['net'],
    'recettes_fiscales_nettes': rf['net'],
    'recettes_non_fiscales': rnf,
    'prelevements_sur_recettes': psr,
    'recettes_nettes_hors_fdc': rf['net'] + rnf - psr,
    'fonds_de_concours': fdc,
    # Les dépenses constatées du fichier incluent les fonds de concours : on les retire pour
    # retrouver les dépenses brutes de l'article 1er.
    'depenses_brutes_hors_fdc': depenses_brutes_avec_fdc - fdc,
    'programme_200': rd_etat,
    'depenses_nettes_hors_fdc': depenses_brutes_avec_fdc - fdc - rd_etat,
}
equilibre['solde_budget_general'] = equilibre['recettes_nettes_hors_fdc'] - equilibre['depenses_nettes_hors_fdc']

# --- Comptes spéciaux ---
comptes_speciaux = defaultdict(float)
for r in lire('sources/plrg-2024/Annexe2-Etat_CP-2024.csv'):
    comptes_speciaux[(r['Categorie'], r['Mission'])] += nombre(r['Depenses_constatees']) / EUR
equilibre['depenses_cas'] = sum(v for k, v in comptes_speciaux.items() if 'affectation' in k[0])
equilibre['depenses_ccf'] = sum(v for k, v in comptes_speciaux.items() if 'concours' in k[0])

# --- Dépenses fiscales ---
def montant_df(s):
    try:
        return float(s.replace(',', '.'))
    except ValueError:
        return None


depenses_fiscales = {}
for r in lire('sources/plrg-2024/ListDepFisc-PLRN-2024.csv'):
    depenses_fiscales[r['Numero_de_depense_fiscale']] = {
        'numero': r['Numero_de_depense_fiscale'], 'libelle': r['Libelle_de_la_depense_fiscale'],
        'impot': r['Impot'], 'programme': r['Numero_de_programme_principal'],
        'montant_2023': montant_df(r['Montant_N-1_definitif_(millions)']),
        'montant_2024': montant_df(r['Montant_N_actualise_(millions)']),
        'montant_2024_imprime': r['Montant_N_actualise_(millions)'],
    }

# --- Aides aux entreprises : rattachement à un ministère ---
src = json.load(open('sources/aides-entreprises/aides-entreprises-2024.json', encoding='utf-8'))
aides = [dict(zip(src['fields'], r)) for r in src['aides']]
regles = lire('config/aides-operateurs.csv')
PIA = re.compile(r'\bPIA|FRANCE 2030|FR2030|F2030', re.I)
PLAN_DE_RELANCE = {'362', '363', '364'}


def rattacher(a):
    """Renvoie (ministère, programme, règle, justification) pour une aide."""
    if a['annexe'] == 4:
        return ('Sécurité sociale (hors budget de l\'État)', None, 'cotisations',
                "Exonération ou allègement de cotisations sociales : moindre recette de la sécurité sociale, hors du budget de l'État.")
    if a['annexe'] == 2:
        df = depenses_fiscales.get(a['numero'].zfill(6))
        if df and df['programme'] in ministere_du_programme:
            return (ministere_du_programme[df['programme']], df['programme'], 'depense_fiscale',
                    f"Dépense fiscale n° {df['numero']} rattachée au programme {df['programme']} dans la liste officielle des dépenses fiscales.")
    progs = re.findall(r'(?:^|;)\s*(\d{3})\s*[-–]', a['rattachement'])
    progs = [p for p in progs if p in ministere_du_programme]
    # La mission Plan de relance (programmes 362 à 364) est temporaire et transversale : quand le
    # rapport cite aussi un programme ministériel, c'est lui qui désigne le ministère.
    hors_relance = [p for p in progs if p not in PLAN_DE_RELANCE]
    if hors_relance and hors_relance[0] != progs[0]:
        return (ministere_du_programme[hors_relance[0]], hors_relance[0], 'programme',
                f"Premier programme cité par le rapport hors plan de relance : {hors_relance[0]} (le rapport cite d'abord le programme {progs[0]}).")
    if progs:
        return (ministere_du_programme[progs[0]], progs[0], 'programme',
                f"Premier programme de rattachement cité par le rapport : {progs[0]}.")
    if PIA.search(a['nom']) and a['annexe'] in (1, 3):
        operateur = a['rattachement'].split(';')[0].strip()
        for r in regles:
            if operateur.startswith(r['operateur']) and r['motif_dans_le_nom'] and PIA.search(r['motif_dans_le_nom']):
                return (r['ministere'], None, 'operateur', r['justification'])
    operateur = a['rattachement'].split(';')[0].strip()
    for r in regles:
        if not operateur.startswith(r['operateur']):
            continue
        motif = r['motif_dans_le_nom']
        if motif and not re.search(motif, a['nom'], re.I):
            continue
        return (r['ministere'], None, 'operateur', r['justification'])
    raise SystemExit(f"Aide sans rattachement : {a['nom']} ({a['rattachement']})")


ANNEXES = {1: 'Aides budgétaires', 2: 'Aides fiscales', 3: 'Aides financières', 4: 'Cotisations sociales'}
aides_out = []
for a in aides:
    ministere, prog, regle, justification = rattacher(a)
    aides_out.append({
        'annexe': a['annexe'], 'instrument': ANNEXES[a['annexe']], 'perimetre': a['perimetre'],
        'numero': a['numero'], 'nom': a['nom'], 'rattachement_rapport': a['rattachement'],
        'montant': a['montant'], 'montant_imprime': a['montant_imprime'], 'page': a['page'],
        'ministere': ministere, 'programme': prog, 'regle': regle, 'justification': justification,
    })

# --- Sortie JSON (millions d'euros) ---
def arrondi(v, n=3):
    return None if v is None else round(v, n)


aides_par_df = defaultdict(list)
for a in aides_out:
    if a['annexe'] == 2:
        aides_par_df[a['numero'].zfill(6)].append(a)

sources = lire('config/sources.csv')
donnees = {
    'meta': {
        'exercice': 2024,
        'unite': "millions d'euros",
        'sources': [{**{k: s[k] for k in ('fichier', 'jeu_de_donnees', 'producteur', 'url', 'page_du_jeu', 'licence', 'telecharge_le', 'contenu')},
                     'sha256': hashlib.sha256(open(s['fichier'], 'rb').read()).hexdigest()} for s in sources],
        'regles_aides': dict(Counter(a['regle'] for a in aides_out)),
        'equilibre_officiel_url': 'https://www.senat.fr/leg/pjl24-718.html',
        # Chiffres repris tels quels de l'article 1er, faute de fichiers détaillés retenus ici.
        'officiel_non_recalcule': {r['cle']: {'libelle': r['libelle'], 'montant': round(float(r['montant_euros'].replace(',', '.')) / EUR, 3)}
                                   for r in lire('config/officiel-non-recalcule.csv')},
        'natures': NATURES,
    },
    'equilibre': {k: arrondi(v) for k, v in equilibre.items()},
    'programmes': [{
        'programme': v['programme'], 'libelle': v['libelle'], 'mission': v['mission'], 'ministere': v['ministere'],
        'source_ministere': v['source_ministere'],
        'lfi': arrondi(v['credits_lfi'] / EUR), 'ouverts': arrondi(v['credits_ouverts'] / EUR),
        'depenses': arrondi(v['depenses'] / EUR),
        'nature': {k: arrondi(x / EUR) for k, x in sorted(v['nature'].items())},
        'transferts_entreprises': arrondi(v['transferts_entreprises'] / EUR),
    } for v in sorted(programmes.values(), key=lambda v: -v['depenses'])],
    'recettes': {'totaux': {k: {kk: arrondi(x) for kk, x in v.items()} for k, v in totaux_recettes.items()},
                 'sections': [{**s, 'prevision': arrondi(s['prevision']), 'brut': arrondi(s['brut']), 'net': arrondi(s['net'])} for s in sections],
                 'details': [{**d, 'prevision': arrondi(d['prevision']), 'recouvre': arrondi(d['recouvre'])} for d in details]},
    'comptes_speciaux': [{'categorie': k[0], 'mission': k[1], 'depenses': arrondi(v)} for k, v in sorted(comptes_speciaux.items(), key=lambda x: -x[1])],
    'depenses_fiscales': [{**d, 'aide': bool(aides_par_df.get(n)), 'perimetre_aide': (aides_par_df[n][0]['perimetre'] if aides_par_df.get(n) else None)}
                          for n, d in sorted(depenses_fiscales.items(), key=lambda x: -(x[1]['montant_2024'] or 0))],
    'aides': aides_out,
}
with open('donnees/budget-etat-2024.json', 'w', encoding='utf-8') as f:
    json.dump(donnees, f, ensure_ascii=False, separators=(',', ':'))
print('  -> donnees/budget-etat-2024.json')


# --- CSV réutilisables ---
def ecrire_csv(chemin, colonnes, lignes):
    with open(chemin, 'w', newline='', encoding='utf-8-sig') as f:
        w = csv.writer(f, delimiter=';')
        w.writerow(colonnes)
        for ligne in lignes:
            w.writerow(['' if x is None else (str(x).replace('.', ',') if isinstance(x, float) else x) for x in ligne])
    print(f'  -> {chemin}')


ecrire_csv('donnees/depenses-2024-par-programme.csv',
           ['ministere', 'mission', 'programme', 'libelle', 'credits_lfi_meur', 'credits_ouverts_meur', 'depenses_2024_meur',
            'personnel_meur', 'fonctionnement_meur', 'interventions_meur', 'investissement_meur', 'transferts_aux_entreprises_meur', 'source_du_ministere'],
           [[p['ministere'], p['mission'], p['programme'], p['libelle'], p['lfi'], p['ouverts'], p['depenses'],
             p['nature'].get('2', 0.0), p['nature'].get('3', 0.0), p['nature'].get('6', 0.0), p['nature'].get('5', 0.0),
             p['transferts_entreprises'], p['source_ministere']] for p in donnees['programmes']])
ecrire_csv('donnees/recettes-2024.csv', ['categorie', 'section', 'prevision_meur', 'recouvre_brut_meur', 'net_meur'],
           [[s['categorie'], s['section'], s['prevision'], s['brut'], s['net']] for s in donnees['recettes']['sections']])
ecrire_csv('donnees/aides-2024-rattachement-ministere.csv',
           ['instrument', 'perimetre', 'numero', 'nom', 'montant_meur', 'montant_imprime', 'page_du_rapport', 'ministere', 'programme', 'regle', 'justification'],
           [[a['instrument'], 'socle' if a['perimetre'] == 'P1' else 'élargi', a['numero'], a['nom'], a['montant'], a['montant_imprime'], a['page'],
             a['ministere'], a['programme'], a['regle'], a['justification']] for a in aides_out])
