# Écrit donnees/jeunesse.json : l'argent public consacré à la jeunesse, lu par la page jeunesse.html.
# - État : le document de politique transversale « Politique en faveur de la jeunesse », annexé
#   chaque année au projet de loi de finances. Son tableau « Récapitulation des crédits par
#   programme » donne, programme par programme et action par action, la part des crédits que
#   chaque ministère consacre aux jeunes : exécution de l'année passée, loi de finances de l'année
#   en cours, projet pour l'année suivante. On lit les documents 2025, 2026 et 2027 (exécution 2023,
#   2024 et 2025, loi de finances 2026, projet 2027), puis les dépenses fiscales.
# - Toutes les administrations : l'enseignement selon les comptes de l'Insee (donnees/argent-public-AAAA.json),
#   par administration qui le paie, et les repères du rapport sur les politiques de l'enfance 2027
#   (aide sociale à l'enfance des départements, sécurité sociale), recopiés de sa synthèse.
# Les montants sont lus à leur place dans la page du PDF (colonne par colonne), sans saisie à la main,
# et les contrôles arrêtent le script en cas d'écart avec le total publié.
# Dépendance : pdfplumber (pip install pdfplumber).
# Usage : python3 scripts/jeunesse.py   (depuis la racine du projet, après construire.py)
import json
import re
import sys
from collections import defaultdict

import pdfplumber

SRC = 'sources/jeunesse'
EUR = 1e6
DOCS = [
    # fichier, colonnes du tableau (dans l'ordre : AE puis CP pour chacune des trois années)
    # Le document a été supprimé par la loi de finances pour 2022 (art. 171) et rétabli pour 2025 :
    # il n'y a pas d'édition 2023 ni 2024, donc pas d'exécution 2021 ni 2022.
    ('DPT-jeunesse-PLF2022.pdf', ['execution_2020', 'lfi_2021', 'plf_2022']),
    ('DPT-jeunesse-PLF2025.pdf', ['execution_2023', 'lfi_2024', 'plf_2025']),
    ('DPT-jeunesse-PLF2026.pdf', ['execution_2024', 'lfi_2025', 'plf_2026']),
    ('DPT-jeunesse-PLF2027.pdf', ['execution_2025', 'lfi_2026', 'plf_2027']),
]
NUM = re.compile(r'^-?\d{1,3}$')


def texte(s):
    return re.sub(r'\s+', ' ', s).strip()


def lignes(page, tol=3):
    """Mots de la page regroupés en lignes (même hauteur, à quelques points près)."""
    mots = sorted(page.extract_words(keep_blank_chars=False), key=lambda w: (w['top'], w['x0']))
    out = []
    for w in mots:
        if out and abs(out[-1][0] - w['top']) <= tol:
            out[-1][1].append(w)
        else:
            out.append([w['top'], [w]])
    return [sorted(l[1], key=lambda w: w['x0']) for l in out]


def colonnes(page, mots_entete):
    """Centres des colonnes de montants, d'après les mots de l'en-tête de la page."""
    cs = sorted((w['x0'] + w['x1']) / 2 for w in page.extract_words() if w['text'] in mots_entete and w['x0'] > 150)
    return cs


def montants(ligne, centres, xmin):
    """Montants d'une ligne, rangés dans la colonne dont le centre est le plus proche."""
    par = defaultdict(list)
    libelle = []
    for w in ligne:
        if w['x0'] >= xmin and (NUM.match(w['text']) or w['text'] == '-'):
            c = min(range(len(centres)), key=lambda i: abs(centres[i] - (w['x0'] + w['x1']) / 2))
            par[c].append(w['text'])
        else:
            libelle.append(w['text'])
    vals = {}
    for c, ts in par.items():
        s = ''.join(t for t in ts if t != '-')
        vals[c] = float(s) if s else None
    return texte(' '.join(libelle)), vals


def recapitulatif(fichier, annees):
    pdf = pdfplumber.open(f'{SRC}/{fichier}')
    # Le tableau s'intitule « Récapitulation des crédits par programme » depuis 2025, « Évaluation des crédits
    # consacrés à la politique transversale » auparavant.
    TITRES = ('RECAPITULATION DES CREDITS PAR PROGRAMME', 'ÉVALUATION DES CRÉDITS CONSACRÉS À LA POLITIQUE TRANSVERSALE')
    pages = [i for i, p in enumerate(pdf.pages) if any(t in (p.extract_text() or '') for t in TITRES)]
    assert pages, f'{fichier} : tableau récapitulatif introuvable'
    lignes_tab, total, fini = [], None, False
    i = pages[0]
    while not fini:
        page = pdf.pages[i]
        centres = colonnes(page, ('Autorisations', 'Crédits'))
        assert len(centres) == 6, f'{fichier}, page {i + 1} : {len(centres)} colonnes'
        xmin = centres[0] - 40
        dedans = i != pages[0]
        for l in lignes(page):
            t = texte(' '.join(w['text'] for w in l))
            if t.startswith(('RECAPITULATION DES CREDITS', 'ÉVALUATION DES CRÉDITS CONSACRÉS')):
                dedans = True
                continue
            # En-têtes de page des éditions anciennes : « PLF 2022 130 », titre du document, titre de partie.
            if re.fullmatch(r'PLF \d{4} \d+', t) or t in ('Politique en faveur de la jeunesse', 'PRÉSENTATION DES CRÉDITS PAR PROGRAMME DPT', 'PRÉSENTATION DES CRÉDITS PAR PROGRAMME'):
                continue
            if not dedans or t.startswith(('Numéro et intitulé', 'ou du PSR', 'Exécution 20', 'Annexe au projet')) or re.fullmatch(r'\d+', t):
                continue
            lib, vals = montants(l, centres, xmin)
            if lib == 'Total':
                total, fini = vals, True
                break
            lignes_tab.append((lib, vals))
        i += 1
    # Assemblage : une ligne qui commence par « P123 » ouvre un programme, par « 02 – » ou « 175-04 – »
    # une action ; les autres lignes prolongent le libellé (ou portent les montants) de la précédente.
    progs, cur = [], None
    for lib, vals in lignes_tab:
        m = re.match(r'^P(\d{3})\s*(?:–\s*)?(.*)$', lib)
        a = re.match(r'^(?:\d{3}-)?(\d{2})\s*–\s*(.*)$', lib)
        if m:
            cur = {'programme': m.group(1), 'libelle': m.group(2), 'v': vals, 'actions': []}
            progs.append(cur)
        elif a and cur:
            cur['actions'].append({'code': a.group(1), 'libelle': a.group(2), 'v': vals})
        elif cur:
            der = cur['actions'][-1] if cur['actions'] else cur
            if lib:
                der['libelle'] = texte(der['libelle'] + ' ' + lib)
            for c, v in vals.items():
                assert c not in der['v'], f'{fichier} : montant en double pour {der["libelle"]}'
                der['v'][c] = v
    # Les CP seulement (colonnes 1, 3, 5), en millions d'euros.
    def cp(vals):
        return {an: (round(vals[2 * k + 1] / EUR, 3) if vals.get(2 * k + 1) is not None else None) for k, an in enumerate(annees)}
    out = []
    for p in progs:
        out.append({'programme': p['programme'], 'libelle': p['libelle'], 'cp': cp(p['v']),
                    'actions': [{'code': a['code'], 'libelle': a['libelle'], 'cp': cp(a['v'])} for a in p['actions']]})
    # Contrôles : somme des programmes = total publié ; somme des actions = programme (quand il en a).
    tot = cp(total)
    for an in annees:
        s = sum(p['cp'][an] or 0 for p in out)
        assert abs(s - tot[an]) < 0.01, f'{fichier} {an} : programmes {s} ≠ total {tot[an]}'
        for p in out:
            if p['actions'] and any(a['cp'][an] is not None for a in p['actions']):
                sa = sum(a['cp'][an] or 0 for a in p['actions'])
                assert abs(sa - (p['cp'][an] or 0)) < 0.01, f'{fichier} {an} P{p["programme"]} : actions {sa} ≠ {p["cp"][an]}'
    # Dépenses fiscales (en millions d'euros), d'après les colonnes « Chiffrage ».
    fiscal, total_f = [], None
    for page in pdf.pages:
        if not any(t in (page.extract_text() or '') for t in ('PRESENTATION DES PRINCIPALES DEPENSES FISCALES', 'PRÉSENTATION DES PRINCIPALES DÉPENSES FISCALES')):
            continue
        centres = colonnes(page, ('Chiffrage',))
        assert len(centres) == 3
        suite = False  # le libellé continue jusqu'à la ligne « Bénéficiaires… »
        for l in lignes(page):
            lib, vals = montants(l, centres, centres[0] - 25)
            m = re.match(r'^(\d{6}) (.*)$', lib)
            if m:
                fiscal.append({'code': m.group(1), 'libelle': m.group(2), 'v': vals})
                suite = True
            elif lib == 'Total':
                total_f = vals
            elif lib.startswith('Bénéficiaires'):
                suite = False
            elif suite and lib and not vals:
                fiscal[-1]['libelle'] = texte(fiscal[-1]['libelle'] + ' ' + lib)
        break
    ans_f = [re.sub(r'\D', '', an) for an in annees]
    for f in fiscal:
        f['chiffrage'] = {ans_f[k]: f['v'].get(k) for k in range(3)}
        del f['v']
    for k in range(3):
        s = sum(f['chiffrage'][ans_f[k]] or 0 for f in fiscal)
        assert abs(s - (total_f.get(k) or 0)) < 0.5, f'{fichier} : dépenses fiscales {s} ≠ {total_f.get(k)}'
    return out, tot, fiscal


resultat = {'meta': {'sources': [d[0] for d in DOCS] + ['Jaune-politiques-enfance-PLF2027.pdf', 'argent-public-AAAA.json', 'collectivites/balances-fonction-AAAA.json'],
                     'unite': "millions d'euros (crédits de paiement)"}, 'etat': {}, 'fiscal': {}}
for fichier, annees in DOCS:
    progs, tot, fiscal = recapitulatif(fichier, annees)
    resultat['etat'][fichier] = {'annees': annees, 'total': tot, 'programmes': progs}
    resultat['fiscal'][fichier] = fiscal
    print(f'{fichier} : {len(progs)} programmes ; ' + ', '.join(f'{an} {tot[an] / 1000:.1f} Md€' for an in annees))

# Ministère de chaque programme : celui du budget de l'État (le plus récent disponible).
ministere = {}
for an in ('2023', '2024', '2025'):
    for p in json.load(open(f'donnees/budget-etat-{an}.json', encoding='utf-8'))['programmes']:
        ministere[p['programme']] = (p['ministere'], p['mission'], p['depenses'] if an != '2025' else None, an)
resultat['ministeres'] = {k: {'ministere': v[0], 'mission': v[1]} for k, v in ministere.items()}
# Contrôle : la part « jeunesse » d'un programme ne dépasse pas ce qu'il a dépensé (exécution 2024).
for an, f in (('2024', 'DPT-jeunesse-PLF2026.pdf'), ('2023', 'DPT-jeunesse-PLF2025.pdf')):
    dep = {p['programme']: p['depenses'] for p in json.load(open(f'donnees/budget-etat-{an}.json', encoding='utf-8'))['programmes']}
    for p in resultat['etat'][f]['programmes']:
        v = p['cp'][f'execution_{an}']
        if v and p['programme'] in dep:
            assert v <= dep[p['programme']] * 1.001 + 0.5, f'P{p["programme"]} {an} : jeunesse {v} > dépensé {dep[p["programme"]]}'

# Enseignement, toutes administrations (Insee) : par administration, en milliards d'euros.
resultat['enseignement'] = {}
for an in ('2019', '2020', '2021', '2022', '2023', '2024'):
    g = json.load(open(f'donnees/argent-public-{an}.json', encoding='utf-8'))
    resultat['enseignement'][an] = [{'secteur': s['code'], 'nom': s['nom'],
                                     'montant': next(f['montant'] for f in s['fonctions'] if f['code'] == 'GF09'),
                                     'sous': next(f['sous'] for f in s['fonctions'] if f['code'] == 'GF09')} for s in g['secteurs']]

# Salaires et cotisations des programmes de l'école et des études (thèmes « scolaire » et « sup » de la
# page), selon les comptes de l'État : la catégorie 22 (cotisations de l'État employeur) comprend la
# contribution au compte d'affectation spéciale « Pensions », qui paie les retraites des fonctionnaires.
ENSEIGNEMENT = ['140', '141', '139', '230', '214', '143', '185', '151', '150', '231', '142', '192']
resultat['personnel'] = {}
for an in ('2023', '2024', '2025'):
    cats = {k: p['categories'] for k, p in json.load(open(f'donnees/detail-etat-{an}.json', encoding='utf-8'))['programmes'].items()}
    pr = [c for c in ENSEIGNEMENT if c in cats]
    resultat['personnel'][an] = {'programmes': pr,
                                 'total': round(sum(sum(cats[c].values()) for c in pr), 3),
                                 'remunerations': round(sum(cats[c].get('21', 0) for c in pr), 3),
                                 'cotisations': round(sum(cats[c].get('22', 0) for c in pr), 3)}
print('Personnel :', ', '.join(f"{an} cotisations {v['cotisations'] / 1000:.1f} / {v['total'] / 1000:.1f} Md€" for an, v in resultat['personnel'].items()))

# Collectivités : dépenses par fonction (balances comptables de la DGFiP, sommes préparées par
# scripts/collectivites.py), en millions d'euros, par domaine et par catégorie de collectivité.
sys.path.insert(0, 'scripts')
from collectivites import fonction  # noqa: E402

def domaine(nomen, code):
    """Domaine « jeunesse » d'un code de fonction, selon la nomenclature (M57, M52 ou M14), ou None."""
    f = fonction(code)
    if not f:
        return None
    if nomen == 'M71':  # régions jusqu'en 2023 (fonction 1 : formation professionnelle et apprentissage)
        regles = [('11', 'formation_pro'), ('12', 'apprentissage'), ('13', 'sanitaire_social'), ('20', 'ens_communs'),
                  ('21', 'primaire'), ('22', 'secondaire'), ('23', 'superieur'), ('28', 'periscolaire'), ('2', 'ens_communs'),
                  ('33', 'jeunesse'), ('813', 'transport_scolaire')]
    elif nomen in ('M14', 'M14A'):
        if f.startswith('252'): return 'transport_scolaire'
        regles = [('20', 'ens_communs'), ('21', 'primaire'), ('22', 'secondaire'), ('23', 'superieur'),
                  ('24', 'formation_pro'), ('25', 'periscolaire'), ('42', 'jeunesse'), ('64', 'petite_enfance')]
    elif nomen == 'M52':
        regles = [('20', 'ens_communs'), ('21', 'primaire'), ('22', 'secondaire'), ('23', 'superieur'),
                  ('24', 'formation_pro'), ('28', 'periscolaire'), ('2', 'ens_communs'), ('33', 'jeunesse'),
                  ('41', 'pmi'), ('51', 'famille_enfance'), ('81', 'transport_scolaire')]
    else:  # M57 et M57 abrégée
        regles = [('20', 'ens_communs'), ('21', 'primaire'), ('22', 'secondaire'), ('24', 'secondaire'), ('23', 'superieur'),
                  ('25', 'formation_pro'), ('26', 'apprentissage'), ('27', 'sanitaire_social'), ('28', 'periscolaire'),
                  ('2', 'ens_communs'), ('33', 'jeunesse'), ('411', 'pmi'), ('421', 'famille_enfance'),
                  ('422', 'petite_enfance'), ('81', 'transport_scolaire')]
    return next((d for p, d in regles if f.startswith(p)), None)

resultat['collectivites'] = {}
for an in ('2019', '2020', '2021', '2022', '2023', '2024', '2025'):
    bal = json.load(open(f'sources/collectivites/balances-fonction-{an}.json', encoding='utf-8'))
    dom = defaultdict(lambda: defaultdict(float))
    for categ, nomen, code, fonc, inv in bal['lignes']:
        d = domaine(nomen, code)
        if d:
            dom[d][categ] += (fonc + inv) / EUR
    resultat['collectivites'][an] = {d: {c: round(v, 1) for c, v in sorted(cs.items()) if abs(v) >= 0.05} for d, cs in sorted(dom.items())}
# Contrôles : les sommes retombent sur les bulletins de la DGCL pour 2024 (BIS 203 et 205, fonctionnement
# seul) ; ici fonctionnement et investissement, donc au moins ces montants.
c24 = resultat['collectivites']['2024']
assert 9_800 < c24['primaire']['Commune'] + c24['periscolaire']['Commune'] + c24['ens_communs']['Commune'] + c24['secondaire'].get('Commune', 0) + c24['superieur'].get('Commune', 0) < 14_000
assert 1_700 < c24['jeunesse']['Commune'] < 3_500
assert 4_200 < c24['secondaire']['REG'] < 7_500
# L'aide sociale à l'enfance, la petite enfance et la PMI retombent sur la fonction « famille et enfants » de l'Insee (2024).
insee_fe = next(f for s in json.load(open('donnees/argent-public-2024.json', encoding='utf-8'))['secteurs'] if s['code'] == 'S1313'
                for f in s['fonctions'] if f['code'] == 'GF10')
insee_fe = next(x['montant'] for x in insee_fe['sous'] if x['code'] == 'GF1004') * 1000
dgfip_fe = sum(sum(c24[d].values()) for d in ('famille_enfance', 'petite_enfance', 'pmi'))
assert abs(dgfip_fe / insee_fe - 1) < 0.08, (dgfip_fe, insee_fe)
print('Collectivités :', ', '.join(f"{an} {sum(sum(v.values()) for v in c.values()) / 1000:.1f} Md€ (tous domaines)" for an, c in resultat['collectivites'].items()),
      f'; famille et enfants DGFiP {dgfip_fe / 1000:.1f} / Insee {insee_fe / 1000:.1f} Md€')

# Repères du rapport sur les politiques de l'enfance (0 à 18 ans), annexe au PLF 2027, synthèse
# (pages 129 à 131) : lus dans le texte du PDF, en millions d'euros.
pdf = pdfplumber.open(f'{SRC}/Jaune-politiques-enfance-PLF2027.pdf')
synthese = re.sub(r'\s+', ' ', ' '.join((pdf.pages[i].extract_text() or '') for i in range(127, len(pdf.pages))))
N3, N4 = r'\d{1,3}(?: \d{3}){2}', r'\d{1,3}(?: \d{3}){3}'
def lu(motif, unite=EUR):
    m = re.search(motif, synthese)
    assert m, f'rapport enfance : « {motif} » introuvable'
    return float(m.group(1).replace(' ', '')) / unite
resultat['enfance'] = {
    # Tableau des ministères : AE et CP de la LFI 2026, puis du PLF 2027 ; on garde les CP.
    'etat_lfi_2026': lu(rf'Total {N4} ({N4}) {N4} {N4}'),
    'etat_plf_2027': lu(rf'Total (?:{N4} ){{3}}({N4})'),
    'cnaf_2025': lu(rf'CNAF \(2025\) ({N4})'),
    'cnam_2024': lu(rf'CNAM \(2024\) ({N4})'),
    'cnsa_2026': lu(rf'CNSA \(2026\) ({N3})'),
    # Aide sociale à l'enfance des départements, dépenses nettes 2024 (en milliers d'euros dans le tableau).
    'ase_2024': lu(rf'Dépenses nettes : (?:{N3} ){{2}}({N3})', 1e3),
}
print('Rapport enfance :', ', '.join(f'{k} {v / 1000:.1f} Md€' for k, v in resultat['enfance'].items()))

json.dump(resultat, open('donnees/jeunesse.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('-> donnees/jeunesse.json')
