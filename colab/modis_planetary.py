# MODIS via Microsoft Planetary Computer (mesmos produtos NASA, espelho em COG) - substitui o servico do ORNL.
# Usa as variaveis do caderno: MUN, CLIMA, ANO_INICIO, ANO_FIM, MODIS_OK, pd, np, os.
import subprocess, sys
subprocess.run([sys.executable, "-m", "pip", "-q", "install", "pystac-client", "planetary-computer", "pyproj"], check=False)
import time, rasterio
import planetary_computer as pc
from pystac_client import Client
from pyproj import Transformer
from concurrent.futures import ThreadPoolExecutor

PC_BANDAS = [   # (colecao, trecho do nome do ativo, coluna, escala, valores validos)
    ("modis-13Q1-061", "250m_16_days_ndvi", "ndvi", 0.0001, (-0.2, 1.0)),
    ("modis-13Q1-061", "250m_16_days_evi", "evi", 0.0001, (-0.2, 1.0)),
    ("modis-15A2H-061", "lai_500m", "lai", 0.1, (0, 10)),
    ("modis-15A2H-061", "fpar_500m", "fpar", 0.01, (0, 1)),
    ("modis-16A2-061", "et_500m", "et_modis", 0.1, (0, 100)),
    ("modis-16A2-061", "pet_500m", "pet_modis", 0.1, (0, 200)),
    ("modis-11A2-061", "lst_day_1km", "lst_dia", 0.02, (200, 340)),
    ("modis-11A2-061", "lst_night_1km", "lst_noite", 0.02, (200, 320)),
    ("modis-17A2H-061", "gpp_500m", "gpp", 0.0001, (0, 0.2)),
]
cat = Client.open("https://planetarycomputer.microsoft.com/api/stac/v1", modifier=pc.sign_inplace)
lons = [m["lon"] for m in MUN.values()]; lats = [m["lat"] for m in MUN.values()]
BBOX = [min(lons) - 0.1, min(lats) - 0.1, max(lons) + 0.1, max(lats) + 0.1]
PONTOS_MUN = [(cod, m["lon"], m["lat"]) for cod, m in MUN.items()]
_tr = {}
def _ler(args):
    href, esc, faixa, data = args
    for t in range(4):
        try:
            with rasterio.open(pc.sign(href)) as src:
                k = str(src.crs)
                if k not in _tr: _tr[k] = Transformer.from_crs("EPSG:4326", src.crs, always_xy=True)
                xs = [(cod, *_tr[k].transform(lo, la)) for cod, lo, la in PONTOS_MUN]
                b = src.bounds
                dentro = [(c, x, y) for c, x, y in xs if b.left <= x <= b.right and b.bottom <= y <= b.top]
                if not dentro: return []
                out = []
                for (c, x, y), v in zip(dentro, src.sample([(x, y) for _, x, y in dentro])):
                    v = float(v[0]) * esc
                    if src.nodata is not None and float(v / esc) == src.nodata: continue
                    if faixa[0] <= v <= faixa[1]: out.append((c, data, v))
                return out
        except Exception as e:
            time.sleep(2 * (t + 1)); err = e
    print("  leitura falhou:", str(err)[:80]); return []

feitos = {}
for colecao, trecho, nome, esc, faixa in PC_BANDAS:
    if all(os.path.exists(f"cache/modis_{c}_{nome}.csv") for c in MUN):
        feitos[nome] = True; continue
    try:
        itens = list(cat.search(collections=[colecao], bbox=BBOX, datetime=f"{ANO_INICIO - 1}-12-01/{ANO_FIM}-12-31").items())
        tarefas = []
        for it in itens:
            ch = next((k for k in it.assets if trecho in k.lower()), None)
            if ch: tarefas.append((it.assets[ch].href, esc, faixa, pd.Timestamp(it.datetime).tz_localize(None).normalize()))
        print(f"MODIS {nome}: {len(tarefas)} imagens em {colecao}")
        with ThreadPoolExecutor(16) as ex: res = list(ex.map(_ler, tarefas))
        por = {c: {} for c in MUN}
        for lst in res:
            for c, d, v in lst: por[c][d] = v
        if not any(por.values()): raise RuntimeError("nenhum valor lido")
        for c in MUN:
            pd.Series(por[c], name=nome).sort_index().to_csv(f"cache/modis_{c}_{nome}.csv")
        feitos[nome] = True
        print(f"  {nome}: ok, {max(len(v) for v in por.values())} datas por municipio")
    except Exception as e:
        print(f"  MODIS {nome} indisponivel:", str(e)[:120])

for nome in feitos:
    for cod in MUN:
        s = pd.read_csv(f"cache/modis_{cod}_{nome}.csv", index_col=0, parse_dates=True).iloc[:, 0]
        d = CLIMA[cod]
        CLIMA[cod] = d.join(s.reindex(d.index.union(s.index)).ffill(limit=16).reindex(d.index).rename(nome))
    if nome not in MODIS_OK: MODIS_OK.append(nome)
print("MODIS carregados (Planetary Computer):", MODIS_OK or "nenhum")
