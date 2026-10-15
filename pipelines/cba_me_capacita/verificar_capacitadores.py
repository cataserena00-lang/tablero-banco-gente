"""Verificación TEMPORAL: de dónde sale la diferencia entre los capacitadores del tablero y los del Excel. Imprime solo cantidades (nunca CUIL ni nombres)."""
import os
import re
import sys
import tempfile
from pathlib import Path

import pandas as pd

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))
import procesar_cmc as pc  # noqa: E402


def todos(v) -> list[str]:
    """Todos los números de 11 dígitos de la celda (con o sin guiones)."""
    t = re.sub(r"(?<=\d)[-.](?=\d)", "", str(v)) if pd.notna(v) else ""
    return re.findall(r"(?<!\d)\d{11}(?!\d)", t)


def main() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        c, _ = pc.descargar(os.environ["CBA_DRIVE_CARPETA_ID"], Path(tmp))
        df = pd.read_excel(c, sheet_name=0)
    print("filas del archivo:", len(df))
    raw = df["CUIL Capacitador"]
    print("celdas con dato:", int(raw.notna().sum()), "| textos distintos (como en Excel, sin separar):", int(raw.nunique()))
    ids = pd.to_numeric(df["ID Curso"], errors="coerce")
    print("ID Curso repetidos:", int(ids.duplicated().sum()))
    cuil_todos = [x for v in raw for x in todos(v)]
    print("CUIL válidos (11 dígitos) en todo el archivo, con repetición:", len(cuil_todos), "| DISTINTOS:", len(set(cuil_todos)))
    con_dato_sin_cuil = int(sum(1 for v in raw if pd.notna(v) and not todos(v)))
    print("celdas con dato pero SIN un CUIL de 11 dígitos:", con_dato_sin_cuil)
    raros = [str(v) for v in raw if pd.notna(v) and not todos(v)]
    print("   formatos de esas celdas (solo largo y si tienen letras):", sorted({(len(re.sub(r'\D', '', s)), bool(re.search(r'[A-Za-z]', s))) for s in raros})[:10])
    multi = int(sum(1 for v in raw if len(todos(v)) > 1))
    print("celdas con más de un CUIL:", multi)
    cur, n_total, n_desde, n_excl = pc.cursos_validos(df)
    print("cursos del tablero:", len(cur), "| descartados por desaprobados o cancelados:", n_excl)
    validos = {x for v in cur["cuil_cap"] for x in todos(v)}
    print("CUIL DISTINTOS en los cursos del tablero:", len(validos))
    planif = df["Estado Planif."].astype(str).str.upper().str.strip()
    for estado in sorted(planif.unique()):
        s = {x for v in raw[planif == estado] for x in todos(v)}
        print(f"   {estado}: {int((planif == estado).sum())} cursos, {len(s)} CUIL distintos, {len(s - validos)} que solo están en este estado")
    solo_desc = {x for v in raw[planif.isin(['DESAPROBADO', 'CANCELADO'])] for x in todos(v)} - validos
    print("CUIL que figuran SOLO en cursos desaprobados o cancelados:", len(solo_desc))
    # por nombre y apellido
    ap, no = df["Apellido Capacitador"], df["Nombre Capacitador"]
    pares = {(a.strip().upper(), n.strip().upper()) for av, nv in zip(ap, no) if pd.notna(av) and pd.notna(nv) for a, n in zip(str(av).split("\n"), str(nv).split("\n"))}
    print("pares apellido+nombre distintos (todo el archivo):", len(pares))
    print("cursos sin capacitador:", int(raw.isna().sum()))


if __name__ == "__main__":
    main()
