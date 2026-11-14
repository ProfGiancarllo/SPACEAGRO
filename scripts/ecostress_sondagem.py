#!/usr/bin/env python3
"""Sondagem: quantas cenas do ECOSTRESS (NASA, LP DAAC) existem sobre Rio Verde nos últimos 90 dias. Só conta e lista; não baixa nada."""
import os, datetime as dt
import earthaccess
os.environ.setdefault("EARTHDATA_USERNAME", os.environ.get("EARTHDATA_USER", ""))
os.environ.setdefault("EARTHDATA_PASSWORD", os.environ.get("EARTHDATA_PASS", ""))
auth = earthaccess.login(strategy="environment")
print("Login Earthdata:", "OK" if auth.authenticated else "FALHOU")
fim = dt.date.today(); ini = fim - dt.timedelta(days=90)
BBOX = (-51.30, -17.95, -50.85, -17.65)   # Rio Verde (GO)
for nome in ["ECO_L4T_ESI", "ECO_L2T_LSTE", "ECO_L3T_JET"]:
    try:
        r = earthaccess.search_data(short_name=nome, bounding_box=BBOX, temporal=(str(ini), str(fim)))
        datas = sorted({g["umm"]["TemporalExtent"]["RangeDateTime"]["BeginningDateTime"][:10] for g in r})
        print(f"{nome}: {len(r)} cenas em {len(datas)} dias. Primeira {datas[0] if datas else '-'}; última {datas[-1] if datas else '-'}")
        print("   dias:", ", ".join(datas[-15:]))
    except Exception as e:
        print(f"{nome}: erro {str(e)[:200]}")
for nome in ["ECO_L4T_ESI"]:
    try:
        r = earthaccess.search_data(short_name=nome, bounding_box=BBOX, temporal=("2026-01-01", str(fim)))
        print(f"{nome} em 2026: {len(r)} cenas")
    except Exception as e:
        print("erro", str(e)[:200])
