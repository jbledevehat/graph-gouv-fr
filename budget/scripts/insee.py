# Construit donnees/argent-public-2024.json à partir des comptes de la Nation de l'Insee :
# dépenses de toutes les administrations publiques (État, opérateurs, collectivités, sécurité
# sociale) par fonction, recettes par nature, principaux impôts.
# Usage : python3 scripts/insee.py   (depuis la racine du projet)
import json
import sys

sys.path.insert(0, 'scripts')
import xlsx_simple  # noqa: E402

ANNEE = '2024'
SECTEURS = [
    ('S13111', 'État', "L'État au sens de la comptabilité nationale : ministères, et comptes spéciaux comme les pensions des fonctionnaires."),
    ('S1314', 'Sécurité sociale', 'Retraites de base et complémentaires, assurance maladie, famille, chômage, hôpitaux publics.'),
    ('S1313', 'Collectivités locales', 'Communes, intercommunalités, départements, régions et leurs établissements.'),
    ('S13112', "Opérateurs de l'État", "Organismes divers d'administration centrale : universités, France Travail, Bpifrance, agences…"),
]
FONCTIONS_COURTES = {
    'GF01': 'Services généraux', 'GF02': 'Défense', 'GF03': 'Ordre et sécurité', 'GF04': 'Affaires économiques',
    'GF05': 'Environnement', 'GF06': 'Logement et équipements collectifs', 'GF07': 'Santé',
    'GF08': 'Culture, loisirs et culte', 'GF09': 'Enseignement', 'GF10': 'Protection sociale',
}


def texte(x):
    return '' if x is None else str(x).strip()


# --- Dépenses consolidées par sous-secteur et par fonction (tableau 3.307) ---
t3307 = xlsx_simple.lignes('sources/insee/T_3307.xlsx', 'T_3307')
annees = [texte(c) for c in t3307[2]]
col = annees.index(ANNEE)
valeurs = {}
libelles = {}
for l in t3307:
    if not l or not texte(l[0]).startswith('S1'):
        continue
    valeurs[(texte(l[0]), texte(l[2]))] = l[col] if len(l) > col and isinstance(l[col], float) else 0.0
    libelles[texte(l[2])] = texte(l[3])

total_apu = valeurs[('S13', '_Z')]
secteurs = []
for code, nom, description in SECTEURS:
    fonctions = []
    for f in sorted(FONCTIONS_COURTES):
        sous = [{'code': k[1], 'libelle': libelles[k[1]].lstrip(' 0123456789.-').strip(), 'montant': round(v, 3)}
                for k, v in valeurs.items() if k[0] == code and k[1].startswith(f) and len(k[1]) == 6 and v > 0.0005]
        fonctions.append({'code': f, 'libelle': FONCTIONS_COURTES[f], 'libelle_officiel': libelles[f].split(' - ', 1)[-1],
                          'montant': round(valeurs[(code, f)], 3), 'sous': sorted(sous, key=lambda s: -s['montant'])})
    secteurs.append({'code': code, 'nom': nom, 'description': description, 'total': round(valeurs[(code, '_Z')], 3),
                     'fonctions': fonctions})

somme = sum(s['total'] for s in secteurs)
if abs(somme - total_apu) > 0.01:
    raise SystemExit(f'Les sous-secteurs ({somme}) ne retombent pas sur le total des administrations publiques ({total_apu})')

# --- Recettes et dépenses par nature (tableau 3.201) ---
t3201 = xlsx_simple.lignes('sources/insee/t_3201.xlsx')
entete = next(l for l in t3201 if l and len(l) > 2 and any(texte(c) == ANNEE or texte(c) == ANNEE + '.0' for c in l))
c01 = next(i for i, c in enumerate(entete) if texte(c) in (ANNEE, ANNEE + '.0'))
ligne = {texte(l[1]): l[c01] for l in t3201 if l and len(l) > c01 and texte(l[1]) and isinstance(l[c01], float)}
RECETTES = [
    ('Cotisations sociales nettes (D61)', 'Cotisations sociales', 'cotisations'),
    ('Impôts sur la production et les importations (D2)', 'Impôts sur la consommation et la production (TVA, taxes sur l’énergie, taxe foncière…)', 'production'),
    ('Impôts courants sur le revenu et le patrimoine (D5)', 'Impôts sur le revenu et le patrimoine (CSG, impôt sur le revenu, impôt sur les sociétés…)', 'revenu'),
    ('Impôts en capital à recevoir (D91r)', 'Droits de succession et de donation', 'revenu'),
    ('Impôts et cotisations dus non recouvrables nets (D995r)', 'Impôts et cotisations non recouvrables', 'autres'),
    ('Recettes de production', 'Ventes de biens et services (cantines, hôpitaux, péages…)', 'autres'),
    ('Revenus de la propriété', 'Revenus de la propriété (dividendes, intérêts, loyers)', 'autres'),
    ('Autres transferts', 'Autres transferts reçus', 'autres'),
]
recettes = [{'ligne_insee': k, 'libelle': lib, 'groupe': g, 'montant': round(ligne[k], 3)} for k, lib, g in RECETTES]
total_recettes = ligne['Total des recettes']
if abs(sum(r['montant'] for r in recettes) - total_recettes) > 0.01:
    raise SystemExit('Les recettes ne retombent pas sur le total du tableau 3.201')
NATURES = ['Dépenses de fonctionnement', 'Intérêts (D41)', 'Prestations et autres transferts', "Acquisitions moins cessions d'actifs non financiers"]
natures = [{'libelle': k, 'montant': round(ligne[k], 3)} for k in NATURES]
detail_natures = [{'libelle': k, 'montant': round(ligne[k], 3)} for k in (
    'Rémunération des salariés (D1)', 'Consommation intermédiaire (P2)', 'Prestations sociales autres que transferts sociaux en nature (D62)',
    'Transferts sociaux en nature de produits marchands (D632)', 'Subventions (D3)', 'Formation brute de capital fixe (P51g)')]

# --- Principaux impôts (tableau 3.217) ---
t3217 = xlsx_simple.lignes('sources/insee/t_3217.xlsx')
c17 = next(i for i, c in enumerate(t3217[1]) if texte(c) in (ANNEE, ANNEE + '.0'))
impots = []
categorie = None
for l in t3217[2:]:
    if not l or len(l) <= c17 or not texte(l[1]):
        continue
    lib = l[1]
    v = l[c17] if isinstance(l[c17], float) else None
    if texte(lib).startswith('Ensemble des impôts'):
        break
    if not lib.startswith(' '):
        categorie = texte(lib)
        impots.append({'libelle': categorie, 'niveau': 1, 'montant': v})
    elif not lib.startswith('   ') and v:
        impots.append({'libelle': texte(lib), 'niveau': 2, 'categorie': categorie, 'montant': v})

# --- Part dans le PIB (tableau 3.215, version provisoire) ---
t3215 = xlsx_simple.lignes('sources/insee/t_3215_prov.xlsx')
c15 = next(i for i, c in enumerate(t3215[1]) if texte(c) in (ANNEE, ANNEE + '.0'))
en_pct = False
part_pib = {}
for l in t3215:
    lib = texte(l[1]) if len(l) > 1 else ''
    if lib.startswith('En % du produit'):
        en_pct = True
    if lib == 'Ensemble':
        bloc = 'ensemble'
    elif lib:
        bloc = bloc if lib.startswith('-') else None
    if en_pct and bloc == 'ensemble' and lib in ('-Dépenses', '-Recettes') and isinstance(l[c15], float):
        part_pib[lib.strip('-').lower()] = round(l[c15], 2)

# --- Qui perçoit les impôts et les cotisations (tableaux 3.203, 3.204, 3.205, 3.212) ---
# Les impôts (après transferts de recettes fiscales entre administrations) et les cotisations se
# répartissent exactement entre les administrations. Les autres recettes, non : elles contiennent
# des flux entre administrations (intérêts, transferts en capital) que le total consolidé neutralise.
FICHIERS_SECTEURS = {'S13111': 't_3203', 'S13112': 't_3204', 'S1313': 't_3205', 'S1314': 't_3212'}


def recettes_du_secteur(fichier):
    t = xlsx_simple.lignes(f'sources/insee/{fichier}.xlsx')
    ent = next(l for l in t if l and any(texte(c) in (ANNEE, ANNEE + '.0') for c in l))
    c = next(i for i, x in enumerate(ent) if texte(x) in (ANNEE, ANNEE + '.0'))
    v, partie = {}, None
    for l in t:
        if l and len(l) > 1 and texte(l[1]) == 'RECETTES':
            partie = 'R'
        if partie == 'R' and l and len(l) > c and texte(l[1]) and isinstance(l[c], float):
            v[texte(l[1])] = l[c]
    impots = sum(v[k] for k in ('Impôts sur la production et les importations (D2)', 'Impôts courants sur le revenu et le patrimoine (D5)',
                                'Impôts en capital à recevoir (D91r)', 'Transferts de recettes fiscales  (D733)'.strip(),
                                'Impôts et cotisations dus non recouvrables nets (D995r)') if k in v)
    return {'impots': round(impots, 3), 'cotisations': round(v['Cotisations sociales nettes (D61)'], 3),
            'solde': round(v['Capacité (+) ou besoin (-) de financement (B9NF)'], 3)}


recettes_par_secteur = {code: recettes_du_secteur(f) for code, f in FICHIERS_SECTEURS.items()}
impots_apu = sum(ligne[k] for k in ('Impôts sur la production et les importations (D2)', 'Impôts courants sur le revenu et le patrimoine (D5)',
                                     'Impôts en capital à recevoir (D91r)', 'Impôts et cotisations dus non recouvrables nets (D995r)'))
for cle, attendu in (('impots', impots_apu), ('cotisations', ligne['Cotisations sociales nettes (D61)'])):
    calcule = sum(r[cle] for r in recettes_par_secteur.values())
    if abs(calcule - attendu) > 0.01:
        raise SystemExit(f'{cle} : la somme des administrations ({calcule}) ne retombe pas sur le total ({attendu})')
autres_consolidees = total_recettes - impots_apu - ligne['Cotisations sociales nettes (D61)']
for s in secteurs:
    s['recettes'] = recettes_par_secteur[s['code']]

donnees = {
    'meta': {'annee': int(ANNEE), 'unite': "milliards d'euros",
             'note': "Comptabilité nationale (base 2020), compte semi-définitif 2024. Dépenses consolidées : un transfert d'une administration publique à une autre n'est compté qu'une fois, chez celle qui dépense en dernier."},
    'total_depenses': round(total_apu, 3),
    'total_recettes': round(total_recettes, 3),
    'solde': round(ligne['Capacité (+) ou besoin (-) de financement (B9NF)'], 3),
    'part_pib': part_pib,
    'secteurs': secteurs,
    'recettes': recettes,
    'autres_recettes_consolidees': round(autres_consolidees, 3),
    'natures': natures,
    'detail_natures': detail_natures,
    'impots': impots,
}
with open('donnees/argent-public-2024.json', 'w', encoding='utf-8') as f:
    json.dump(donnees, f, ensure_ascii=False, separators=(',', ':'))
print('  -> donnees/argent-public-2024.json')
print(f"  dépenses {total_apu:.1f} ; recettes {total_recettes:.1f} ; solde {donnees['solde']:.1f} ; part du PIB {part_pib}")
