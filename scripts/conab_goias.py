"""Resume dados da CONAB de Goiás (produtividade histórica, previsão 2026/27, progresso de semeadura) para a Estrela.
Uso: python3 scripts/conab_goias.py PASTA_COM_OS_ARQUIVOS   (nomes terminam em SerieHist.xls, previsao...nov-2026.xlsx, plantio-e-colheita-*.xlsx)
Saídas: public/data/conab-goias.json e o resumo dentro de worker/estela-worker.js (entre os marcadores CONAB)."""
import sys, glob, json, re, os, pandas as pd
pasta = sys.argv[1]
def achar(padrao):
    f = sorted(glob.glob(os.path.join(pasta, padrao)));  return f[-1] if f else None
SERIES = {"Soja": "*-SojaSerieHist.xls", "Milho 1ª safra": "*Milho1aSerieHist.xls", "Feijão 1ª safra": "*Feijao1aSerieHist.xls",
          "Sorgo": "*SorgoSerieHist.xls", "Trigo": "*TrigoSerieHist.xls"}
def num(x):
    try: return float(x)
    except: return None
out = {"fonte": "CONAB, séries históricas e levantamentos de safra", "uf": "GO (Goiás, estado; não é dado de Rio Verde)", "produtividade_kg_ha": {}, "previsao_2026_27": {}, "semeadura_2026_27": {}}
linhas = ["CONAB, Goiás (dado do ESTADO, não do município). Produtividade média em kg/ha (sc/ha = kg/ha ÷ 60 para soja, milho, feijão, sorgo, trigo)."]
for nome, pad in SERIES.items():
    f = achar(pad)
    if not f: continue
    d = pd.read_excel(f, sheet_name="Produtividade", header=None); hdr = [re.sub(r"\s+", " ", str(h).replace(".0", "")) for h in d.iloc[5].tolist()]
    go = d[d[0] == "GO"].iloc[0].tolist(); br = d[d[0] == "BRASIL"].iloc[0].tolist()
    idx = [i for i in range(len(hdr) - 10, len(hdr)) if num(go[i]) is not None]
    ser = {hdr[i].replace(" Previsão (¹)", " (previsão)"): round(num(go[i])) for i in idx}
    out["produtividade_kg_ha"][nome] = {"GO": ser, "Brasil": {hdr[i].replace(" Previsão (¹)", " (previsão)"): round(num(br[i])) for i in idx}}
    linhas.append(f"- {nome}, GO: " + "; ".join(f"{k}: {v}" for k, v in ser.items()))
f = achar("*SorgoSerieHist.xls")
# algodão em caroço
f = achar("*Algod*SerieHist.xls")
if f:
    d = pd.read_excel(f, sheet_name="Produtividade Algodão em Caroço", header=None); hdr = [re.sub(r"\s+", " ", str(h).replace(".0", "")) for h in d.iloc[5].tolist()]
    go = d[d[0] == "GO"].iloc[0].tolist(); idx = [i for i in range(len(hdr) - 6, len(hdr)) if num(go[i]) is not None]
    ser = {hdr[i].replace(" Previsão (¹)", " (previsão)"): round(num(go[i])) for i in idx}
    out["produtividade_kg_ha"]["Algodão em caroço"] = {"GO": ser}
    linhas.append("- Algodão em caroço, GO (kg/ha): " + "; ".join(f"{k}: {v}" for k, v in ser.items()))
# previsão do levantamento mais recente
f = achar("*previsao_de_safra-por_produto-nov-2026.xlsx")
if f:
    x = pd.ExcelFile(f); linhas.append("Previsão CONAB para GO, safra 2026/27 (levantamento de nov/2026), área em mil ha, produtividade kg/ha, variação sobre 2025/26:")
    for aba, nome in [("Soja", "Soja"), ("Milho 1a", "Milho 1ª safra"), ("Milho 2a", "Milho 2ª safra"), ("Feijão Total", "Feijão total"), ("Sorgo", "Sorgo"), ("Trigo", "Trigo (safra 2026)")]:
        if aba not in x.sheet_names: continue
        d = x.parse(aba, header=None); r = d[d[0].astype(str).str.strip() == "GO"]
        if r.empty: continue
        r = r.iloc[0].tolist()
        out["previsao_2026_27"][nome] = {"area_mil_ha": num(r[2]), "produtividade_kg_ha": round(num(r[5])), "variacao_produtividade_pct": num(r[6]), "area_var_pct": num(r[3])}
        linhas.append(f"- {nome}: área {num(r[2])} mil ha ({num(r[3]):+.1f}%), produtividade {round(num(r[5]))} kg/ha ({num(r[6]):+.1f}%)")
# progresso de semeadura (arquivo mais recente)
f = achar("*plantio-e-colheita-*.xlsx")
if f:
    d = pd.read_excel(f, header=None); data = None; cultura = None; etapa = None; achou = {}
    for i in range(len(d)):
        a = str(d.iloc[i, 1])
        if "Safra 20" in a: cultura = a.split(" - ")[0].strip()
        elif a in ("Semeadura", "Colheita"): etapa = a
        elif hasattr(d.iloc[i, 4], "year"):
            if data is None and d.iloc[i, 4] == d.iloc[i, 4]: data = d.iloc[i, 4]
        if a == "Goiás" and cultura in ("Soja", "Milho 1ª", "Feijão 1ª", "Arroz") and etapa == "Semeadura":
            achou.setdefault(cultura, [num(v) for v in d.iloc[i, 2:6]])
    dt = data.strftime("%d/%m/%Y") if data is not None else "última semana"
    linhas.append(f"Progresso de semeadura em GO, safra 2026/27, semana até {dt} (fração da área; [mesma semana de 2025, semana anterior, esta semana, média de 5 anos]):")
    for c, v in achou.items():
        out["semeadura_2026_27"][c] = {"semana_ate": dt, "ano_anterior": v[0], "semana_anterior": v[1], "semana_atual": v[2], "media_5_anos": v[3]}
        linhas.append(f"- {c}: {v[2]*100:.0f}% semeado (semana anterior {v[1]*100:.0f}%; 2025: {v[0]*100:.0f}%; média 5 anos: {v[3]*100:.0f}%)")
texto = "\n".join(linhas)
json.dump(out, open("public/data/conab-goias.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
w = open("worker/estela-worker.js", encoding="utf-8").read()
serie_go = {k: v["GO"] for k, v in out["produtividade_kg_ha"].items()}
bloco = ("// >>> CONAB (gerado por scripts/conab_goias.py; não editar à mão)\nconst CONAB_GOIAS = " + json.dumps(texto, ensure_ascii=False) + ";\n"
         "const GO_YIELD_KG = " + json.dumps(serie_go, ensure_ascii=False, separators=(",", ":")) + ";\n// <<< CONAB\n\n")
if "// >>> CONAB" in w:
    w = re.sub(r"// >>> CONAB.*?// <<< CONAB\n\n", lambda m: bloco, w, flags=re.S)
else:
    w = w.replace("const SYSTEM =", bloco + "const SYSTEM =", 1)
    w = w.replace("'e lembre que o produtor deve conferir a portaria vigente com o agrônomo. Se a cultura não estiver na tabela, diga que não há dado.\\n\\n' + ZARC_RIO_VERDE;",
                  "'e lembre que o produtor deve conferir a portaria vigente com o agrônomo. Se a cultura não estiver na tabela, diga que não há dado.\\n\\n' + ZARC_RIO_VERDE + '\\n\\n' +\n  'Para produtividade média, previsão de safra e andamento do plantio, use SOMENTE os dados da CONAB abaixo (são do estado de Goiás, não de Rio Verde: diga isso e cite \"CONAB\"). ' +\n  'Não compare com a produtividade da fazenda sem dizer que a média estadual é só uma referência.\\n\\n' + CONAB_GOIAS;")
open("worker/estela-worker.js", "w", encoding="utf-8").write(w)
print(texto); print(len(texto), "caracteres")
