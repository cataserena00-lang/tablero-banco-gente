"""Carga a Postgres (Neon) los datos NOMINALES de Córdoba me capacita, para los listados y exportables del tablero.

IMPORTANTE: son datos personales (participantes y capacitadores) y costos. Nunca van al repo, a data/ ni a los logs: este script solo
imprime cantidades. Los listados los sirve el servidor solo a los perfiles completo y admin.

Uso:
  python pipelines/cba_me_capacita/cargar_nominal_cmc.py            # Drive -> Neon (o --cursos/--asecor con archivos locales)

Variables de entorno:
  NEON_DATABASE_URL_CARGA   conexión del rol "carga" (escritura). Obligatoria.
  GOOGLE_SERVICE_ACCOUNT_JSON, CBA_DRIVE_CARPETA_ID   para bajar los reportes de Drive (si no se usan --cursos y --asecor).
  FORZAR=1                  recarga aunque los archivos no hayan cambiado.

Las tablas se reconstruyen completas en cada carga (tablas de paso + intercambio en una transacción):
  cmc_cursos          un curso por fila, con su zona (zona_dep, zona_loc, los mismos nombres que usa el tablero), horas y costos
  cmc_capacitadores   un capacitador por curso (los cursos con varios traen varias filas)
  cmc_participantes   una inscripción por fila (persona + curso + estado), con los datos de contacto y el perfil
Solo se cargan los mismos cursos que entran al tablero (desde 2024, sin planificaciones desaprobadas o canceladas) y las inscripciones de esos cursos.
"""
import argparse
import hashlib
import os
import re
import sys
import tempfile
from pathlib import Path

import pandas as pd

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))
import procesar_cmc as pc  # noqa: E402

LOTE_PROGRESO = 20_000

COLUMNAS_CURSOS = [
    ("id_curso", "integer"), ("curso", "text"), ("institucion", "text"), ("tipo_institucion", "text"), ("etapa", "text"),
    ("estado_planificacion", "text"), ("sector", "text"), ("trayecto", "text"), ("modalidad", "text"), ("fecha_inicio", "date"),
    ("fecha_fin", "date"), ("hs_presenciales", "integer"), ("hs_a_pagar", "integer"), ("sede", "text"), ("zona_dep", "text"),
    ("zona_loc", "text"), ("condicion_pago", "text"), ("partida", "text"), ("total_honorarios", "bigint"), ("mat_pedagogico", "bigint"),
    ("total", "bigint"), ("inscriptos", "integer"),
]
COLUMNAS_CAPACITADORES = [("id_curso", "integer"), ("apellido", "text"), ("nombre", "text"), ("cuil", "text")]
COLUMNAS_PARTICIPANTES = [
    ("id_curso", "integer"), ("estado", "text"), ("apellido", "text"), ("nombre", "text"), ("cuil", "text"), ("dni", "text"),
    ("fecha_nacimiento", "date"), ("edad", "integer"), ("sexo", "text"), ("telefono", "text"), ("telefono_alt", "text"), ("mail", "text"),
    ("educacion", "text"), ("asiste_establecimiento", "text"), ("ambito_educativo", "text"), ("discapacidad", "text"),
    ("tipo_discapacidad", "text"), ("tipo_trabajo", "text"), ("zona_dep", "text"), ("zona_loc", "text"),
]


def txt(v) -> str | None:
    if v is None or (not isinstance(v, str) and pd.isna(v)):
        return None
    t = re.sub(r"\s+", " ", str(v)).strip()
    return t or None


def num_texto(v) -> str | None:
    """CUIL, DNI y teléfonos como texto de dígitos (Excel los trae como número)."""
    if v is None or (not isinstance(v, str) and pd.isna(v)):
        return None
    d = re.sub(r"\D", "", str(int(v)) if isinstance(v, float) else str(v))
    return d or None


def entero(v) -> int | None:
    try:
        return None if pd.isna(v) else int(round(float(v)))
    except (TypeError, ValueError):
        return None


def fecha(v):
    if v is None or pd.isna(v):
        return None
    return v.date() if hasattr(v, "date") else None


def edad_valida(v) -> int | None:
    e = entero(v)
    return e if e is not None and 3 <= e <= 100 else None   # hay edades imposibles (años en vez de edad)


def partes(v) -> list[str]:
    """Una celda de capacitadores con varios (uno por línea) -> lista."""
    if v is None or (not isinstance(v, str) and pd.isna(v)):
        return []
    return [re.sub(r"\s+", " ", x).strip() for x in re.split(r"[\r\n]+", str(v)) if x.strip()]


def capacitadores(dfc: pd.DataFrame, ids_validos: set[int]) -> list[tuple]:
    """(id_curso, apellido, nombre, cuil) por capacitador. Las tres columnas traen las listas en el mismo orden, una por línea."""
    filas, vistos = [], set()
    ape, nom, cui = dfc["Apellido Capacitador"], dfc["Nombre Capacitador"], dfc["CUIL Capacitador"]
    for cid, a, n, c in zip(dfc["ID Curso"], ape, nom, cui):
        if pd.isna(cid) or int(cid) not in ids_validos:
            continue
        cid = int(cid)
        la, ln, lc = partes(a), partes(n), [x for x in (num_texto(y) for y in re.split(r"[\r\n]+", str(c)) if pd.notna(c)) if x]
        k = max(len(la), len(ln), len(lc))
        for i in range(k):
            fila = (cid, la[i] if i < len(la) else None, ln[i] if i < len(ln) else None, lc[i] if i < len(lc) else None)
            if fila in vistos:
                continue
            vistos.add(fila)
            filas.append(fila)
    return filas


def armar(dfc: pd.DataFrame, dfa: pd.DataFrame):
    cur, *_ = pc.cursos_validos(dfc)
    ids = set(cur["id"])
    zona = {r.id: (r.dep, r.loc) for r in cur.itertuples()}
    a = dfa[pd.to_numeric(dfa["ID Curso"], errors="coerce").isin(ids)].copy()
    a["id_curso"] = pd.to_numeric(a["ID Curso"]).astype(int)
    insc = a.groupby("id_curso").size()
    raw = dfc.copy()
    raw["_id"] = pd.to_numeric(raw["ID Curso"], errors="coerce")
    raw = raw.dropna(subset=["_id"]).drop_duplicates("_id")
    raw["_id"] = raw["_id"].astype(int)
    raw["_fin"] = pc.fechas(raw["Fecha Fin"]) if "Fecha Fin" in raw else pd.NaT
    raw = raw.set_index("_id")
    filas_c = []
    for r in cur.itertuples():
        x = raw.loc[r.id]
        filas_c.append((
            r.id, txt(r.curso), txt(r.inst), txt(r.tipo), txt(r.etapa), txt(r.planif), txt(r.sector), txt(x.get("Trayecto Formativo")),
            txt(r.modalidad), fecha(r.inicio), fecha(x["_fin"]), entero(r.hs), entero(x.get("Hs. A Pagar")),
            txt(x.get("Sede")), r.dep, r.loc, txt(x.get("Condición de Pago")), txt(x.get("Partida Presupuestaria")),
            entero(x.get("Total Honorarios")), entero(x.get("Mat. Pedagógico")), entero(x.get("Total")), int(insc.get(r.id, 0)),
        ))
    filas_cap = capacitadores(dfc, ids)
    nac = pc.fechas(a["Fecha Nacimiento"]) if "Fecha Nacimiento" in a else pd.Series([None] * len(a), index=a.index)
    filas_p = []
    cols = {c: a[c].tolist() for c in ["id_curso", "Estado", "Apellido", "Nombre", "CUIL", "Nro. Documento", "Edad", "Sexo", "Teléfono", "Teléfono Alt.",
                                        "Mail", "Educación", "Asiste Establecimiento Educativo", "Ámbito Educativo", "Posee Discapacidad",
                                        "Tipo Discapacidad", "Tipo Trabajo"]}
    nacs = nac.tolist()
    for k in range(len(a)):
        cid = cols["id_curso"][k]
        dep, loc = zona[cid]
        filas_p.append((
            cid, txt(cols["Estado"][k]), txt(cols["Apellido"][k]), txt(cols["Nombre"][k]), num_texto(cols["CUIL"][k]), num_texto(cols["Nro. Documento"][k]),
            fecha(nacs[k]), edad_valida(cols["Edad"][k]), txt(cols["Sexo"][k]), num_texto(cols["Teléfono"][k]), num_texto(cols["Teléfono Alt."][k]),
            txt(cols["Mail"][k]), txt(cols["Educación"][k]), txt(cols["Asiste Establecimiento Educativo"][k]), txt(cols["Ámbito Educativo"][k]),
            txt(cols["Posee Discapacidad"][k]), txt(cols["Tipo Discapacidad"][k]), txt(cols["Tipo Trabajo"][k]), dep, loc,
        ))
    return filas_c, filas_cap, filas_p


def ddl(nombre: str, columnas: list[tuple[str, str]], clave: str | None) -> str:
    cols = ",\n  ".join(f'"{n}" {t}' for n, t in columnas)
    pk = f'"{clave}" integer PRIMARY KEY,\n  ' if clave else "id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,\n  "
    if clave:
        cols = ",\n  ".join(f'"{n}" {t}' for n, t in columnas if n != clave)
    return f"CREATE TABLE {nombre}_paso (\n  {pk}{cols}\n)"


TABLAS = [("cmc_cursos", "id_curso"), ("cmc_capacitadores", None), ("cmc_participantes", None)]
INDICES = [
    "CREATE INDEX ix_cmc_cursos_paso_zona ON cmc_cursos_paso (zona_dep, zona_loc)",
    "CREATE INDEX ix_cmc_capacitadores_paso_curso ON cmc_capacitadores_paso (id_curso)",
    "CREATE INDEX ix_cmc_capacitadores_paso_cuil ON cmc_capacitadores_paso (cuil)",
    "CREATE INDEX ix_cmc_participantes_paso_curso ON cmc_participantes_paso (id_curso)",
    "CREATE INDEX ix_cmc_participantes_paso_zona ON cmc_participantes_paso (zona_dep, zona_loc)",
    "CREATE INDEX ix_cmc_participantes_paso_cuil ON cmc_participantes_paso (cuil)",
]


def intercambio() -> list[str]:
    sql = []
    for t, clave in TABLAS:
        sql += [f"DROP TABLE IF EXISTS {t}", f"ALTER TABLE {t}_paso RENAME TO {t}"]
        sql.append(f"ALTER INDEX {t}_paso_pkey RENAME TO {t}_pkey")
        sql.append(f"GRANT SELECT ON {t} TO lectura")
        # Rol de solo lectura sin privilegios de Neon (lectura_ro): si existe, también puede leer las tablas nuevas
        sql.append(f"DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lectura_ro') THEN EXECUTE 'GRANT SELECT ON {t} TO lectura_ro'; END IF; END $$")
    for ix in INDICES:
        nombre = ix.split()[2]
        sql.append(f"ALTER INDEX {nombre} RENAME TO {nombre.replace('_paso_', '_', 1)}")
    return sql


def cargar(filas_c, filas_cap, filas_p, huella: str, forzar: bool) -> None:
    import psycopg   # se importa acá: los tests no lo necesitan
    url = os.environ.get("NEON_DATABASE_URL_CARGA")
    if not url:
        sys.exit("Falta NEON_DATABASE_URL_CARGA")
    with psycopg.connect(url, autocommit=False) as con, con.cursor() as cur:
        cur.execute("CREATE TABLE IF NOT EXISTS carga_meta_cmc (huella text, cursos bigint, participantes bigint, cargado_en timestamptz DEFAULT now())")
        cur.execute("SELECT huella FROM carga_meta_cmc ORDER BY cargado_en DESC LIMIT 1")
        ultima = cur.fetchone()
        cur.execute("SELECT to_regclass('public.cmc_participantes') IS NOT NULL")
        existe = cur.fetchone()[0]
        if ultima and ultima[0] == huella and existe and not forzar:
            print("Sin cambios en los archivos de origen; no se recarga.")
            return
        for t, _ in TABLAS:
            cur.execute(f"DROP TABLE IF EXISTS {t}_paso")
        cur.execute(ddl("cmc_cursos", COLUMNAS_CURSOS, "id_curso"))
        cur.execute(ddl("cmc_capacitadores", COLUMNAS_CAPACITADORES, None))
        cur.execute(ddl("cmc_participantes", COLUMNAS_PARTICIPANTES, None))
        for nombre, cols, filas in (("cmc_cursos", COLUMNAS_CURSOS, filas_c), ("cmc_capacitadores", COLUMNAS_CAPACITADORES, filas_cap),
                                    ("cmc_participantes", COLUMNAS_PARTICIPANTES, filas_p)):
            lista = ", ".join(f'"{n}"' for n, _ in cols)
            with cur.copy(f"COPY {nombre}_paso ({lista}) FROM STDIN") as copia:
                for i, f in enumerate(filas, 1):
                    copia.write_row(f)
                    if i % LOTE_PROGRESO == 0:
                        print(f"  {nombre}: {i} filas...", flush=True)
        for ix in INDICES:
            cur.execute(ix)
        for t, _ in TABLAS:
            cur.execute(f"ANALYZE {t}_paso")
        for sql in intercambio():
            cur.execute(sql)
        cur.execute("INSERT INTO carga_meta_cmc (huella, cursos, participantes) VALUES (%s, %s, %s)", (huella, len(filas_c), len(filas_p)))
        con.commit()
    print(f"OK: {len(filas_c)} cursos, {len(filas_cap)} capacitadores y {len(filas_p)} inscripciones cargados.")


def huella_archivos(*rutas: Path) -> str:
    h = hashlib.sha256()
    for r in rutas:
        with open(r, "rb") as f:
            for bloque in iter(lambda: f.read(1 << 20), b""):
                h.update(bloque)
    return h.hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cursos"), ap.add_argument("--asecor")
    x = ap.parse_args()
    with tempfile.TemporaryDirectory() as tmp:
        if x.cursos and x.asecor:
            c, a = Path(x.cursos), Path(x.asecor)
        else:
            carpeta = os.environ.get("CBA_DRIVE_CARPETA_ID")
            if not carpeta:
                sys.exit("Falta CBA_DRIVE_CARPETA_ID (o --cursos y --asecor)")
            c, a = pc.descargar(carpeta, Path(tmp))
        huella = huella_archivos(c, a)
        filas_c, filas_cap, filas_p = armar(pc.leer(c), pc.leer(a))
    cargar(filas_c, filas_cap, filas_p, huella, bool(os.environ.get("FORZAR")))


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as e:   # nunca imprimir el mensaje: un error de COPY puede incluir una fila con datos personales
        print(f"Error en la carga: {type(e).__name__} (detalle omitido para no exponer datos personales)", file=sys.stderr)
        sys.exit(1)
