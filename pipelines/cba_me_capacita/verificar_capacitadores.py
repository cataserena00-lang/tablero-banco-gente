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
    # Variantes con las que se podría haber llegado a otra cifra (solo cantidades)
    textos = [str(v).strip() for v in raw if pd.notna(v)]
    unicos_texto = set(textos)
    una = {t for t in unicos_texto if len(todos(t)) == 1}
    varias = {t for t in unicos_texto if len(todos(t)) > 1}
    print("textos distintos con UN solo CUIL:", len(una), "| textos distintos con varios CUIL:", len(varias), "| suma:", len(una) + len(varias))
    print("CUIL distintos mirando solo los textos con un CUIL:", len({todos(t)[0] for t in una}))
    sin_desap = planif != "DESAPROBADO"
    print("CUIL distintos sin los DESAPROBADOS (quedan los CANCELADOS):", len({x for v in raw[sin_desap] for x in todos(v)}))
    sin_ambos = ~planif.isin(["DESAPROBADO", "CANCELADO"])
    print("CUIL distintos sin DESAPROBADOS ni CANCELADOS:", len({x for v in raw[sin_ambos] for x in todos(v)}))
    for etapa in sorted(df["Etapa"].astype(str).unique()):
        m = df["Etapa"].astype(str) == etapa
        print(f"   {etapa}: {int(m.sum())} cursos, {len({x for v in raw[m] for x in todos(v)})} CUIL distintos (todos los estados), {len({x for v in raw[m & sin_ambos] for x in todos(v)})} sin desaprobados ni cancelados")
    if "Total Alumnos" in df:
        con_alumnos = pd.to_numeric(df["Total Alumnos"], errors="coerce").fillna(0) > 0
        print("CUIL distintos en cursos con alumnos (Total Alumnos > 0):", len({x for v in raw[con_alumnos] for x in todos(v)}), "| cursos con alumnos:", int(con_alumnos.sum()))
    for col in ("Nombre Capacitador", "Apellido Capacitador"):
        print(col, "- distintos:", df[col].nunique())
    print("pares con nombre y apellido iguales pero CUIL distinto:", len(pares) - len({(a, n) for a, n in pares}))
    cu = {}
    for av, nv, v in zip(ap, no, raw):
        if pd.notna(av) and pd.notna(nv) and pd.notna(v):
            for a, n, c in zip(str(av).split("\n"), str(nv).split("\n"), todos(v) if len(todos(v)) == len(str(av).split("\n")) else []):
                cu.setdefault((a.strip().upper(), n.strip().upper()), set()).add(c)
    print("personas (apellido+nombre) con más de un CUIL:", sum(1 for x in cu.values() if len(x) > 1), "| CUIL con más de un nombre:", sum(1 for c in {c for x in cu.values() for c in x} if sum(1 for x in cu.values() if c in x) > 1))


if __name__ == "__main__":
    main()
