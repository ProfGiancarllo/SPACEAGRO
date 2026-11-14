"""Gera os dados de plantio (ZARC) de Rio Verde a partir do CSV do Ministério da Agricultura.
Uso: python3 scripts/zarc_rioverde.py caminho/dados-abertos-tabua-de-risco-safra-XXXX-YYYY.csv
Saídas: public/data/zarc-rioverde.json (completo) e worker/zarc-rioverde.txt (resumo para a Estrela)."""
import sys, json, pandas as pd
GEO = "5218805"  # Rio Verde (GO), código IBGE
MES = "jan fev mar abr mai jun jul ago set out nov dez".split()
SOLO = {"1": "Arenoso", "2": "Textura Média", "3": "Argiloso", "11": "AD1", "12": "AD2", "13": "AD3", "14": "AD4", "15": "AD5", "16": "AD6"}
CICLO = {"13": "Perene", "19": "Semiperene", "20": "Grupo I", "21": "Grupo II", "22": "Grupo III", "24": "Grupo IV", "25": "Grupo V", "26": "Grupo VI"}
DEC = [f"dec{i}" for i in range(1, 37)]
def lab(n):
    m, k = divmod(n - 1, 3); return f"{k+1}º dec {MES[m]}"
def faixas(ns):
    ns = sorted(ns); out = []; i = 0
    while i < len(ns):
        j = i
        while j + 1 < len(ns) and ns[j + 1] == ns[j] + 1: j += 1
        out.append(lab(ns[i]) if i == j else f"{lab(ns[i])} a {lab(ns[j])}"); i = j + 1
    return "; ".join(out)

d = pd.read_csv(sys.argv[1], sep=";", dtype=str, encoding="utf-8-sig")
d = d[d.geocodigo == GEO].copy()
safra = f"{d.SafraIni.iloc[0]}/{d.SafraFin.iloc[0]}"
reg = []
for _, r in d.iterrows():
    dec = {i + 1: int(r[c]) for i, c in enumerate(DEC) if int(r[c]) > 0}
    if not dec: continue
    reg.append({"cultura": r.Nome_cultura, "manejo": r.Nome_Outros_Manejos, "ciclo": CICLO.get(r.Cod_Ciclo, r.Cod_Ciclo),
                "solo": SOLO.get(r.Cod_Solo, r.Cod_Solo), "portaria": r.Portaria, "dec": dec})
json.dump({"fonte": "MAPA/SPA, Zoneamento Agrícola de Risco Climático (Tábua de Risco), dados abertos CC BY", "municipio": "Rio Verde (GO)",
           "geocodigo": GEO, "safra": safra, "legenda": "dec: decêndio (1=1º dec jan ... 36=3º dec dez) -> risco climático em %",
           "registros": reg}, open("public/data/zarc-rioverde.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))

# resumo em texto
linhas = [f"ZARC Rio Verde-GO, safra {safra} (MAPA). Risco climático de perda: 20%=menor, 30%, 40%=maior. Decêndio = 10 dias."]
df = pd.DataFrame(reg)
for (cult, man), g in df.groupby(["cultura", "manejo"]):
    n = len(g); por = {}
    for _, r in g.iterrows():
        for k, v in r["dec"].items(): por.setdefault(k, []).append(v)
    todos = [k for k, v in por.items() if len(v) == n]
    r20 = [k for k in todos if max(por[k]) == 20]
    mais = [k for k in por if k not in r20]
    t = f"- {cult} ({man.lower()}): risco 20% em todos os solos e ciclos: {faixas(r20) or 'nenhum'}"
    if mais:
        t += f". Só em alguns solos/ciclos ou com risco maior (30-40%): {faixas(mais)}"
    linhas.append(t)
open("worker/zarc-rioverde.txt", "w", encoding="utf-8").write("\n".join(linhas))
w = open("worker/estela-worker.js", encoding="utf-8").read()
import re as _re
w = _re.sub(r"(// >>> ZARC[^\n]*\nconst ZARC_RIO_VERDE = ).*?(;\n// <<< ZARC)", lambda m: m.group(1) + json.dumps("\n".join(linhas), ensure_ascii=False) + m.group(2), w, flags=_re.S)
open("worker/estela-worker.js", "w", encoding="utf-8").write(w)
print("\n".join(linhas)); print(len(reg), "registros;", len("\n".join(linhas)), "caracteres")
