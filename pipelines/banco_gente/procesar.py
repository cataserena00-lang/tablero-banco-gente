"""Pipeline Banco de la Gente: Excel (Drive) -> JSON agregados (sin datos personales).

Uso:
  python pipelines/banco_gente/procesar.py --input base.xlsx        # local
  python pipelines/banco_gente/procesar.py                          # descarga de Drive
"""
import argparse, io, json, os, re, sys, unicodedata, hashlib
from datetime import datetime, timezone
from pathlib import Path
import pandas as pd, yaml

AQUI = Path(__file__).parent
SALIDA = AQUI.parent.parent / "data" / "banco_gente"


def norm(s) -> str:
    if pd.isna(s):
        return ""
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", s).strip().upper()


def descargar_drive(file_id: str) -> bytes:
    from google.oauth2 import service_account
    from googleapiclient.discovery import build
    from googleapiclient.http import MediaIoBaseDownload
    info = json.loads(os.environ["GOOGLE_SERVICE_ACCOUNT_JSON"])
    cred = service_account.Credentials.from_service_account_info(
        info, scopes=["https://www.googleapis.com/auth/drive.readonly"])
    svc = build("drive", "v3", credentials=cred, cache_discovery=False)
    buf = io.BytesIO()
    dl = MediaIoBaseDownload(buf, svc.files().get_media(fileId=file_id))
    done = False
    while not done:
        _, done = dl.next_chunk()
    return buf.getvalue()


def parsear_fecha(serie: pd.Series) -> pd.Series:
    """Acepta fechas reales, texto o números seriales de Excel (ej. 46073)."""
    num = pd.to_numeric(serie, errors="coerce")
    serial = pd.to_datetime(num, unit="D", origin="1899-12-30", errors="coerce")
    texto = pd.to_datetime(serie.where(num.isna()), errors="coerce")
    return serial.fillna(texto)


def extraer_barrio(dom: str) -> str:
    """'PUBLICA H 4509 - UNIVERSITARIO DE HORIZONTE' -> 'UNIVERSITARIO DE HORIZONTE'."""
    if " - " not in dom and not dom.endswith(" -"):
        return "SIN DATO"
    b = dom.rsplit("-", 1)[1].strip()
    if not b or b.isdigit():
        return "SIN DATO"
    return b


def agrupar(df: pd.DataFrame, claves: list[str]) -> list[dict]:
    g = (df.groupby(claves, dropna=False)
           .agg(creditos=("monto", "size"), monto=("monto", "sum"))
           .reset_index().sort_values("monto", ascending=False))
    g["monto"] = g["monto"].round(0).astype(int)
    return g.to_dict("records")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input")
    a = ap.parse_args()
    cfg = yaml.safe_load((AQUI / "config.yaml").read_text(encoding="utf-8"))
    c = cfg["columnas"]

    if a.input:
        raw = Path(a.input).read_bytes()
    else:
        raw = descargar_drive(os.environ[cfg["drive_file_id_env"]])
    huella = hashlib.sha256(raw).hexdigest()
    meta_prev = SALIDA / "meta.json"
    if meta_prev.exists() and not os.environ.get("FORZAR"):
        if json.loads(meta_prev.read_text())["huella"] == huella:
            print("Sin cambios en el archivo de origen; no se regenera.")
            return

    df = pd.read_excel(io.BytesIO(raw))
    df.columns = [re.sub(r"\s+", " ", x.replace("<br>", " ")).strip() for x in df.columns]
    falta = [v for v in c.values() if re.sub(r"\s+", " ", v) not in df.columns]
    if falta:
        sys.exit(f"Faltan columnas en el Excel: {falta}")

    d = pd.DataFrame({
        "monto": pd.to_numeric(df[c["monto"]], errors="coerce").fillna(0),
        "fecha": parsear_fecha(df[c["fecha"]]),
        "localidad": df[c["localidad"]].map(norm).replace("", "SIN DATO"),
        "departamento": df[c["departamento"]].map(norm).replace("", "SIN DATO"),
        "linea": df[c["linea"]].map(norm).replace("", "SIN DATO"),
        "domicilio": df[c["domicilio"]].map(norm),
    })

    alias = pd.read_csv(AQUI / "barrios_alias.csv")
    alias = dict(zip(alias.variante.map(norm), alias.barrio.map(norm)))

    es_cap = (d.localidad == cfg["capital"]["localidad"]) & \
             (d.departamento == cfg["capital"]["departamento"])
    cap = d[es_cap].copy()
    cap["barrio"] = cap.domicilio.map(extraer_barrio).map(lambda b: alias.get(b, b))

    d["mes"] = d.fecha.dt.strftime("%Y-%m").fillna("SIN DATO")
    out = {
        "resumen": {
            "creditos": int(len(d)), "monto": int(d.monto.sum()),
            "localidades": int(d.localidad.nunique()),
            "departamentos": int(d.departamento.nunique()),
            "capital_creditos": int(len(cap)), "capital_monto": int(cap.monto.sum()),
            "fecha_min": d.fecha.min().strftime("%Y-%m-%d") if d.fecha.notna().any() else None,
            "fecha_max": d.fecha.max().strftime("%Y-%m-%d") if d.fecha.notna().any() else None,
        },
        "departamentos": agrupar(d, ["departamento"]),
        "localidades": agrupar(d, ["departamento", "localidad"]),
        "barrios": agrupar(cap, ["barrio"]),
        "lineas": agrupar(d, ["linea"]),
        "meses": sorted(agrupar(d, ["mes"]), key=lambda r: r["mes"]),
    }
    # ── Cubo compacto para filtrado client-side ──────────────────────
    fechas = sorted(d.fecha.dropna().dt.strftime("%Y-%m-%d").unique())
    deptos = sorted(d.departamento.unique())
    locs = sorted(d.localidad.unique())
    f_idx = {f: i for i, f in enumerate(fechas)}
    d_idx = {x: i for i, x in enumerate(deptos)}
    l_idx = {x: i for i, x in enumerate(locs)}

    rows = []
    for (fecha, dep, loc), g in d.groupby(
        [d.fecha.dt.strftime("%Y-%m-%d"), "departamento", "localidad"], dropna=False
    ):
        if pd.isna(fecha) or fecha not in f_idx:
            continue
        rows.append([f_idx[fecha], d_idx[dep], l_idx[loc],
                     int(g.shape[0]), int(g.monto.sum())])

    # Agregar líneas de crédito al cubo principal
    lineas = sorted(d.linea.unique())
    lin_idx = {x: i for i, x in enumerate(lineas)}

    rows_lin = []
    for (fecha, dep, loc, lin), g in d.groupby(
        [d.fecha.dt.strftime("%Y-%m-%d"), "departamento", "localidad", "linea"], dropna=False
    ):
        if pd.isna(fecha) or fecha not in f_idx:
            continue
        rows_lin.append([f_idx[fecha], d_idx[dep], l_idx[loc], lin_idx[lin],
                         int(g.shape[0]), int(g.monto.sum())])

    cubo = {"f": fechas, "dep": deptos, "loc": locs, "lin": lineas, "rows": rows_lin}

    # ── Cubo Capital (barrios × línea) ──────────────────────
    barrios_uniq = sorted(cap["barrio"].unique())
    bar_idx = {b: i for i, b in enumerate(barrios_uniq)}

    cap_rows = []
    for (fecha, barrio, lin), g in cap.groupby(
        [cap.fecha.dt.strftime("%Y-%m-%d"), "barrio", "linea"], dropna=False
    ):
        if pd.isna(fecha) or fecha not in f_idx:
            continue
        cap_rows.append([f_idx[fecha], bar_idx[barrio], lin_idx.get(lin, -1),
                         int(g.shape[0]), int(g.monto.sum())])

    cubo_cap = {"f": fechas, "bar": barrios_uniq, "lin": lineas, "rows": cap_rows}

    SALIDA.mkdir(parents=True, exist_ok=True)
    for k, v in out.items():
        (SALIDA / f"{k}.json").write_text(json.dumps(v, ensure_ascii=False), encoding="utf-8")

    (SALIDA / "cubo.json").write_text(json.dumps(cubo, ensure_ascii=False), encoding="utf-8")
    (SALIDA / "cubo_capital.json").write_text(json.dumps(cubo_cap, ensure_ascii=False), encoding="utf-8")

    # Copiar geo/deptos_paths.json a data/ para que Next.js lo lea
    geo_src = AQUI / "geo" / "deptos_paths.json"
    if geo_src.exists():
        import shutil
        shutil.copy2(geo_src, SALIDA / "deptos_paths.json")

    # Barrios para revisar: poco frecuentes o sin dato (se corrigen en barrios_alias.csv)
    rev = [r for r in out["barrios"] if r["creditos"] <= 2 or r["barrio"] == "SIN DATO"]
    (SALIDA / "barrios_revisar.json").write_text(json.dumps(rev, ensure_ascii=False), encoding="utf-8")
    (SALIDA / "meta.json").write_text(json.dumps({
        "huella": huella, "filas": int(len(d)),
        "actualizado": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }), encoding="utf-8")
    print(f"OK: {len(d)} créditos, {len(cap)} en Capital, {len(out['barrios'])} barrios, cubo: {len(rows)} filas.")


if __name__ == "__main__":
    main()
