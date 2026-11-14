#!/usr/bin/env python3
"""MyRoça — saúde da lavoura por satélite (Sentinel-2 L2A via Microsoft Planetary Computer, leitura aberta).
Gera public/data/saude-talhoes.json com alertas de triagem (não é diagnóstico) para os talhões da fazenda de demonstração.
Uso: python scripts/saude_satelite.py   (a cada 2 dias roda sozinho em .github/workflows/saude-satelite.yml)"""
import json, os, sys, datetime as dt
import numpy as np, pandas as pd

HOJE = dt.date.today()
MAX_NUVEM = 70
MIN_PIXELS_VALIDOS = 0.5
RESOLUCAO = 10
AQUI = os.path.dirname(os.path.abspath(__file__))
TALHOES = json.load(open(os.path.join(AQUI, "talhoes_demo.json"), encoding="utf-8"))
SAIDA = os.path.join(AQUI, "..", "public", "data", "saude-talhoes.json")

# ---------- Curva esperada (aproximada) de NDVI por dias após o plantio (DAP)
GUIA = {
    "soja":  [(0, .20), (15, .28), (30, .50), (45, .72), (60, .84), (80, .86), (95, .80), (105, .60), (115, .35), (125, .25)],
    "milho": [(0, .20), (20, .35), (40, .65), (60, .85), (80, .88), (100, .80), (120, .55), (140, .30)],
}
FASES = {"soja": [(0, 15, "emergência"), (15, 45, "vegetativo"), (45, 75, "floração (R1-R2)"), (75, 105, "enchimento de grãos (R5)"), (105, 999, "maturação")],
         "milho": [(0, 20, "emergência"), (20, 60, "vegetativo"), (60, 85, "pendoamento e espigamento"), (85, 120, "enchimento de grãos"), (120, 999, "maturação")]}

def cultura_de(t):
    c = (t.get("cultura") or "").lower()
    return "soja" if "soja" in c else "milho" if "milho" in c else None

def guia(cultura, dap):
    pts = GUIA[cultura]
    return float(np.interp(dap, [p[0] for p in pts], [p[1] for p in pts]))

def fase(cultura, dap):
    for a, b, nome in FASES[cultura]:
        if a <= dap < b: return nome
    return "—"

# ---------- Índices (reflectância já em 0..1)
def indices(b04, b05, b08, b8a, b11):
    with np.errstate(invalid="ignore", divide="ignore"):
        ndvi = (b08 - b04) / (b08 + b04)
        ndre = (b8a - b05) / (b8a + b05)
        ndmi = (b08 - b11) / (b08 + b11)
    return ndvi, ndre, ndmi

# ---------- Busca das imagens de um talhão (Microsoft Planetary Computer)
def baixa_talhao(t, ini, fim):
    """Devolve lista de dicts: {data, b04, b05, b08, b8a, b11, valido} só com os pixels dentro do polígono."""
    from pystac_client import Client
    import planetary_computer as pc, odc.stac
    from shapely.geometry import Polygon
    from shapely.ops import transform as shp_transform
    import pyproj, rasterio.features
    poly = Polygon([(lng, lat) for lat, lng in t["poligono_lat_lng"]])
    bbox = poly.bounds
    cat = Client.open("https://planetarycomputer.microsoft.com/api/stac/v1", modifier=pc.sign_inplace)
    itens = cat.search(collections=["sentinel-2-l2a"], bbox=bbox, datetime=f"{ini}/{fim}", query={"eo:cloud_cover": {"lt": MAX_NUVEM}}).item_collection()
    if len(itens) == 0: return []
    ds = odc.stac.load(itens, bands=["B04", "B05", "B08", "B8A", "B11", "SCL"], bbox=bbox, crs="EPSG:32722", resolution=RESOLUCAO,
                       groupby="solar_day", resampling="nearest", chunks={}).compute()
    proj = pyproj.Transformer.from_crs("EPSG:4326", "EPSG:32722", always_xy=True).transform
    mascara = rasterio.features.rasterize([(shp_transform(proj, poly), 1)], out_shape=ds["B04"].shape[1:], transform=ds.odc.geobox.transform, fill=0).astype(bool)
    saida = []
    for i in range(ds.sizes["time"]):
        refl = lambda b: np.clip(ds[b].values[i].astype("float32") * 0.0001 - 0.1, 0, 1.5)   # reflectância (nível L2A, base 04.00+)
        scl = ds["SCL"].values[i]
        bom = np.isin(scl, (4, 5)) & mascara & (ds["B04"].values[i] > 0)
        if mascara.sum() == 0 or bom.sum() / mascara.sum() < MIN_PIXELS_VALIDOS: continue
        saida.append({"data": pd.Timestamp(ds.time.values[i]).date(), "b04": refl("B04"), "b05": refl("B05"), "b08": refl("B08"), "b8a": refl("B8A"), "b11": refl("B11"), "valido": bom, "dentro": mascara})
    return saida

def serie_e_mapas(t, imagens):
    linhas = []; ultimo = None
    for im in imagens:
        ndvi, ndre, ndmi = indices(im["b04"], im["b05"], im["b08"], im["b8a"], im["b11"])
        m = im["valido"] & np.isfinite(ndvi)
        if m.sum() < 20: continue
        linhas.append({"data": im["data"], "ndvi": float(np.median(ndvi[m])), "ndre": float(np.nanmedian(ndre[m])), "ndmi": float(np.nanmedian(ndmi[m])),
                       "ndvi_p10": float(np.percentile(ndvi[m], 10)), "ndvi_p90": float(np.percentile(ndvi[m], 90)), "pct_valido": float(m.sum() / im["dentro"].sum())})
        ultimo = {"data": im["data"], "ndvi": np.where(m, ndvi, np.nan), "ndmi": np.where(m, ndmi, np.nan)}
    return pd.DataFrame(linhas), ultimo
# ---------- Alertas de triagem
def analisa(t, df, ultimo, pares):
    cult = cultura_de(t); r = {"id": t["id"], "nome": t["nome"], "cultura": cult, "plantio_informado": t["plantio"], "alertas": [], "nivel": "ok"}
    plantio = pd.Timestamp(t["plantio"]).date() if t.get("plantio") else None
    if df.empty:
        r["alertas"].append("Sem imagem útil recente (nuvem ou falha de leitura). Nenhuma conclusão possível."); r["nivel"] = "sem_dado"; return r
    u = df.iloc[-1]; dias_sem = (HOJE - u["data"]).days
    r["ultima_imagem"] = {"data": str(u["data"]), "dias_atras": dias_sem, "ndvi": round(u["ndvi"], 3), "ndre": round(u["ndre"], 3), "ndmi": round(u["ndmi"], 3), "pct_valido": round(u["pct_valido"], 2)}
    if dias_sem > 12: r["alertas"].append(f"Última imagem útil há {dias_sem} dias (nuvens). Leitura desatualizada.")
    if cult and plantio:
        dap = (u["data"] - plantio).days
        r["dap_na_imagem"] = dap; r["fase_informada"] = fase(cult, dap)
        esp = guia(cult, dap); dev = u["ndvi"] - esp
        r["ndvi_esperado"] = round(esp, 3); r["desvio_vs_esperado"] = round(dev, 3)
        if dap < 0: r["alertas"].append("A imagem é anterior à data de plantio informada: confira a data no diário.")
        elif dev < -0.10 and len(df) >= 2 and (df.iloc[-2]["ndvi"] - guia(cult, (df.iloc[-2]["data"] - plantio).days)) < -0.08:
            r["alertas"].append(f"Vigor abaixo do esperado para {fase(cult, dap)} nas duas últimas imagens (NDVI {u['ndvi']:.2f} contra {esp:.2f} esperado)."); r["nivel"] = "atencao"
        elif dev > 0.15: r["alertas"].append(f"NDVI bem acima do esperado para a fase ({u['ndvi']:.2f} contra {esp:.2f}). Confira se a data de plantio informada está certa.")
    # comparação com talhões parecidos da fazenda
    if pares is not None and len(pares):
        ref = float(np.median(pares)); r["ndvi_mediana_pares"] = round(ref, 3)
        if u["ndvi"] < ref - 0.10: r["alertas"].append(f"NDVI {u['ndvi']:.2f} abaixo da mediana dos talhões parecidos ({ref:.2f})."); r["nivel"] = "atencao"
    # água na folha: queda do NDMI em relação às 3 imagens anteriores
    if len(df) >= 4:
        base = df.iloc[-4:-1]["ndmi"].median()
        if u["ndmi"] < base - 0.10: r["alertas"].append(f"Teor de água na folha em queda (NDMI {u['ndmi']:.2f} contra {base:.2f} nas imagens anteriores). Pode indicar estresse hídrico: confira chuva e umidade."); r["nivel"] = "atencao"
    # zonas fracas dentro do talhão
    if ultimo is not None:
        v = ultimo["ndvi"]; med = np.nanmedian(v); fraco = np.isfinite(v) & (v < med - 0.15)
        pct = float(fraco.sum() / np.isfinite(v).sum()); r["zona_fraca_pct"] = round(100 * pct, 1)
        if pct > 0.15: r["alertas"].append(f"Zona fraca em {100 * pct:.0f}% do talhão (pixels bem abaixo da mediana do próprio talhão). Veja o mapa."); r["nivel"] = "atencao"
    if not r["alertas"]: r["alertas"].append("Sem sinal de problema nesta imagem.")
    return r

sel = [t for t in TALHOES if cultura_de(t)]
SERIES, ULTIMOS = {}, {}
for t in sel:
    pl = pd.Timestamp(t["plantio"]).date() if t.get("plantio") else HOJE - dt.timedelta(days=120)
    ini = min(pl, HOJE - dt.timedelta(days=60)) - dt.timedelta(days=15)
    print(f"{t['nome']}: imagens de {ini} a {HOJE}", flush=True)
    try:
        imgs = baixa_talhao(t, ini, HOJE)
    except Exception as e:
        print("  falhou:", str(e)[:200]); imgs = []
    df, ult = serie_e_mapas(t, imgs); SERIES[t["id"]], ULTIMOS[t["id"]] = df, ult
    print(f"  {len(df)} imagens úteis", flush=True)

RES = []
for t in sel:
    cult = cultura_de(t); df = SERIES[t["id"]]
    pares = []
    for o in sel:
        if o["id"] != t["id"] and cultura_de(o) == cult and o.get("plantio") and t.get("plantio") and abs((pd.Timestamp(o["plantio"]) - pd.Timestamp(t["plantio"])).days) <= 20 and len(SERIES[o["id"]]):
            d = SERIES[o["id"]]; pares.append(float(np.interp(pd.Timestamp(df["data"].iloc[-1]).value if len(df) else 0, pd.to_datetime(d["data"]).astype("int64"), d["ndvi"])))
    r = analisa(t, df, ULTIMOS[t["id"]], pares)
    r["serie"] = [{"data": str(x.data), "ndvi": round(x.ndvi, 3), "ndre": round(x.ndre, 3), "ndmi": round(x.ndmi, 3)} for x in df.itertuples()]
    RES.append(r)

if not any(r["nivel"] != "sem_dado" for r in RES):
    print("Nenhum talhão com imagem útil: mantendo o arquivo anterior."); sys.exit(1)
os.makedirs(os.path.dirname(SAIDA), exist_ok=True)
json.dump({"gerado_em": str(HOJE), "fonte": "Sentinel-2 L2A (ESA/Copernicus) via Microsoft Planetary Computer",
           "aviso": "Alerta de triagem; não é diagnóstico. Curva esperada aproximada.", "talhoes": RES},
          open(SAIDA, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
for r in RES:
    print(f"{r['nome']} [{r['nivel']}]", r.get("ultima_imagem", {}).get("data", ""))
    for a in r["alertas"]: print("  -", a)
