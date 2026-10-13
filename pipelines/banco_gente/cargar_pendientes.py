"""Carga la base de PENDIENTES DE ENTREGA (el Excel de Drive, una fila por crédito) a Postgres (Neon), para que el tablero
exporte a Excel el listado de créditos de una zona (departamento, localidad o barrio de Córdoba).

IMPORTANTE: son datos NOMINALES. Nunca van al repo, a data/ ni a los logs: este script solo imprime cantidades y nombres de
columnas, jamás filas ni valores. El listado lo sirve el servidor solo a los perfiles completo y admin.

Uso:
  python pipelines/banco_gente/cargar_pendientes.py --input base.xlsx --solo-encabezado   # ve las columnas, no toca nada
  python pipelines/banco_gente/cargar_pendientes.py                                         # Drive -> Neon

Variables de entorno:
  NEON_DATABASE_URL_CARGA        conexión del rol "carga" (escritura). Obligatoria salvo --solo-encabezado.
  GOOGLE_SERVICE_ACCOUNT_JSON    cuenta de servicio con acceso de lectura al archivo (si no se usa --input).
  BG_DRIVE_FILE_ID               ID del Excel en Drive (si no se usa --input).
  FORZAR=1                       recarga aunque el archivo no haya cambiado.

La tabla `pendientes` se reconstruye completa en cada carga (tabla de paso + intercambio en una transacción). Trae TODAS las
columnas del Excel (con los nombres normalizados: sin tildes, minúsculas, sin <br>) y estas, calculadas con las mismas reglas
que el tablero, para poder filtrar por zona con exactamente los mismos nombres:
  zona_dep, zona_loc   departamento y localidad normalizados (como en cubo.json)
  barrio               barrio depurado (solo Capital; '' si el domicilio no informa barrio; NULL fuera de Capital)
  circuito             "código - nombre" del circuito del barrio, si lo tiene
  linea_oficial        Libre disponibilidad / Iniciar emprendimiento / Potenciar emprendimiento / Otras líneas
"""
import argparse
import hashlib
import io
import os
import re
import sys
import tempfile
from pathlib import Path

import pandas as pd
import yaml

sys.path.insert(0, str(Path(__file__).parent))
import barrios_match as bm  # noqa: E402
import cargar_personas as cp  # noqa: E402
import procesar as pr  # noqa: E402
import procesar_estados as pe  # noqa: E402

AQUI = Path(__file__).parent
DERIVADAS = ["zona_dep", "zona_loc", "barrio", "circuito", "linea_oficial"]
LOTE_PROGRESO = 5_000


def columnas_originales(df: pd.DataFrame) -> list[str]:
    """Nombres normalizados y únicos de las columnas del Excel (mismo criterio que la base de personas)."""
    return cp.columnas_unicas([re.sub(r"\s+", " ", str(c).replace("<br>", " ")).strip() for c in df.columns])


def tipo_sql(serie: pd.Series) -> str:
    """Tipo de la columna en Postgres según lo que trae el Excel: fechas, números o texto."""
    if pd.api.types.is_datetime64_any_dtype(serie):
        return "date"
    if pd.api.types.is_bool_dtype(serie):
        return "text"
    if pd.api.types.is_numeric_dtype(serie):
        return "double precision"
    return "text"


def valor(v, tipo: str):
    """Celda lista para COPY: None si está vacía; fecha como date; número como float; texto sin espacios de más."""
    if v is None or (not isinstance(v, str) and pd.isna(v)):
        return None
    if tipo == "date":
        return v.date() if hasattr(v, "date") else None
    if tipo == "double precision":
        return float(v)
    t = re.sub(r"\s+", " ", str(v)).strip()
    return t or None


def preparar(df: pd.DataFrame, cfg: dict, conciliador: "bm.Conciliador") -> tuple[pd.DataFrame, dict[str, str]]:
    """Devuelve el DataFrame con las columnas normalizadas más las derivadas, y el tipo SQL de cada columna."""
    c = cfg["columnas"]
    crudas = [re.sub(r"\s+", " ", str(x).replace("<br>", " ")).strip() for x in df.columns]
    df = df.copy()
    df.columns = crudas
    falta = [v for v in c.values() if re.sub(r"\s+", " ", v) not in df.columns]
    if falta:
        sys.exit(f"Faltan columnas en el Excel: {falta}")
    col = lambda k: df[re.sub(r"\s+", " ", c[k])]
    zona_dep = col("departamento").map(pr.norm).replace("", pr.norm("SIN DATO"))
    zona_loc = col("localidad").map(pr.norm).replace("", pr.norm("SIN DATO"))
    es_cap = (zona_loc == cfg["capital"]["localidad"]) & (zona_dep == cfg["capital"]["departamento"])
    domicilio = col("domicilio").map(pr.norm)
    barrio_crudo = domicilio.where(es_cap, "").map(lambda d: pr.extraer_barrio(d) if d else "")
    matches = conciliador.conciliar(barrio_crudo[es_cap].unique())
    barrio = pd.Series([matches[b].nombre_mostrado if cap else None for b, cap in zip(barrio_crudo, es_cap)], index=df.index)
    circuito = pd.Series([
        (f"{matches[b].codigo_circuito} - {matches[b].circuito}" if cap and matches[b].con_circuito else None)
        for b, cap in zip(barrio_crudo, es_cap)], index=df.index)
    out = df.copy()
    out.columns = columnas_originales(df)
    out["zona_dep"], out["zona_loc"], out["barrio"], out["circuito"] = zona_dep.values, zona_loc.values, barrio.values, circuito.values
    out["linea_oficial"] = col("linea").map(pe.linea).values
    tipos = {n: tipo_sql(out[n]) for n in out.columns}
    for n in DERIVADAS:
        tipos[n] = "text"
    return out, tipos


def sql_crear_tabla(tipos: dict[str, str]) -> str:
    cols = ",\n  ".join(f'"{n}" {t}' for n, t in tipos.items())
    return f"CREATE TABLE pendientes_paso (\n  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,\n  {cols}\n)"


SQL_INDICES = [
    "CREATE INDEX ix_pendientes_paso_zona ON pendientes_paso (zona_dep, zona_loc)",
    "CREATE INDEX ix_pendientes_paso_barrio ON pendientes_paso (barrio)",
]
SQL_INTERCAMBIO = [
    "DROP TABLE IF EXISTS pendientes",
    "ALTER TABLE pendientes_paso RENAME TO pendientes",
    "ALTER INDEX ix_pendientes_paso_zona RENAME TO ix_pendientes_zona",
    "ALTER INDEX ix_pendientes_paso_barrio RENAME TO ix_pendientes_barrio",
    "ALTER INDEX pendientes_paso_pkey RENAME TO pendientes_pkey",
    "GRANT SELECT ON pendientes TO lectura",
    # Rol de solo lectura sin privilegios de Neon (lectura_ro): si existe, también puede leer la tabla nueva
    "DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lectura_ro') THEN "
    "EXECUTE 'GRANT SELECT ON pendientes TO lectura_ro'; END IF; END $$",
]


def cargar(df: pd.DataFrame, tipos: dict[str, str], huella: str, forzar: bool) -> None:
    import psycopg   # se importa acá: --solo-encabezado y los tests no lo necesitan
    url = os.environ.get("NEON_DATABASE_URL_CARGA")
    if not url:
        sys.exit("Falta NEON_DATABASE_URL_CARGA")
    nombres = list(tipos)
    with psycopg.connect(url, autocommit=False) as con, con.cursor() as cur:
        cur.execute("CREATE TABLE IF NOT EXISTS carga_meta_pendientes (huella text, filas bigint, cargado_en timestamptz DEFAULT now())")
        cur.execute("SELECT huella FROM carga_meta_pendientes ORDER BY cargado_en DESC LIMIT 1")
        ultima = cur.fetchone()
        cur.execute("SELECT to_regclass('public.pendientes') IS NOT NULL")
        existe = cur.fetchone()[0]
        if ultima and ultima[0] == huella and existe and not forzar:
            print("Sin cambios en el archivo de origen; no se recarga.")
            return
        cur.execute("DROP TABLE IF EXISTS pendientes_paso")
        cur.execute(sql_crear_tabla(tipos))
        cols_sql = ", ".join(f'"{n}"' for n in nombres)
        n = 0
        with cur.copy(f"COPY pendientes_paso ({cols_sql}) FROM STDIN") as copia:
            for fila in df[nombres].itertuples(index=False, name=None):
                copia.write_row([valor(v, tipos[nom]) for v, nom in zip(fila, nombres)])
                n += 1
                if n % LOTE_PROGRESO == 0:
                    print(f"  {n} filas cargadas...", flush=True)
        for sql in SQL_INDICES:
            cur.execute(sql)
        cur.execute("ANALYZE pendientes_paso")
        for sql in SQL_INTERCAMBIO:
            cur.execute(sql)
        cur.execute("INSERT INTO carga_meta_pendientes (huella, filas) VALUES (%s, %s)", (huella, n))
        con.commit()
    print(f"OK: {n} créditos pendientes cargados en la tabla pendientes ({len(nombres)} columnas).")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", help="Excel local (si no, se descarga de Drive)")
    ap.add_argument("--solo-encabezado", action="store_true", help="imprime las columnas del Excel; no carga nada")
    a = ap.parse_args()
    cfg = yaml.safe_load((AQUI / "config.yaml").read_text(encoding="utf-8"))
    raw = Path(a.input).read_bytes() if a.input else pr.descargar_drive(os.environ[cfg["drive_file_id_env"]])
    huella = hashlib.sha256(raw).hexdigest()
    df = pd.read_excel(io.BytesIO(raw))
    if a.solo_encabezado:
        cols = columnas_originales(df)
        print(f"{len(cols)} columnas, {len(df)} filas. Columnas normalizadas:")
        for o, n in zip(df.columns, cols):
            print(f"  {re.sub(r'<br>', ' ', str(o))}  ->  {n}  ({tipo_sql(df[o])})")
        return
    conciliador = bm.Conciliador(AQUI / "barrios_cordoba.xlsx", AQUI / "barrios_alias.csv")
    out, tipos = preparar(df, cfg, conciliador)
    cargar(out, tipos, huella, bool(os.environ.get("FORZAR")))


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as e:   # nunca imprimir el mensaje: un error de COPY puede incluir una fila con datos personales
        print(f"Error en la carga: {type(e).__name__} (detalle omitido para no exponer datos personales)", file=sys.stderr)
        sys.exit(1)
