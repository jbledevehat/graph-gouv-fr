# Lecteur minimal de classeurs .xlsx, sans dépendance : renvoie les lignes d'une feuille sous forme
# de listes de valeurs (texte ou nombre). Suffisant pour les tableaux de l'Insee.
import re
import zipfile
import xml.etree.ElementTree as ET

NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
      'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}


def _colonne(ref):
    lettres = re.match(r'[A-Z]+', ref).group(0)
    n = 0
    for c in lettres:
        n = n * 26 + ord(c) - 64
    return n - 1


def lignes(chemin, feuille=None):
    """Lignes de la feuille nommée `feuille` (ou de la dernière feuille)."""
    with zipfile.ZipFile(chemin) as z:
        partages = []
        if 'xl/sharedStrings.xml' in z.namelist():
            for si in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('m:si', NS):
                partages.append(''.join(t.text or '' for t in si.iter('{%s}t' % NS['m'])))
        classeur = ET.fromstring(z.read('xl/workbook.xml'))
        feuilles = classeur.findall('m:sheets/m:sheet', NS)
        choix = next((f for f in feuilles if f.get('name') == feuille), feuilles[-1])
        rid = choix.get('{%s}id' % NS['r'])
        liens = ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
        cible = next(l.get('Target') for l in liens if l.get('Id') == rid)
        cible = cible.lstrip('/')
        if not cible.startswith('xl/'):
            cible = 'xl/' + cible
        donnees = ET.fromstring(z.read(cible))
    resultat = []
    for row in donnees.iter('{%s}row' % NS['m']):
        valeurs = {}
        for c in row.findall('m:c', NS):
            v = c.find('m:v', NS)
            t = c.get('t')
            if t == 'inlineStr':
                texte = ''.join(x.text or '' for x in c.iter('{%s}t' % NS['m']))
            elif v is None:
                continue
            elif t == 's':
                texte = partages[int(v.text)]
            elif t in ('str', 'e', 'b'):
                texte = v.text
            else:
                texte = float(v.text)
            valeurs[_colonne(c.get('r'))] = texte
        if valeurs:
            largeur = max(valeurs) + 1
            resultat.append([valeurs.get(i) for i in range(largeur)])
    return resultat
