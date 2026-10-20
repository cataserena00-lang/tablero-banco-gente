"""TEMPORAL: valores de «Estado Planif.» (solo textos y cantidades)."""
import os, sys, tempfile
from pathlib import Path
import pandas as pd
sys.path.insert(0, str(Path(__file__).resolve().parent))
import procesar_cmc as pc
with tempfile.TemporaryDirectory() as t:
    c, a = pc.descargar(os.environ["CBA_DRIVE_CARPETA_ID"], Path(t))
    df = pc.leer(c)
    print("columnas:", [x for x in df.columns if "stado" in str(x) or "lanif" in str(x)])
    for col in [x for x in df.columns if "lanif" in str(x) or str(x).strip().lower() in ("estado",)]:
        print(col, df[col].astype(str).str.strip().value_counts(dropna=False).to_dict())
    cur = pc.preparar_cursos(df)
    ins = pd.to_numeric(pc.leer(a)["ID Curso"], errors="coerce")
    cur["insc"] = cur["id"].map(ins.value_counts()).fillna(0).astype(int)
    print(cur.groupby("planif").agg(cursos=("id", "size"), inscripciones=("insc", "sum")).to_string())
    a_df = pc.leer(a)
    a_df["_id"] = pd.to_numeric(a_df["ID Curso"], errors="coerce")
    a_df["_est"] = a_df["Estado"].map(pc.clave)
    x = a_df[a_df["_est"] == "INSCRIPTO"].merge(cur[["id", "planif", "etapa"]], left_on="_id", right_on="id", how="left")
    x["planif"] = x["planif"].fillna("(curso fuera del reporte)")
    print("INSCRIPTO por planificación y etapa:")
    print(x.groupby(["planif", "etapa"], dropna=False).agg(inscripciones=("_id", "size"), cursos=("_id", "nunique")).to_string())
