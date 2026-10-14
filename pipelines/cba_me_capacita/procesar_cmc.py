"""Córdoba me capacita: agregados para el tablero (SIN datos personales).

Lee los dos reportes semanales de la carpeta de Drive (nombres fijos):
  - REPORTE CURSOS   un curso por fila (zona, institución, sector, modalidad, etapa, estado de la planificación...)
  - REPORTE ASECOR   una INSCRIPCIÓN por fila (persona + curso + estado del alumno + perfil)
y escribe en data/cba_me_capacita/:
  cursos.json   un registro por curso con su zona y atributos, y el perfil agregado de sus inscriptos (ver FORMATO)
  meta.json     fecha de actualización y cantidades de control

Reglas:
  - Solo cursos que empiezan desde 2024 (si no tienen fecha de inicio, se usa el año de la etapa). Lo anterior no se usa.
  - Se descartan las planificaciones DESAPROBADAS o CANCELADAS: esos cursos no se dictaron.
  - Las inscripciones salen de ASECOR; el curso se une por «ID Curso». La zona es la del CURSO (no la del domicilio de la persona).
  - No se guarda ninguna fila ni dato de persona: cada curso lleva solo conteos (por estado, sexo, edad, estudios, trabajo, discapacidad).
    Los datos nominales los carga cargar_nominal.py a Neon, nunca a este repositorio ni a los logs.

FORMATO de cursos.json (todo son índices a las listas del mismo archivo):
  zonas      [[dep, loc], ...]               dep y loc: nombres sin tildes y en mayúsculas
  cursos     [[id, curso, inst, zona, sector, tipo, modalidad, etapa, mes, hs_presenciales], ...]
  perfil     un vector de enteros por curso, en el mismo orden (ver CAMPOS_PERFIL): inscriptos, estado, sexo, edad, estudios, trabajo, discapacidad
  unicos     [[zona|-1, etapa|-1, personas, capacitadores], ...] personas y capacitadores DISTINTOS (por CUIL) en esa zona/etapa
  capacitadores  un arreglo por curso (en el mismo orden) con los números de sus capacitadores: números sueltos, sin CUIL ni nombres, que sirven
                 para contar capacitadores distintos de cualquier selección de cursos (el tablero hace la unión)
"""
import argparse
import json
import os
import re
import sys
import tempfile
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import pandas as pd

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parent / "banco_gente"))
import drive_carpeta as dc  # noqa: E402
import procesar_estados as pe  # noqa: E402

SALIDA = AQUI.parents[1] / "data" / "cba_me_capacita"
NOMBRE_CURSOS, NOMBRE_ASECOR = "REPORTE CURSOS", "REPORTE ASECOR"
DESDE = 2024
VERSION = 1
SIN_DATO = "SIN DATO"
EXCLUIR_PLANIF = {"DESAPROBADO", "CANCELADO"}

# ── categorías del perfil (el orden define los índices del vector; el tablero usa los mismos nombres) ───────────────
ESTADOS = ["INSCRIPTO", "CURSANDO", "APROBADO", "EGRESADO", "NO APROBADO", "BAJA"]
SEXOS = ["F", "M", "X"]
EDADES = ["Menos de 18", "18 a 29", "30 a 44", "45 a 59", "60 o más", "Sin dato"]
ESTUDIOS = ["Primario", "Secundario incompleto", "Secundario completo", "Terciario/univ. incompleto", "Terciario/univ. completo", "Sin dato"]
TRABAJOS = ["Desocupado/a", "No trabaja ni busca", "Empleo formal", "Independiente", "Informal", "Jubilado/a", "Sin dato"]
DISCAPACIDAD = ["Sí", "No", "Sin dato"]
CAMPOS_PERFIL = [("inscriptos", ["total"]), ("estado", ESTADOS), ("sexo", SEXOS), ("edad", EDADES), ("estudios", ESTUDIOS),
                 ("trabajo", TRABAJOS), ("discapacidad", DISCAPACIDAD)]
LARGO_PERFIL = sum(len(v) for _, v in CAMPOS_PERFIL)


def clave(s) -> str:
    return pe.clave(s)


def texto(s) -> str:
    return re.sub(r"\s+", " ", str(s)).strip() if pd.notna(s) else ""


def estado_alumno(s) -> int | None:
    k = clave(s)
    return ESTADOS.index(k) if k in ESTADOS else None


def edad_tramo(e) -> int:
    try:
        e = float(e)
    except (TypeError, ValueError):
        return 5
    if not (3 <= e <= 100):   # hay edades imposibles (años en vez de edad)
        return 5
    return 0 if e < 18 else 1 if e < 30 else 2 if e < 45 else 3 if e < 60 else 4


def estudios_cat(s) -> int:
    k = clave(s)
    if not k or k in ("SIN DESCRIPCION", "DESCONOCIDA"):
        return 5
    if k.startswith("PRIMARIO") or k in ("PRE ESCOLAR", "JARDIN"):
        return 0
    if k.startswith("SECUNDARIO"):
        return 2 if k == "SECUNDARIO COMPLETO" else 1
    if k.startswith("TERCIARIO") or k.startswith("UNIVERSITARIO"):
        return 4 if "COMPLETO" in k and "INCOMPLETO" not in k else 3
    return 5


def trabajo_cat(s) -> int:
    k = clave(s)
    if not k:
        return 6
    if "DESEMPLEADO" in k:
        return 0
    if k.startswith("NO TRABAJA"):
        return 1
    if k in ("ESTABLE CON RELACION DE DEP", "PERMANENTE", "TEMPORARIO"):
        return 2
    if k in ("AUTONOMO", "MONOTRIBUTISTA"):
        return 3
    if k in ("INFORMAL", "CHANGA"):
        return 4
    if k == "JUBILADO":
        return 5
    return 6


def discapacidad_cat(s) -> int:
    k = clave(s)
    if not k:
        return 2
    return 1 if k.startswith("NO POSEE") else 0


def anio_etapa(s) -> int | None:
    m = re.search(r"(20\d\d)", str(s))
    return int(m.group(1)) if m else None


def fechas(serie: pd.Series) -> pd.Series:
    """Fechas como día/mes/año (texto) o fechas reales de Excel."""
    if pd.api.types.is_datetime64_any_dtype(serie):
        return serie
    return pd.to_datetime(serie.astype(str).str.strip().replace({"nan": None, "NaT": None, "": None}), dayfirst=True, errors="coerce", format="mixed")


def digitos(v) -> str:
    return re.sub(r"\D", "", str(int(v)) if isinstance(v, float) and pd.notna(v) else str(v)) if pd.notna(v) else ""


def cuiles(v) -> list[str]:
    """Uno o varios CUIL (11 dígitos) de una celda de capacitador (con o sin guiones, separados por salto de línea o coma)."""
    t = re.sub(r"(?<=\d)[-.](?=\d)", "", str(v)) if pd.notna(v) else ""
    return list(dict.fromkeys(re.findall(r"(?<!\d)\d{11}(?!\d)", t)))


def leer(ruta: Path) -> pd.DataFrame:
    return pd.read_excel(ruta, sheet_name=0)


def preparar_cursos(df: pd.DataFrame) -> pd.DataFrame:
    c = pd.DataFrame({
        "id": pd.to_numeric(df["ID Curso"], errors="coerce"),
        "curso": df["Curso"].map(texto),
        "inst": df["Institución"].map(texto),
        "tipo": df["Tipo Institución"].map(texto),
        "sector": df["Sector Productivo"].map(lambda s: re.sub(r"\s*/\s*", " / ", texto(s)).upper() or SIN_DATO),
        "modalidad": df["Modalidad Cursado"].map(texto).replace("", "SIN MODALIDAD"),
        "etapa": df["Etapa"].map(texto),
        "planif": df["Estado Planif."].map(texto).str.upper(),
        "inicio": fechas(df["Fecha Inicio"]),
        "hs": pd.to_numeric(df["Hs. Presenciales"], errors="coerce").fillna(0).astype(int),
        "dep": df["Departamento"].map(pe.departamento),
        "loc_crudo": df["Localidad"],
        "cuil_cap": df["CUIL Capacitador"],
    })
    c["loc"] = [pe.localidad(d, l) for d, l in zip(c["dep"], c["loc_crudo"])]
    c = c.drop(columns="loc_crudo").dropna(subset=["id"])
    c["id"] = c["id"].astype(int)
    return c.drop_duplicates("id")


def anio_efectivo(inicio: pd.Series, etapa: pd.Series) -> pd.Series:
    return inicio.dt.year.fillna(etapa.map(anio_etapa)).astype("Int64")


def cursos_validos(dfc: pd.DataFrame) -> tuple[pd.DataFrame, int, int, int]:
    """Cursos que entran al tablero: desde 2024 y sin planificaciones desaprobadas o canceladas.
    Devuelve (cursos, total en el archivo, desde 2024, descartados por estado). La usa también la carga nominal (cargar_nominal_cmc.py),
    para que los números del tablero y los listados coincidan."""
    cur = preparar_cursos(dfc)
    cur["anio"] = anio_efectivo(cur["inicio"], cur["etapa"])
    n_total = len(cur)
    cur = cur[cur["anio"].fillna(0) >= DESDE]
    n_desde = len(cur)
    n_excl = int(cur["planif"].isin(EXCLUIR_PLANIF).sum())
    return cur[~cur["planif"].isin(EXCLUIR_PLANIF)].copy(), n_total, n_desde, n_excl


def procesar(cursos_xlsx: Path, asecor_xlsx: Path, actualizado: str) -> tuple[dict, dict]:
    dfc, dfa = leer(cursos_xlsx), leer(asecor_xlsx)
    cur, n_total, n_desde, n_excl = cursos_validos(dfc)

    # Inscripciones de ASECOR
    a = pd.DataFrame({
        "curso_id": pd.to_numeric(dfa["ID Curso"], errors="coerce"),
        "estado": dfa["Estado"].map(estado_alumno),
        "sexo": dfa["Sexo"].map(lambda s: SEXOS.index(clave(s)) if clave(s) in SEXOS else None),
        "edad": dfa["Edad"].map(edad_tramo),
        "estudios": dfa["Educación"].map(estudios_cat),
        "trabajo": dfa["Tipo Trabajo"].map(trabajo_cat),
        "disc": dfa["Posee Discapacidad"].map(discapacidad_cat),
        "persona": [digitos(cu) or digitos(dn) for cu, dn in zip(dfa["CUIL"], dfa["Nro. Documento"])],
    })
    a = a.dropna(subset=["curso_id"]).copy()
    a["curso_id"] = a["curso_id"].astype(int)
    n_insc_total = len(a)
    a = a[a["curso_id"].isin(set(cur["id"]))]
    sin_estado = int(a["estado"].isna().sum())
    a = a[a["estado"].notna()].copy()
    a["estado"] = a["estado"].astype(int)

    # Listas y zonas
    cur = cur.sort_values("id").reset_index(drop=True)
    zonas = sorted(set(zip(cur["dep"], cur["loc"])))
    deps = sorted({d for d, _ in zonas})
    zi = {z: i for i, z in enumerate(zonas)}
    di = {d: i for i, d in enumerate(deps)}
    listas = {k: sorted(set(cur[k])) for k in ("inst", "sector", "tipo", "modalidad", "etapa", "curso")}
    ix = {k: {x: i for i, x in enumerate(v)} for k, v in listas.items()}
    meses = sorted({f"{d.year:04d}-{d.month:02d}" for d in cur["inicio"].dropna()})
    mi = {m: i for i, m in enumerate(meses)}

    # Perfil por curso
    pos_curso = {cid: i for i, cid in enumerate(cur["id"])}
    perfil = [[0] * LARGO_PERFIL for _ in range(len(cur))]
    off, o = {}, 0
    for nombre, cats in CAMPOS_PERFIL:
        off[nombre] = o
        o += len(cats)
    for r in a.itertuples(index=False):
        v = perfil[pos_curso[r.curso_id]]
        v[0] += 1
        v[off["estado"] + r.estado] += 1
        if pd.notna(r.sexo):
            v[off["sexo"] + int(r.sexo)] += 1
        v[off["edad"] + r.edad] += 1
        v[off["estudios"] + r.estudios] += 1
        v[off["trabajo"] + r.trabajo] += 1
        v[off["discapacidad"] + r.disc] += 1

    # Únicos (personas y capacitadores distintos) por zona y etapa
    cur["zona"] = [zi[z] for z in zip(cur["dep"], cur["loc"])]
    cur["etapa_i"] = cur["etapa"].map(ix["etapa"])
    info = cur.set_index("id")[["zona", "etapa_i", "dep"]]
    pers = a.assign(zona=a["curso_id"].map(info["zona"]), etapa=a["curso_id"].map(info["etapa_i"]), dep=a["curso_id"].map(info["dep"]))
    pers = pers[pers["persona"] != ""]
    caps = [(row.zona, row.etapa_i, row.dep, cu) for row in cur.itertuples() for cu in cuiles(row.cuil_cap)]
    capdf = pd.DataFrame(caps, columns=["zona", "etapa", "dep", "cuil"])

    def distintos(df, col):
        return df.groupby(["zona", "etapa"])[col].nunique() if len(df) else pd.Series(dtype=int)

    unicos: dict[tuple, list[int]] = {}
    for zona in [-1] + list(range(len(zonas))):
        for etapa in [-1] + list(range(len(listas["etapa"]))):
            p = pers if zona == -1 else pers[pers["zona"] == zona]
            c = capdf if zona == -1 else capdf[capdf["zona"] == zona]
            if etapa != -1:
                p, c = p[p["etapa"] == etapa], c[c["etapa"] == etapa]
            unicos[(zona, etapa)] = [int(p["persona"].nunique()), int(c["cuil"].nunique())]
    # Además por departamento (zona = -2 - índice de departamento), para la vista de mapa
    for dep in deps:
        for etapa in [-1] + list(range(len(listas["etapa"]))):
            p, c = pers[pers["dep"] == dep], capdf[capdf["dep"] == dep]
            if etapa != -1:
                p, c = p[p["etapa"] == etapa], c[c["etapa"] == etapa]
            unicos[(-2 - di[dep], etapa)] = [int(p["persona"].nunique()), int(c["cuil"].nunique())]

    # Capacitadores de cada curso como números (el orden sale de los CUIL ordenados): no identifican a nadie y permiten contar distintos con cualquier filtro
    numero = {cu: i for i, cu in enumerate(sorted({cu for row in cur.itertuples() for cu in cuiles(row.cuil_cap)}))}
    capacitadores_por_curso = [sorted(numero[cu] for cu in cuiles(row.cuil_cap)) for row in cur.itertuples()]
    filas = []
    for r in cur.itertuples():
        filas.append([r.id, ix["curso"][r.curso], ix["inst"][r.inst], r.zona, ix["sector"][r.sector], ix["tipo"][r.tipo],
                      ix["modalidad"][r.modalidad], r.etapa_i, mi[f"{r.inicio.year:04d}-{r.inicio.month:02d}"] if pd.notna(r.inicio) else -1, r.hs])
    datos = {
        "version": VERSION, "actualizado": actualizado, "desde": f"{DESDE}-01-01",
        "dep": deps, "zonas": [[di[d], l] for d, l in zonas],
        "cursos_nombres": listas["curso"], "inst": listas["inst"], "sectores": listas["sector"], "tipos": listas["tipo"],
        "modalidades": listas["modalidad"], "etapas": listas["etapa"], "meses": meses,
        "campos_perfil": [[n, c] for n, c in CAMPOS_PERFIL],
        "cursos": filas, "perfil": perfil, "capacitadores": capacitadores_por_curso,
        "unicos": [[z, e, v[0], v[1]] for (z, e), v in sorted(unicos.items())],
    }
    meta = {
        "actualizado": actualizado, "desde": DESDE, "cursos": len(cur), "inscripciones": int(len(a)),
        "personas": unicos[(-1, -1)][0], "capacitadores": unicos[(-1, -1)][1],
        "control": {"cursos_en_archivo": n_total, "cursos_desde_2024": n_desde, "cursos_descartados_desaprobados_o_cancelados": n_excl,
                    "inscripciones_en_archivo": n_insc_total, "inscripciones_de_cursos_usados": int(len(a)) + sin_estado, "inscripciones_sin_estado": sin_estado,
                    "cursos_sin_inscripciones": int(sum(1 for v in perfil if v[0] == 0)), "cursos_sin_fecha_de_inicio": int(cur["inicio"].isna().sum())},
    }
    return datos, meta


def descargar(carpeta_id: str, tmp: Path) -> tuple[Path, Path]:
    c, a = tmp / "cursos.xlsx", tmp / "asecor.xlsx"
    dc.bajar_por_nombre(carpeta_id, NOMBRE_CURSOS, c)
    dc.bajar_por_nombre(carpeta_id, NOMBRE_ASECOR, a)
    return c, a


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cursos"), ap.add_argument("--asecor"), ap.add_argument("--salida")
    x = ap.parse_args()
    salida = Path(x.salida) if x.salida else SALIDA
    with tempfile.TemporaryDirectory() as tmp:
        if x.cursos and x.asecor:
            c, a = Path(x.cursos), Path(x.asecor)
        else:
            carpeta = os.environ.get("CBA_DRIVE_CARPETA_ID")
            if not carpeta:
                sys.exit("Falta CBA_DRIVE_CARPETA_ID (o --cursos y --asecor)")
            c, a = descargar(carpeta, Path(tmp))
        hoy = datetime.now(ZoneInfo("America/Argentina/Cordoba")).strftime("%Y-%m-%d")
        datos, meta = procesar(c, a, hoy)
    salida.mkdir(parents=True, exist_ok=True)
    (salida / "cursos.json").write_text(json.dumps(datos, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (salida / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"OK: {meta['cursos']} cursos, {meta['inscripciones']} inscripciones, {meta['personas']} personas, {meta['capacitadores']} capacitadores "
          f"({(salida / 'cursos.json').stat().st_size // 1024} KB).")
    print("Control:", json.dumps(meta["control"], ensure_ascii=False))


if __name__ == "__main__":
    main()
