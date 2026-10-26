# Produit le registre des sources (sources/SOURCES.md) à partir de config/sources.csv :
# pour chaque fichier, son origine exacte, son producteur, sa licence, sa date de téléchargement,
# sa taille et son empreinte SHA-256, qui permet de vérifier qu'il n'a pas été modifié.
# Usage : python3 scripts/registre.py   (depuis la racine du projet)
import csv
import hashlib
import os

with open('config/sources.csv', encoding='utf-8') as f:
    sources = list(csv.DictReader(f, delimiter=';'))

lignes = [
    '# Registre des sources',
    '',
    "Fichiers officiels utilisés, tels que téléchargés, sans aucune modification. L'empreinte SHA-256",
    "permet de vérifier qu'un fichier est identique à l'original : `shasum -a 256 <fichier>`.",
    'Ce registre est produit par `scripts/registre.py` à partir de `config/sources.csv`.',
    '',
]
for s in sources:
    chemin = s['fichier']
    with open(chemin, 'rb') as f:
        contenu = f.read()
    lignes += [
        f"## `{chemin}`",
        '',
        f"- **Contenu** : {s['contenu']}",
        f"- **Jeu de données** : {s['jeu_de_donnees']}",
        f"- **Producteur** : {s['producteur']}",
        f"- **Adresse du fichier** : <{s['url']}>",
        f"- **Page du jeu de données** : <{s['page_du_jeu']}>",
        f"- **Licence** : {s['licence']}",
        f"- **Téléchargé le** : {s['telecharge_le']}",
        f"- **Taille** : {len(contenu):,} octets".replace(',', ' '),
        f"- **SHA-256** : `{hashlib.sha256(contenu).hexdigest()}`",
        '',
    ]

manquants = [p for p in (os.path.join(r, n) for r, _, fs in os.walk('sources') for n in fs)
             if p not in {s['fichier'] for s in sources} and not p.endswith('SOURCES.md') and not p.endswith('.DS_Store')]
if manquants:
    raise SystemExit('Fichiers présents dans sources/ mais absents du registre : ' + ', '.join(manquants))

with open('sources/SOURCES.md', 'w', encoding='utf-8') as f:
    f.write('\n'.join(lignes))
print(f'  -> sources/SOURCES.md ({len(sources)} fichiers)')
