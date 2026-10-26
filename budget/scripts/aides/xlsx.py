# Étape 3 : produit le CSV et le classeur Excel (onglets Synthèse et Liste des aides).
# Usage : python3 scripts/xlsx.py aides.json donnees/
import json, sys, csv
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter
aides=json.load(open(sys.argv[1])); outdir=sys.argv[2]
aides.sort(key=lambda d:(d['annexe'], d['perim'], -(d['montant_meur'] or 0)))
cols=['Annexe','Périmètre','Libellé périmètre','Numéro (dépense fiscale)','Nom du dispositif','Rattachement (programme / ODAC / branche)','Type / catégorie','Montant 2024 (M€)','Montant tel qu’imprimé','Page du PDF']
lib={'P1':'Socle','P2':'Élargi'}
def row(d): return [d['annexe'],d['perim'],lib[d['perim']],d['numero'],d['nom'],d['rattachement'],d['type'],d['montant_meur'] if d['montant_meur'] is not None else 0,d['montant_texte'],d['page']]
with open(outdir+'/aides-entreprises-2024.csv','w',newline='',encoding='utf-8-sig') as f:
    w=csv.writer(f,delimiter=';'); w.writerow(cols); [w.writerow(row(d)) for d in aides]
wb=Workbook(); hd=Font(bold=True,color='FFFFFF'); fill=PatternFill('solid',fgColor='000091')
s=wb.active; s.title='Synthèse'
L=wb.create_sheet('Liste des aides')
L.append(cols)
for d in aides: L.append(row(d))
n=len(aides)+1
for c in L[1]: c.font=hd; c.fill=fill; c.alignment=Alignment(wrap_text=True,vertical='center')
for i,wd in enumerate([34,10,12,14,70,50,30,14,14,8],1): L.column_dimensions[get_column_letter(i)].width=wd
for r in range(2,n+1): L.cell(r,8).number_format='#,##0'
L.freeze_panes='A2'; L.auto_filter.ref=f'A1:J{n}'
s.append(['Aides publiques aux entreprises – exécution 2024'])
s.append(['Source : Rapport relatif aux aides publiques aux entreprises, annexe au PLF 2027 (annexes 1 à 4, p. 48-78)'])
s.append([])
s.append(['Annexe','Socle (P1) M€','Élargi (P2) M€','Total M€','Nb P1','Nb P2','Total imprimé dans le document (M€)'])
imp={'1':43301,'2':49656,'3':3989,'4':69128}
anns=sorted({d['annexe'] for d in aides}); r0=s.max_row+1
R=f"'Liste des aides'!"
for a in anns:
    r=s.max_row+1
    s.append([a,f'=SUMIFS({R}$H:$H,{R}$A:$A,$A{r},{R}$B:$B,"P1")',f'=SUMIFS({R}$H:$H,{R}$A:$A,$A{r},{R}$B:$B,"P2")',f'=B{r}+C{r}',f'=COUNTIFS({R}$A:$A,$A{r},{R}$B:$B,"P1")',f'=COUNTIFS({R}$A:$A,$A{r},{R}$B:$B,"P2")',imp[a[0]]])
r1=s.max_row; t=r1+1
s.append(['Total']+[f'=SUM({c}{r0}:{c}{r1})' for c in 'BCDEFG'])
s.append([])
s.append(['Note : dans l’annexe 1, la somme des lignes donne 24 833 M€ (P1) et 18 476 M€ (P2), alors que le document affiche 24 306 et 18 996 (total quasi identique : 43 309 contre 43 301). L’écart vient du document lui-même.'])
s.append(['Les montants « ε » (négligeable), « nc » (non chiffré) et « - » sont comptés pour 0 ; la colonne « Montant tel qu’imprimé » les conserve.'])
for c in s[4]: c.font=hd; c.fill=fill; c.alignment=Alignment(wrap_text=True)
s['A1'].font=Font(bold=True,size=14)
for c in s[t]: c.font=Font(bold=True)
for rr in range(r0,t+1):
    for cc in (2,3,4,7): s.cell(rr,cc).number_format='#,##0'
for i,wd in enumerate([52,16,16,14,8,8,22],1): s.column_dimensions[get_column_letter(i)].width=wd
wb.save(outdir+'/aides-entreprises-2024.xlsx'); print(len(aides))
