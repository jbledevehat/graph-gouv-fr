# Étape 2 : normalise les lignes (une par dispositif) et compare les sommes aux totaux imprimés.
# Usage : python3 scripts/norm.py lignes.json aides.json
import json, sys, csv
rows=json.load(open(sys.argv[1]))
def num(s):
    s=s.replace(' ','').replace('\xa0','').replace(' ','')
    return None if s in ('-','','ε','nc','n.c.') else float(s.replace(',','.'))
out=[]; totaux=[]; rejets=[]
for x in rows:
    p=x['page']; r=x['row']
    if p<=56: ann='1 - Aides budgétaires directes'; n=len(r)==7
    elif p<=74: ann='2 - Aides fiscales'; n=len(r)==6
    elif p<=76: ann='3 - Aides financières'; n=len(r)==5
    else: ann='4 - Exonérations et allègements de cotisations sociales'; n=len(r)==6
    if not n: continue
    txt=' '.join(r)
    if 'Total' in txt:
        totaux.append((ann,txt.strip())); continue
    if p<=56: d=dict(numero='',nom=r[0],rattachement=r[1],type=r[2],perim=r[3],montant=r[4])
    elif p<=74: d=dict(numero=r[0],nom=r[1],rattachement=r[2],type=r[3],perim=r[4],montant=r[5])
    elif p<=76: d=dict(numero='',nom=r[0],rattachement=r[1],type=r[2],perim=r[3],montant=r[4])
    else: d=dict(numero='',nom=r[0],rattachement=r[1]+' / '+r[2],type=r[3],perim=r[4],montant=r[5])
    if d['perim'] not in ('P1','P2'):
        # Suite d'un rattachement coupé par un saut de page : on la recolle à la ligne précédente.
        if not r[0].strip() and r[1].strip() and not any(c.strip() for c in r[2:]) and out:
            out[-1]['rattachement'] += ' ' + r[1].strip()
            print('SUITE RECOLLEE', p, out[-1]['nom'][:60])
            continue
        rejets.append((p,r)); continue
    d['annexe']=ann; d['page']=p; d['montant_texte']=d['montant']; d['montant_meur']=num(d.pop('montant'))
    out.append(d)
json.dump(out,open(sys.argv[2],'w'),ensure_ascii=False)
for r in rejets: print('REJET',r)
from collections import defaultdict
s=defaultdict(float); c=defaultdict(int)
for d in out:
    s[(d['annexe'],d['perim'])]+=d['montant_meur'] or 0; c[(d['annexe'],d['perim'])]+=1
for k in sorted(s): print(k, c[k], round(s[k],1))
print('TOTAL', len(out), round(sum(s.values()),1), 'P1', round(sum(v for k,v in s.items() if k[1]=='P1'),1), 'P2', round(sum(v for k,v in s.items() if k[1]=='P2'),1))
for t in totaux: print(t)
print('non chiffrés', sum(1 for d in out if d['montant_meur'] is None))
