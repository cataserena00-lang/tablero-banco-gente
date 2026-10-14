"""Inspección de las bases de Córdoba me capacita: imprime SOLO estructura (hojas, encabezados, tipos, cantidades) y, para
columnas que no son personales y tienen pocos valores distintos, la distribución. Nunca imprime filas ni valores de columnas
personales (nombre, CUIL, DNI, mail, teléfono, domicilio...)."""
import os
import re
import sys
import tempfile
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "banco_gente"))
import drive_carpeta as dc  # noqa: E402

PERSONAL = re.compile(r"cuil|cuit|dni|documento|nombre|apellido|mail|correo|tel|celular|domicil|direcci|calle|fecha.*nac|nacim|cbu|persona|alumno|docente|capacitador|instructor|tutor", re.I)


def describir(df: pd.DataFrame, titulo: str) -> None:
    print(f"\n=== {titulo}: {len(df)} filas, {len(df.columns)} columnas ===")
    for c in df.columns:
        s = df[c]
        nn = int(s.notna().sum())
        nu = int(s.nunique(dropna=True))
        personal = bool(PERSONAL.search(str(c)))
        linea = f"- {c!r} [{s.dtype}] con dato: {nn}, distintos: {nu}"
        if pd.api.types.is_datetime64_any_dtype(s) and nn:
            linea += f", rango {s.min().date()} a {s.max().date()}"
        elif pd.api.types.is_numeric_dtype(s) and nn and not personal:
            linea += f", min {s.min():g}, max {s.max():g}, suma {s.sum():g}"
        print(linea + ("  (columna personal: sin valores)" if personal else ""))
        if not personal and 0 < nu <= 40 and not pd.api.types.is_numeric_dtype(s):
            for v, n in s.value_counts().head(40).items():
                print(f"      {str(v)[:70]!r}: {n}")


def main() -> None:
    carpeta = os.environ["CBA_DRIVE_CARPETA_ID"]
    svc = dc.servicio()
    archivos = dc.listar(svc, carpeta)
    print("Archivos visibles en la carpeta:", ", ".join(sorted(f"{a['name']} ({a.get('size', '?')} bytes)" for a in archivos if a["mimeType"] != dc.CARPETA)) or "ninguno")
    for nombre in ("REPORTE CURSOS", "REPORTE ASECOR"):
        elegido = dc.elegir(archivos, nombre)
        if not elegido:
            print(f"No se encontró {nombre}")
            continue
        with tempfile.TemporaryDirectory() as tmp:
            ruta = Path(tmp) / "base.xlsx"
            dc.bajar(svc, elegido, ruta)
            from openpyxl import load_workbook
            wb = load_workbook(ruta, read_only=True, data_only=True)
            print(f"\n##### {nombre}: hojas = {[(w.title, w.max_row, w.max_column) for w in wb.worksheets]}")
            wb.close()
            if os.environ.get("MUESTRA"):
                df = pd.read_excel(ruta, nrows=int(os.environ["MUESTRA"]))
            else:
                df = pd.read_excel(ruta)
            describir(df, nombre)


if __name__ == "__main__":
    main()
