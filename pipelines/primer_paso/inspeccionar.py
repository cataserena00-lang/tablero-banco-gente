"""Inspección TEMPORAL de la base del Programa Primer Paso: imprime solo estructura (hojas, encabezados, tipos, cantidades) y la distribución de
columnas NO personales con pocos valores distintos. Nunca imprime filas ni valores de columnas personales (nombre, CUIL, DNI, mail, teléfono, domicilio...)."""
import os
import re
import sys
import tempfile
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "banco_gente"))
import drive_carpeta as dc  # noqa: E402

PERSONAL = re.compile(r"cuil|cuit|dni|documento|nombre|apellido|mail|correo|tel|celular|domicil|direcci|calle|altura|nacim|cbu|persona|benefici|razon|empresa|cuenta|alias|n[uú]mero|nro", re.I)
GEO = re.compile(r"barrio|localidad|departamento|provincia|circuito|zona", re.I)


def describir(df: pd.DataFrame, titulo: str) -> None:
    print(f"\n=== {titulo}: {len(df)} filas, {len(df.columns)} columnas ===")
    for c in df.columns:
        s = df[c]
        nn, nu = int(s.notna().sum()), int(s.nunique(dropna=True))
        personal = bool(PERSONAL.search(str(c))) and not GEO.search(str(c))
        linea = f"- {c!r} [{s.dtype}] con dato: {nn}, distintos: {nu}"
        if pd.api.types.is_datetime64_any_dtype(s) and nn:
            linea += f", rango {s.min().date()} a {s.max().date()}"
        elif pd.api.types.is_numeric_dtype(s) and nn and not personal:
            linea += f", min {s.min():g}, max {s.max():g}, suma {s.sum():g}"
        print(linea + ("  (columna personal: sin valores)" if personal else ""))
        if not personal and 0 < nu <= (60 if GEO.search(str(c)) else 40) and not pd.api.types.is_numeric_dtype(s):
            for v, n in s.value_counts().head(60).items():
                print(f"      {str(v)[:70]!r}: {n}")
        elif not personal and nu > 40 and GEO.search(str(c)):
            for v, n in s.value_counts().head(15).items():
                print(f"      {str(v)[:70]!r}: {n}")


def main() -> None:
    carpeta = os.environ["PPP_DRIVE_CARPETA_ID"]
    svc = dc.servicio()
    archivos = dc.listar(svc, carpeta)
    print("Archivos visibles:", ", ".join(sorted(f"{a['name']} ({a.get('size', '?')} bytes)" for a in archivos if a["mimeType"] != dc.CARPETA)) or "ninguno")
    elegido = dc.elegir(archivos, "BASE EMPLEO")
    if not elegido:
        print("No se encontró BASE EMPLEO")
        return
    with tempfile.TemporaryDirectory() as tmp:
        ruta = Path(tmp) / "base.xlsx"
        dc.bajar(svc, elegido, ruta)
        from openpyxl import load_workbook
        wb = load_workbook(ruta, read_only=True, data_only=True)
        hojas = [(w.title, w.max_row, w.max_column) for w in wb.worksheets]
        print("Hojas:", hojas)
        wb.close()
        for i, (nombre, _, _) in enumerate(hojas[:3]):
            describir(pd.read_excel(ruta, sheet_name=i), f"hoja {nombre!r}")


if __name__ == "__main__":
    main()
