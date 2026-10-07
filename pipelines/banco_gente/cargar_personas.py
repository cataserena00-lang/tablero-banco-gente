"""Carga de personas (ESTADOS CREDITOS BG.csv) a Postgres (Neon) para la vista nominal del tablero.

IMPORTANTE: estos datos son NOMINALES (nombre, CUIL, documento, deuda). Nunca van al repo, a data/ ni a los
logs. Este script solo imprime cantidades y nombres de columnas, jamás filas ni valores.

Uso:
  python pipelines/banco_gente/cargar_personas.py --input estados.csv --solo-encabezado   # ve columnas, no toca nada
  python pipelines/banco_gente/cargar_personas.py                                          # Drive -> Neon

Variables de entorno:
  NEON_DATABASE_URL_CARGA        conexión del rol "carga" (escritura). Obligatoria salvo --solo-encabezado.
  GOOGLE_SERVICE_ACCOUNT_JSON    cuenta de servicio con acceso de lectura al archivo (si no se usa --input).
  BG_ESTADOS_FILE_ID             ID del archivo en Drive (si no se usa --input).
  FORZAR=1                       recarga aunque el archivo no haya cambiado.

La tabla `personas` se reconstruye completa en cada carga, en una tabla de paso que se intercambia al final
dentro de una transacción (la vista no se interrumpe). Las columnas del CSV se normalizan (sin tildes, minúsculas,
sin <br>); las que se reconocen se renombran a: departamento, localidad, estado, linea, nombre, cuil, nro_doc.
"""
import argparse
import csv
import hashlib
import io
import json
import os
import re
import sys
import tempfile
import unicodedata
from pathlib import Path

# Columna canónica -> patrones (sobre el nombre ya normalizado). El primero que coincide gana.
CANONICAS = {
    "departamento": [r"^departamento"],
    "localidad": [r"^localidad"],
    "estado": [r"^estado"],
    "linea": [r"^linea"],
    "nombre": [r"^nombre", r"^apellido"],
    "cuil": [r"^cuil", r"^cuit"],
    "nro_doc": [r"^nro_?doc", r"^documento", r"^dni"],
}
OBLIGATORIAS = ["departamento", "localidad", "estado", "nombre"]
LOTE_PROGRESO = 100_000


def sin_tildes(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))


def normalizar_columna(nombre: str) -> str:
    """'Nro<br> Doc' -> 'nro_doc'; 'Línea' -> 'linea'; 'Fec.Ultima' -> 'fec_ultima'."""
    s = re.sub(r"<br\s*/?>", " ", str(nombre), flags=re.I)
    s = sin_tildes(s).lower()
    s = re.sub(r"[^a-z0-9]+", "_", s).strip("_")
    return s or "columna"


def columnas_unicas(encabezado: list[str]) -> list[str]:
    """Normaliza y desambigua repetidas (fecha, fecha_2, ...)."""
    vistas: dict[str, int] = {}
    salida = []
    for h in encabezado:
        n = normalizar_columna(h)
        vistas[n] = vistas.get(n, 0) + 1
        salida.append(n if vistas[n] == 1 else f"{n}_{vistas[n]}")
    return salida


def mapear_canonicas(columnas: list[str]) -> list[str]:
    """Renombra a los nombres canónicos las columnas reconocidas. Falla si falta una obligatoria."""
    usadas: set[int] = set()
    destino = list(columnas)
    for canon, patrones in CANONICAS.items():
        for patron in patrones:
            idx = next((i for i, c in enumerate(columnas) if i not in usadas and re.search(patron, c)), None)
            if idx is not None:
                destino[idx] = canon
                usadas.add(idx)
                break
    faltan = [c for c in OBLIGATORIAS if c not in destino]
    if faltan:
        sys.exit(f"Faltan columnas obligatorias {faltan}. Columnas del archivo (normalizadas): {columnas}")
    if len(set(destino)) != len(destino):
        sys.exit(f"Quedaron columnas repetidas tras el mapeo: {destino}")
    return destino


def texto_busqueda(nombre: str, cuil: str, nro_doc: str) -> str:
    """Texto indexado para el buscador: nombre sin tildes en mayúsculas + solo dígitos de CUIL y documento."""
    n = re.sub(r"\s+", " ", sin_tildes(nombre or "")).strip().upper()
    d = " ".join(x for x in (re.sub(r"\D", "", cuil or ""), re.sub(r"\D", "", nro_doc or "")) if x)
    return f"{n} {d}".strip()


def abrir_csv(ruta: Path):
    """Abre el CSV detectando codificación (utf-8 o cp1252) y delimitador (; , tab). Devuelve (archivo, lector)."""
    for cod in ("utf-8-sig", "cp1252"):
        try:
            with open(ruta, encoding=cod, newline="") as f:
                muestra = f.read(1 << 20)
            break
        except UnicodeDecodeError:
            continue
    else:
        sys.exit("No se pudo leer el archivo como utf-8 ni cp1252")
    primera = muestra.splitlines()[0] if muestra else ""
    delim = max([";", ",", "\t"], key=primera.count)
    f = open(ruta, encoding=cod, newline="")
    return f, csv.reader(f, delimiter=delim)


def huella_archivo(ruta: Path) -> str:
    h = hashlib.sha256()
    with open(ruta, "rb") as f:
        for bloque in iter(lambda: f.read(1 << 20), b""):
            h.update(bloque)
    return h.hexdigest()


def descargar_drive(file_id: str, destino: Path) -> None:
    from google.oauth2 import service_account
    from googleapiclient.discovery import build
    from googleapiclient.http import MediaIoBaseDownload
    info = json.loads(os.environ["GOOGLE_SERVICE_ACCOUNT_JSON"])
    cred = service_account.Credentials.from_service_account_info(
        info, scopes=["https://www.googleapis.com/auth/drive.readonly"])
    svc = build("drive", "v3", credentials=cred, cache_discovery=False)
    with open(destino, "wb") as f:
        dl = MediaIoBaseDownload(f, svc.files().get_media(fileId=file_id), chunksize=16 * 1024 * 1024)
        hecho = False
        while not hecho:
            _, hecho = dl.next_chunk()


# ── SQL (solo identificadores que salen de normalizar_columna: [a-z0-9_]) ────────────────────────────────
def sql_crear_tabla(columnas: list[str]) -> str:
    cols = ",\n  ".join(f'"{c}" text' for c in columnas)
    return (f"CREATE TABLE personas_paso (\n  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,\n  {cols},\n"
            f"  busqueda text NOT NULL\n)")


SQL_INDICES = [
    "CREATE INDEX ix_personas_paso_depto_loc ON personas_paso (departamento, localidad)",
    "CREATE INDEX ix_personas_paso_estado ON personas_paso (estado)",
    "CREATE INDEX ix_personas_paso_busqueda ON personas_paso USING gin (busqueda gin_trgm_ops)",
]
SQL_INTERCAMBIO = [
    "DROP TABLE IF EXISTS personas",
    "ALTER TABLE personas_paso RENAME TO personas",
    "ALTER INDEX ix_personas_paso_depto_loc RENAME TO ix_personas_depto_loc",
    "ALTER INDEX ix_personas_paso_estado RENAME TO ix_personas_estado",
    "ALTER INDEX ix_personas_paso_busqueda RENAME TO ix_personas_busqueda",
    "ALTER INDEX personas_paso_pkey RENAME TO personas_pkey",
    "GRANT SELECT ON personas TO lectura",
]


def cargar(ruta: Path, huella: str, forzar: bool) -> None:
    import psycopg   # se importa acá: --solo-encabezado y los tests no lo necesitan
    url = os.environ.get("NEON_DATABASE_URL_CARGA")
    if not url:
        sys.exit("Falta NEON_DATABASE_URL_CARGA")
    f, lector = abrir_csv(ruta)
    with f:
        encabezado = next(lector)
        columnas = mapear_canonicas(columnas_unicas(encabezado))
        i_nombre, i_cuil, i_doc = (columnas.index(c) if c in columnas else None for c in ("nombre", "cuil", "nro_doc"))
        with psycopg.connect(url, autocommit=False) as con, con.cursor() as cur:
            cur.execute("CREATE TABLE IF NOT EXISTS carga_meta (huella text, filas bigint, cargado_en timestamptz DEFAULT now())")
            cur.execute("SELECT huella FROM carga_meta ORDER BY cargado_en DESC LIMIT 1")
            ultima = cur.fetchone()
            if ultima and ultima[0] == huella and not forzar:
                print("Sin cambios en el archivo de origen; no se recarga.")
                return
            cur.execute("DROP TABLE IF EXISTS personas_paso")
            cur.execute(sql_crear_tabla(columnas))
            cols_sql = ", ".join(f'"{c}"' for c in columnas) + ", busqueda"
            n = 0
            with cur.copy(f"COPY personas_paso ({cols_sql}) FROM STDIN") as copia:
                for fila in lector:
                    if not any(fila):
                        continue
                    fila = (fila + [""] * len(columnas))[:len(columnas)]
                    get = lambda i: fila[i] if i is not None else ""
                    copia.write_row([v if v != "" else None for v in fila] +
                                    [texto_busqueda(get(i_nombre), get(i_cuil), get(i_doc))])
                    n += 1
                    if n % LOTE_PROGRESO == 0:
                        print(f"  {n} filas cargadas...", flush=True)
            for sql in SQL_INDICES:
                cur.execute(sql)
            cur.execute("ANALYZE personas_paso")
            for sql in SQL_INTERCAMBIO:
                cur.execute(sql)
            cur.execute("INSERT INTO carga_meta (huella, filas) VALUES (%s, %s)", (huella, n))
            con.commit()
    print(f"OK: {n} filas cargadas en personas ({len(columnas)} columnas).")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", help="CSV local (si no, se descarga de Drive)")
    ap.add_argument("--solo-encabezado", action="store_true", help="imprime las columnas normalizadas y su mapeo; no carga nada")
    a = ap.parse_args()
    with tempfile.TemporaryDirectory() as tmp:
        if a.input:
            ruta = Path(a.input)
        else:
            ruta = Path(tmp) / "estados.csv"
            descargar_drive(os.environ["BG_ESTADOS_FILE_ID"], ruta)
        if a.solo_encabezado:
            f, lector = abrir_csv(ruta)
            with f:
                enc = next(lector)
            cols = columnas_unicas(enc)
            print(f"{len(cols)} columnas. Normalizadas -> destino:")
            destino = mapear_canonicas(cols)
            for o, d in zip(cols, destino):
                print(f"  {o}" + (f"  ->  {d}" if d != o else ""))
            return
        cargar(ruta, huella_archivo(ruta), bool(os.environ.get("FORZAR")))


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as e:   # nunca imprimir el mensaje: un error de COPY puede incluir una fila con datos personales
        print(f"Error en la carga: {type(e).__name__} (detalle omitido para no exponer datos personales)", file=sys.stderr)
        sys.exit(1)
