#!/usr/bin/env python3
"""SpaceAgro — estresse hídrico por talhão com o ECOSTRESS (NASA, LP DAAC): índice ESI (evapotranspiração real / potencial), 70 m.
Gera public/data/estresse-hidrico.json. Cada talhão leva a DATA EXATA da imagem usada; o aplicativo cruza essa data com a chuva da NASA POWER.
Credenciais: segredos EARTHDATA_USER e EARTHDATA_PASS (variáveis de ambiente). Uso: python scripts/estresse_hidrico.py"""
import json, os, sys, glob, datetime as dt, tempfile
import numpy as np
import earthaccess
import rasterio, rasterio.features
from shapely.geometry import Polygon, box
from shapely.ops import transform as shp_transform
import pyproj

HOJE = dt.date.today()
JANELA_DIAS = 75
MAX_DATAS = 10
LIMITE_ESI = 0.50          # abaixo disso a planta transpira bem menos do que a atmosfera pede (referência, revisável pelo agrônomo)
AQUI = os.path.dirname(os.path.abspath(__file__))
TALHOES = json.load(open(os.path.join(AQUI, "talhoes_demo.json"), encoding="utf-8"))
SAIDA = os.path.join(AQUI, "..", "public", "data", "estresse-hidrico.json")
os.environ.setdefault("EARTHDATA_USERNAME", os.environ.get("EARTHDATA_USER", ""))
os.environ.setdefault("EARTHDATA_PASSWORD", os.environ.get("EARTHDATA_PASS", ""))
auth = earthaccess.login(strategy="environment")
if not auth.authenticated: print("Login Earthdata falhou."); sys.exit(1)

def data_local(g):
    ini = g["umm"]["TemporalExtent"]["RangeDateTime"]["BeginningDateTime"]
    t = dt.datetime.strptime(ini[:19], "%Y-%m-%dT%H:%M:%S") - dt.timedelta(hours=3)   # horário de Brasília
    return t.date(), t.strftime("%H:%M")

polys = {t["id"]: Polygon([(lng, lat) for lat, lng in t["poligono_lat_lng"]]) for t in TALHOES}
xs = [p.bounds for p in polys.values()]
bbox = (min(b[0] for b in xs), min(b[1] for b in xs), max(b[2] for b in xs), max(b[3] for b in xs))
ini = HOJE - dt.timedelta(days=JANELA_DIAS)
res = earthaccess.search_data(short_name="ECO_L4T_ESI", bounding_box=bbox, temporal=(str(ini), str(HOJE + dt.timedelta(days=1))))
print(f"{len(res)} cenas ESI na área da fazenda entre {ini} e {HOJE}", flush=True)
if not res: print("Nenhuma cena: mantendo o arquivo anterior."); sys.exit(1)
dias = sorted({data_local(g)[0] for g in res}, reverse=True)[:MAX_DATAS]
res = [g for g in res if data_local(g)[0] in dias]
print(f"Usando {len(res)} cenas em {len(dias)} dias: {', '.join(str(d) for d in sorted(dias))}", flush=True)

pasta = tempfile.mkdtemp(prefix="eco_")
def baixa(g):
    links = g.data_links()
    alvo = [l for l in links if l.endswith("_ESI.tif") or l.endswith("_cloud.tif")]
    if not any(l.endswith("_ESI.tif") for l in alvo):
        print("  sem _ESI.tif; arquivos:", [os.path.basename(l) for l in links][:8]); return None, None
    arqs = earthaccess.download(alvo, pasta)
    esi = next((str(a) for a in arqs if str(a).endswith("_ESI.tif")), None)
    cloud = next((str(a) for a in arqs if str(a).endswith("_cloud.tif")), None)
    return esi, cloud

def estatistica(esi, cloud, poly):
    with rasterio.open(esi) as ds:
        proj = pyproj.Transformer.from_crs("EPSG:4326", ds.crs, always_xy=True).transform
        g = shp_transform(proj, poly)
        if not box(*ds.bounds).intersects(g): return None
        dentro = rasterio.features.geometry_mask([g], out_shape=(ds.height, ds.width), transform=ds.transform, invert=True)
        a = ds.read(1).astype("float32"); nd = ds.nodata
    # ESI exatamente 0 em todo o talhão é valor de preenchimento (ex.: passagem de madrugada, sem evapotranspiração calculada), não estresse real
    ok = dentro & np.isfinite(a) & (a > 0.001) & (a < 20)
    if nd is not None: ok &= a != nd
    if cloud:
        try:
            with rasterio.open(cloud) as dc:
                c = dc.read(1)
            if c.shape == a.shape: ok &= (c == 0)
        except Exception: pass
    if dentro.sum() == 0 or ok.sum() / dentro.sum() < 0.5 or ok.sum() < 8: return None
    v = np.clip(a[ok], 0, 1.5)
    return {"esi": float(np.median(v)), "p10": float(np.percentile(v, 10)), "pct_valido": float(ok.sum() / dentro.sum()), "fraco": float((v < LIMITE_ESI).mean())}

series = {t["id"]: [] for t in TALHOES}
for i, g in enumerate(sorted(res, key=lambda x: data_local(x)[0]), 1):
    d, hora = data_local(g)
    try:
        esi, cloud = baixa(g)
    except Exception as e:
        print("  falhou o download:", str(e)[:150]); continue
    if not esi: continue
    for t in TALHOES:
        try:
            s = estatistica(esi, cloud, polys[t["id"]])
        except Exception as e:
            print("  erro de leitura:", str(e)[:120]); s = None
        if s: series[t["id"]].append({"data": d, "hora": hora, **s})
    print(f"  cena {i}/{len(res)} de {d} lida", flush=True)

def pt(d): return d.strftime("%d/%m/%Y")
RES = []
for t in TALHOES:
    ser = sorted(series[t["id"]], key=lambda x: (x["data"], x["hora"]))
    # uma entrada por dia (a mais completa)
    por_dia = {}
    for s in ser:
        if s["data"] not in por_dia or s["pct_valido"] > por_dia[s["data"]]["pct_valido"]: por_dia[s["data"]] = s
    ser = [por_dia[k] for k in sorted(por_dia)]
    r = {"id": t["id"], "nome": t["nome"], "cultura": t.get("cultura"), "alertas": [], "nivel": "ok"}
    if not ser:
        r["nivel"] = "sem_dado"; r["alertas"].append("Nenhuma imagem útil do ECOSTRESS sobre este talhão nos últimos %d dias (nuvem ou passagem fora da área)." % JANELA_DIAS)
    else:
        u = ser[-1]; dias_atras = (HOJE - u["data"]).days
        r["ultima_imagem"] = {"data": str(u["data"]), "hora_local": u["hora"], "dias_atras": dias_atras, "esi": round(u["esi"], 3), "pct_valido": round(u["pct_valido"], 2)}
        r["zona_fraca_pct"] = round(100 * u["fraco"], 1)
        r["alertas"].append(f"Imagem de {pt(u['data'])}, às {u['hora']}, há {dias_atras} dia(s). O que vale é o dia da imagem, não o de hoje.")
        if u["esi"] < LIMITE_ESI:
            r["alertas"].append(f"Índice ESI {u['esi']:.2f}, abaixo de {LIMITE_ESI:.2f}: nesse dia a planta transpirava bem menos do que o ar pedia, sinal de falta de água."); r["nivel"] = "atencao"
        if len(ser) >= 2:
            a = ser[-2]; r["esi_anterior"] = {"data": str(a["data"]), "esi": round(a["esi"], 3)}
            if u["esi"] < a["esi"] - 0.15:
                r["alertas"].append(f"Queda do ESI em relação à imagem de {pt(a['data'])} ({a['esi']:.2f} para {u['esi']:.2f})."); r["nivel"] = "atencao"
        if u["fraco"] > 0.3 and u["esi"] >= LIMITE_ESI:
            r["alertas"].append(f"{100 * u['fraco']:.0f}% do talhão abaixo de {LIMITE_ESI:.2f}: veja a zona mais seca."); r["nivel"] = "atencao"
        if r["nivel"] == "ok": r["alertas"].append("Sem sinal de estresse hídrico nessa imagem.")
    r["serie"] = [{"data": str(s["data"]), "esi": round(s["esi"], 3)} for s in ser]
    RES.append(r)

if not any(r["nivel"] != "sem_dado" for r in RES): print("Nenhum talhão com imagem útil: mantendo o arquivo anterior."); sys.exit(1)
os.makedirs(os.path.dirname(SAIDA), exist_ok=True)
json.dump({"gerado_em": str(HOJE), "fonte": "ECOSTRESS L4T ESI v002 (NASA/LP DAAC), 70 m", "limite_esi": LIMITE_ESI, "talhoes": RES}, open(SAIDA, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("Gravado:", os.path.abspath(SAIDA), "|", sum(r["nivel"] == "atencao" for r in RES), "em atenção de", len(RES))
