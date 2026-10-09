"""Agregados de créditos por estado (todas las solicitudes) para el tablero. SIN datos personales.

Lee el mismo CSV que la vista de personas (ESTADOS CREDITOS BG.csv) y escribe `data/banco_gente/estados.json`:
cantidades y montos por departamento, localidad, estado, línea y mes. No guarda nombres, CUIL, documentos ni filas.

Cada fila del CSV es una SOLICITUD (un crédito). El tablero las agrupa en categorías de estado (lib/estados.ts)
para mostrar, además de lo pendiente de entrega, lo que ya se hizo en cada zona.

Uso:
  python pipelines/banco_gente/procesar_estados.py --input estados.csv     # local
  python pipelines/banco_gente/procesar_estados.py                          # descarga de Drive (BG_ESTADOS_FILE_ID)

Formato de estados.json (todo son índices a las listas del mismo archivo):
  dep, loc, estados, lineas   listas de nombres (departamentos y localidades sin tildes y en mayúsculas)
  meses                       "AAAA-MM" del año y mes de la solicitud
  zonas                       [dep, loc, estado, linea, creditos, monto]
  serie                       [mes, dep, estado, creditos, monto]
"""
import argparse
import hashlib
import json
import os
import re
import sys
import tempfile
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).parent))
import cargar_personas as cp  # noqa: E402

SALIDA = Path(__file__).resolve().parents[2] / "data" / "banco_gente"

# Los 26 departamentos de Córdoba más los dos comodines que ya usa el pipeline de pendientes
DEPARTAMENTOS = [
    "CALAMUCHITA", "CAPITAL", "COLON", "CRUZ DEL EJE", "GENERAL ROCA", "GENERAL SAN MARTIN", "ISCHILIN", "JUAREZ CELMAN",
    "MARCOS JUAREZ", "MINAS", "POCHO", "PRESIDENTE ROQUE SAENZ PENA", "PUNILLA", "RIO CUARTO", "RIO PRIMERO", "RIO SECO",
    "RIO SEGUNDO", "SAN ALBERTO", "SAN JAVIER", "SAN JUSTO", "SANTA MARIA", "SOBREMONTE", "TERCERO ARRIBA", "TOTORAL",
    "TULUMBA", "UNION", "SIN ASIGNAR",
]
SIN_DATO = "SIN DATO"
# Grafías alternativas de departamentos (ya sin tildes ni puntuación)
ALIAS_DEPARTAMENTO = {"PTE ROQUE SAENZ PENA": "PRESIDENTE ROQUE SAENZ PENA", "PRES ROQUE SAENZ PENA": "PRESIDENTE ROQUE SAENZ PENA"}
LOCALIDAD_CAPITAL = "CORDOBA"   # el CSV la trae como "CORDOBA CAPITAL"; el resto del tablero, como "CORDOBA"

LIBRE, INICIAR, POTENCIAR, OTRAS = "Libre disponibilidad", "Iniciar emprendimiento", "Potenciar emprendimiento", "Otras líneas"
LINEAS = [LIBRE, INICIAR, POTENCIAR, OTRAS]
LINEA_POR_CLAVE = {
    "LIBRE DISPONIBILIDAD": LIBRE, "L2": LIBRE,
    "INICIAR EMPRENDIMIENTO": INICIAR, "L4": INICIAR,
    "POTENCIAR EMPRENDIMIENTO": POTENCIAR, "PE": POTENCIAR,
}


def clave(s) -> str:
    """Sin tildes, mayúsculas, solo letras y números separados por un espacio."""
    return re.sub(r"[^A-Z0-9]+", " ", cp.sin_tildes(str(s or "")).upper()).strip()


def departamento(s) -> str:
    k = ALIAS_DEPARTAMENTO.get(clave(s), clave(s))
    return k if k in DEPARTAMENTOS else SIN_DATO


def localidad(dep: str, s) -> str:
    k = re.sub(r"\s+", " ", cp.sin_tildes(str(s or "")).upper()).strip()
    if not k or k.isdigit() or clave(k) in ("S D", "SD", "SIN DATO"):
        return SIN_DATO
    if dep == "CAPITAL" and k == "CORDOBA CAPITAL":
        return LOCALIDAD_CAPITAL
    return k


def linea(s) -> str:
    return LINEA_POR_CLAVE.get(clave(s), OTRAS)


def estado(s) -> str:
    """Sin tildes y en mayúsculas ('EVALUACIÓN TÉCNICA' -> 'EVALUACION TECNICA'); vacío -> 'SIN ESTADO'."""
    return re.sub(r"\s+", " ", cp.sin_tildes(str(s or "")).upper()).strip() or "SIN ESTADO"


def monto(s) -> int:
    """'300.000' -> 300000; '300000,50' -> 300001 (redondeado); vacío o ilegible -> 0."""
    t = re.sub(r"[^\d.,-]", "", str(s or ""))
    if not t:
        return 0
    try:
        if "," in t:
            t = t.replace(".", "").replace(",", ".")
        elif re.fullmatch(r"-?\d{1,3}(\.\d{3})+", t):
            t = t.replace(".", "")
        return int(round(float(t)))
    except ValueError:
        return 0


def mes_clave(ano, mes) -> str | None:
    try:
        a, m = int(float(str(ano).strip())), int(float(str(mes).strip()))
    except ValueError:
        return None
    return f"{a:04d}-{m:02d}" if 2000 <= a <= 2100 and 1 <= m <= 12 else None


def agregar(lector, columnas: list[str]) -> dict:
    """Recorre las filas del CSV y devuelve los agregados. No guarda ninguna fila."""
    ix = {c: columnas.index(c) for c in ("departamento", "localidad", "estado", "linea", "monto_prestable", "ano", "mes") if c in columnas}
    faltan = [c for c in ("departamento", "localidad", "estado", "linea") if c not in ix]
    if faltan:
        sys.exit(f"Faltan columnas en el CSV: {faltan}")
    get = lambda fila, c: fila[ix[c]] if c in ix and ix[c] < len(fila) else ""
    zonas: dict[tuple, list[int]] = defaultdict(lambda: [0, 0])
    serie: dict[tuple, list[int]] = defaultdict(lambda: [0, 0])
    n = 0
    for fila in lector:
        if not any(fila):
            continue
        dep = departamento(get(fila, "departamento"))
        loc, est, lin, m = localidad(dep, get(fila, "localidad")), estado(get(fila, "estado")), linea(get(fila, "linea")), monto(get(fila, "monto_prestable"))
        z = zonas[(dep, loc, est, lin)]
        z[0] += 1; z[1] += m
        mk = mes_clave(get(fila, "ano"), get(fila, "mes"))
        if mk:
            s = serie[(mk, dep, est)]
            s[0] += 1; s[1] += m
        n += 1
    return {"filas": n, "zonas": zonas, "serie": serie}


def armar(res: dict, actualizado: str) -> dict:
    deps = sorted({k[0] for k in res["zonas"]} | {k[1] for k in res["serie"]})
    locs = sorted({k[1] for k in res["zonas"]})
    ests = sorted({k[2] for k in res["zonas"]})
    meses = sorted({k[0] for k in res["serie"]})
    di, li, ei = ({x: i for i, x in enumerate(v)} for v in (deps, locs, ests))
    mi = {x: i for i, x in enumerate(meses)}
    lini = {x: i for i, x in enumerate(LINEAS)}
    return {
        "actualizado": actualizado, "creditos": res["filas"],
        "dep": deps, "loc": locs, "estados": ests, "lineas": LINEAS, "meses": meses,
        "zonas": [[di[d], li[l], ei[e], lini[ln], v[0], v[1]] for (d, l, e, ln), v in sorted(res["zonas"].items())],
        "serie": [[mi[m], di[d], ei[e], v[0], v[1]] for (m, d, e), v in sorted(res["serie"].items())],
    }


def cobertura_localidades(data: dict) -> str | None:
    """Informe (solo cantidades): qué parte de las solicitudes cae en una localidad que figura en el cubo de pendientes."""
    ruta = SALIDA / "cubo.json"
    if not ruta.exists():
        return None
    cubo = json.loads(ruta.read_text(encoding="utf-8"))
    conocidas = {(cubo["dep"][r[1]], cubo["loc"][r[2]]) for r in cubo["rows"]}
    total = sum(z[4] for z in data["zonas"])
    ok = sum(z[4] for z in data["zonas"] if (data["dep"][z[0]], data["loc"][z[1]]) in conocidas)
    return f"{ok} de {total} solicitudes ({100 * ok / max(total, 1):.1f} %) caen en una localidad del cubo de pendientes"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", help="CSV local (si no, se descarga de Drive)")
    ap.add_argument("--salida", help="carpeta de salida (por defecto data/banco_gente)")
    a = ap.parse_args()
    global SALIDA
    if a.salida:
        SALIDA = Path(a.salida)
    with tempfile.TemporaryDirectory() as tmp:
        if a.input:
            ruta = Path(a.input)
        else:
            ruta = Path(tmp) / "estados.csv"
            cp.descargar_drive(os.environ["BG_ESTADOS_FILE_ID"], ruta)
        huella = cp.huella_archivo(ruta)
        destino = SALIDA / "estados.json"
        meta = SALIDA / "estados_huella.txt"
        if destino.exists() and meta.exists() and meta.read_text().strip() == huella and not os.environ.get("FORZAR"):
            print("Sin cambios en el archivo de origen; no se regenera.")
            return
        f, lector = cp.abrir_csv(ruta)
        with f:
            columnas = cp.columnas_unicas(next(lector))
            columnas = cp.mapear_canonicas(columnas)
            res = agregar(lector, columnas)
    hoy = datetime.now(ZoneInfo("America/Argentina/Cordoba")).strftime("%Y-%m-%d")
    data = armar(res, hoy)
    SALIDA.mkdir(parents=True, exist_ok=True)
    destino.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    meta.write_text(huella + "\n")
    print(f"OK: {res['filas']} solicitudes en {len(data['zonas'])} filas de zona y {len(data['serie'])} de serie ({destino.stat().st_size // 1024} KB).")
    cob = cobertura_localidades(data)
    if cob:
        print(cob)


if __name__ == "__main__":
    main()
