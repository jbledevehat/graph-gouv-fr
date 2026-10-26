# Étape 4 : produit le JSON de la page, avec les chiffres d'ensemble du rapport saisis à la main.
# Usage : python3 scripts/web.py aides.json donnees/aides-entreprises-2024.json
import json, sys
aides = json.load(open(sys.argv[1]))
aides.sort(key=lambda d: (d['annexe'][0], d['perim'], -(d['montant_meur'] or 0)))
fields = ['annexe', 'perimetre', 'numero', 'nom', 'rattachement', 'type', 'montant', 'montant_imprime', 'page']
rows = [[int(d['annexe'][0]), d['perim'], d['numero'], d['nom'], d['rattachement'], d['type'],
         d['montant_meur'], d['montant_texte'], d['page']] for d in aides]
meta = {
  "exercice": 2024,
  "source": "Rapport relatif aux aides publiques aux entreprises, annexe au projet de loi de finances pour 2027",
  "source_pdf": "https://www.tresor.economie.gouv.fr/Articles/54f1c35b-e6b0-4b6a-9929-1707e5c981ac/files/e0a8b1fa-faed-4809-9dc7-b06f0d1e2e0f",
  "source_page": "https://www.tresor.economie.gouv.fr/Articles/2026/10/14/aides-publiques-aux-entreprises-un-nouveau-jaune-budgetaire-pour-mieux-les-recenser",
  "pib_part": {"socle": 2.0, "elargi": 5.7},
  "annexes": {
    "1": {"label": "Aides budgétaires", "detail": "Subventions, prestations, prises en charge de retraites", "imprime": {"P1": 24306, "P2": 18996}},
    "2": {"label": "Aides fiscales", "detail": "Crédits et réductions d'impôt, tarifs réduits d'accise, taux réduits de TVA", "imprime": {"P1": 27071, "P2": 22585}},
    "3": {"label": "Aides financières", "detail": "Prêts, avances et garanties à des conditions plus favorables que le marché", "imprime": {"P1": 3926, "P2": 63}},
    "4": {"label": "Cotisations sociales", "detail": "Exonérations ciblées et allègements généraux de cotisations patronales", "imprime": {"P1": 4469, "P2": 64659}}
  },
  "objectifs": [
    ["Emploi et formation", 6.2, 81.8], ["Développement économique", 7.2, 17.8],
    ["Recherche et innovation", 13.0, 13.2], ["Énergie", 10.4, 10.6], ["Social", 5.2, 9.2],
    ["Retraite", 0, 8.0], ["Développement régional", 3.0, 6.4], ["Environnement et décarbonation", 3.9, 6.2],
    ["Agriculture et pêche", 5.2, 5.2], ["Culture et sport", 2.7, 4.7], ["Crise, événement exceptionnel", 2.8, 2.8]
  ],
  "estimations": [
    {"qui": "Ce rapport (PLF 2027)", "annee": 2024, "bas": 59.8, "haut": 166.1, "bas_label": "socle", "haut_label": "élargi"},
    {"qui": "Haut-commissariat à la stratégie et au plan", "annee": 2023, "bas": 82, "haut": 187, "bas_label": "premier périmètre", "haut_label": "second périmètre"},
    {"qui": "Commission d'enquête du Sénat", "annee": 2023, "bas": 108, "haut": 211, "bas_label": "sens strict", "haut_label": "sens large"}
  ],
  "hors_champ": [
    ["Aides des collectivités locales", None, "non incluses faute de données harmonisées"],
    ["Aides de l'Union européenne", None, "non incluses dans cette première édition"],
    ["Financements de Bpifrance aux conditions du marché", 23.4, "Md€, exclus (investisseur avisé)"],
    ["Prises de participation de l'État", 3.1, "Md€, exclues (investisseur avisé)"],
    ["Exemptions d'assiette (compléments de rémunération)", 14.7, "Md€, exclues (bénéficiaire : le salarié)"],
    ["Compensations pour charges de service public (hors soutien aux énergies alternatives et aux effacements)", 14.7, "Md€, exclues (contrepartie équivalente)"]
  ]
}
json.dump({"meta": meta, "fields": fields, "aides": rows}, open(sys.argv[2], 'w'), ensure_ascii=False, separators=(',', ':'))
print(len(rows))
