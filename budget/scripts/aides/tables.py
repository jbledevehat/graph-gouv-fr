# Étape 1 : lit les tableaux des annexes 1 à 4 (pages 48 à 78) du rapport.
# Usage : python3 scripts/tables.py rapport.pdf lignes.json
import pdfplumber, sys, json, warnings
warnings.filterwarnings("ignore")
out=[]
with pdfplumber.open(sys.argv[1]) as pdf:
    for n in range(48, 79):
        p=pdf.pages[n-1]
        for t in p.extract_tables():
            for row in t:
                out.append({"page":n,"row":[(c or "").replace("\n"," ").strip() for c in row]})
json.dump(out, open(sys.argv[2],"w"), ensure_ascii=False, indent=0)
print(len(out))
