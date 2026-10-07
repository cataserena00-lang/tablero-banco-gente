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

Cada fila del CSV es una SOLICITUD (un Nro Formulario distinto), no un estado de un mismo trámite: una persona
puede tener varias. Se cargan dos tablas, que se reconstruyen completas en cada carga en tablas de paso que se
intercambian al final dentro de una transacción (la vista no se interrumpe):
  - `personas`          una fila por solicitud, con todas las columnas del CSV + `persona` (clave) y `orden`.
  - `personas_resumen`  una fila por persona, con los datos de su ÚLTIMA solicitud y la cantidad de solicitudes.
La persona se identifica por CUIL (si falta, documento; si falta, nombre). La última solicitud es la de mayor
(año, mes) y, a igual período, la de mayor Nro Formulario.
Las columnas del CSV se normalizan (sin tildes, minúsculas, sin <br>); las que se reconocen se renombran a:
departamento, localidad, estado, linea, nombre, cuil, nro_doc, nro_formulario, ano, mes.
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
    "nro_formulario": [r"^nro_?formulario", r"^formulario"],
    "ano": [r"^a(no|_o)$"],      # "Año"; si el archivo llega con la ñ rota queda "a_o"
    "mes": [r"^mes$"],
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


def solo_digitos(s) -> str:
    return re.sub(r"\D", "", str(s) if s is not None else "")


def entero(v) -> int:
    """'2024', '10', '10.0' -> entero; vacío o no numérico -> 0."""
    try:
        return int(float(str(v).strip().replace(",", ".")))
    except (ValueError, TypeError):
        return 0


def clave_persona(nombre: str, cuil: str, nro_doc: str) -> str:
    """Identifica a la persona entre solicitudes: CUIL; si falta, documento; solo si no hay ninguno, el nombre sin tildes
    (el nombre solo no alcanza: puede escribirse distinto o repetirse entre personas distintas)."""
    c = solo_digitos(cuil)
    if c:
        return "C" + c
    d = solo_digitos(nro_doc)
    if d:
        return "D" + d
    return "N" + re.sub(r"\s+", " ", sin_tildes(nombre or "")).strip().upper()


def calcular_orden(ano, mes, formulario, posicion: int) -> int:
    """Número para ordenar las solicitudes de una persona de la más vieja a la más nueva: (año, mes) y, a igual período,
    Nro Formulario. Si el archivo no trae ni año ni formulario, se respeta el orden de las filas (`posicion`)."""
    a, m = entero(ano), entero(mes)
    if not 1900 <= a <= 2999:
        a = 0
    if not 1 <= m <= 12:
        m = 0
    f = int((solo_digitos(formulario) or "0")[-10:])
    if a == 0 and f == 0:
        f = posicion
    return (a * 100 + m) * 10**10 + f


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
            f"  busqueda text NOT NULL,\n  persona text NOT NULL,\n  orden bigint NOT NULL\n)")


# Columnas de personas_resumen que salen de la última solicitud (si el CSV no trae alguna, queda vacía)
COLUMNAS_RESUMEN = ["nombre", "cuil", "nro_doc", "departamento", "localidad", "estado", "linea", "nro_formulario", "ano", "mes"]

SQL_CREAR_RESUMEN = (
    "CREATE TABLE personas_resumen_paso (\n  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,\n  persona text NOT NULL,\n  "
    + ",\n  ".join(f"{c} text" for c in COLUMNAS_RESUMEN)
    + ",\n  solicitudes integer NOT NULL,\n  busqueda text NOT NULL\n)")


def sql_llenar_resumen(columnas: list[str]) -> str:
    """Una fila por persona: la de mayor `orden`, más la cantidad de solicitudes (count sobre todas las filas de la persona)."""
    sel = ", ".join(f'"{c}"' if c in columnas else "NULL::text" for c in COLUMNAS_RESUMEN)
    return (f"INSERT INTO personas_resumen_paso (persona, {', '.join(COLUMNAS_RESUMEN)}, solicitudes, busqueda)\n"
            f"SELECT DISTINCT ON (persona) persona, {sel}, count(*) OVER (PARTITION BY persona), busqueda\n"
            f"FROM personas_paso ORDER BY persona, orden DESC")


SQL_INDICES = [
    "CREATE INDEX ix_personas_paso_persona ON personas_paso (persona, orden DESC)",
]
SQL_INDICES_RESUMEN = [
    "CREATE INDEX ix_resumen_paso_depto_loc ON personas_resumen_paso (departamento, localidad)",
    "CREATE INDEX ix_resumen_paso_estado ON personas_resumen_paso (estado)",
    "CREATE INDEX ix_resumen_paso_linea ON personas_resumen_paso (linea)",
    "CREATE INDEX ix_resumen_paso_nombre ON personas_resumen_paso (nombre, id)",
    "CREATE INDEX ix_resumen_paso_busqueda ON personas_resumen_paso USING gin (busqueda gin_trgm_ops)",
]
SQL_INTERCAMBIO = [
    "DROP TABLE IF EXISTS personas",
    "DROP TABLE IF EXISTS personas_resumen",
    "ALTER TABLE personas_paso RENAME TO personas",
    "ALTER INDEX ix_personas_paso_persona RENAME TO ix_personas_persona",
    "ALTER INDEX personas_paso_pkey RENAME TO personas_pkey",
    "ALTER TABLE personas_resumen_paso RENAME TO personas_resumen",
    "ALTER INDEX ix_resumen_paso_depto_loc RENAME TO ix_resumen_depto_loc",
    "ALTER INDEX ix_resumen_paso_estado RENAME TO ix_resumen_estado",
    "ALTER INDEX ix_resumen_paso_linea RENAME TO ix_resumen_linea",
    "ALTER INDEX ix_resumen_paso_nombre RENAME TO ix_resumen_nombre",
    "ALTER INDEX ix_resumen_paso_busqueda RENAME TO ix_resumen_busqueda",
    "ALTER INDEX personas_resumen_paso_pkey RENAME TO personas_resumen_pkey",
    "GRANT SELECT ON personas TO lectura",
    "GRANT SELECT ON personas_resumen TO lectura",
]


def debe_omitir(huella_anterior: str | None, huella: str, forzar: bool, tiene_resumen: bool) -> bool:
    """No se recarga solo si el archivo es el mismo, no se pidió forzar y la estructura actual (personas_resumen) ya existe.
    Si faltara personas_resumen (por ejemplo, la última carga fue de una versión anterior del cargador), se recarga igual."""
    return huella_anterior == huella and not forzar and tiene_resumen


def cargar(ruta: Path, huella: str, forzar: bool) -> None:
    import psycopg   # se importa acá: --solo-encabezado y los tests no lo necesitan
    url = os.environ.get("NEON_DATABASE_URL_CARGA")
    if not url:
        sys.exit("Falta NEON_DATABASE_URL_CARGA")
    f, lector = abrir_csv(ruta)
    with f:
        encabezado = next(lector)
        columnas = mapear_canonicas(columnas_unicas(encabezado))
        i_nombre, i_cuil, i_doc, i_form, i_ano, i_mes = (
            columnas.index(c) if c in columnas else None for c in ("nombre", "cuil", "nro_doc", "nro_formulario", "ano", "mes"))
        with psycopg.connect(url, autocommit=False) as con, con.cursor() as cur:
            cur.execute("CREATE TABLE IF NOT EXISTS carga_meta (huella text, filas bigint, cargado_en timestamptz DEFAULT now())")
            cur.execute("SELECT huella FROM carga_meta ORDER BY cargado_en DESC LIMIT 1")
            ultima = cur.fetchone()
            cur.execute("SELECT to_regclass('public.personas_resumen') IS NOT NULL")
            tiene_resumen = bool(cur.fetchone()[0])
            if debe_omitir(ultima[0] if ultima else None, huella, forzar, tiene_resumen):
                print("Sin cambios en el archivo de origen; no se recarga.")
                return
            if ultima and ultima[0] == huella and not forzar:
                print("El archivo no cambió, pero falta personas_resumen: se recarga para crearla.")
            cur.execute("DROP TABLE IF EXISTS personas_paso")
            cur.execute("DROP TABLE IF EXISTS personas_resumen_paso")
            cur.execute(sql_crear_tabla(columnas))
            cols_sql = ", ".join(f'"{c}"' for c in columnas) + ", busqueda, persona, orden"
            n = 0
            with cur.copy(f"COPY personas_paso ({cols_sql}) FROM STDIN") as copia:
                for fila in lector:
                    if not any(fila):
                        continue
                    fila = (fila + [""] * len(columnas))[:len(columnas)]
                    get = lambda i: fila[i] if i is not None else ""
                    n += 1
                    copia.write_row([v if v != "" else None for v in fila] + [
                        texto_busqueda(get(i_nombre), get(i_cuil), get(i_doc)),
                        clave_persona(get(i_nombre), get(i_cuil), get(i_doc)),
                        calcular_orden(get(i_ano), get(i_mes), get(i_form), n),
                    ])
                    if n % LOTE_PROGRESO == 0:
                        print(f"  {n} filas cargadas...", flush=True)
            for sql in SQL_INDICES:
                cur.execute(sql)
            cur.execute(SQL_CREAR_RESUMEN)
            cur.execute(sql_llenar_resumen(columnas))
            for sql in SQL_INDICES_RESUMEN:
                cur.execute(sql)
            cur.execute("ANALYZE personas_paso")
            cur.execute("ANALYZE personas_resumen_paso")
            cur.execute("SELECT count(*) FROM personas_resumen_paso")
            personas = cur.fetchone()[0]
            for sql in SQL_INTERCAMBIO:
                cur.execute(sql)
            cur.execute("INSERT INTO carga_meta (huella, filas) VALUES (%s, %s)", (huella, n))
            con.commit()
    print(f"OK: {n} solicitudes cargadas en personas ({len(columnas)} columnas) y {personas} personas en personas_resumen.")


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
