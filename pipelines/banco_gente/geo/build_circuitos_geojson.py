"""Script único: circuitos_cordoba.json (TopoJSON) -> data/banco_gente/circuitos.geojson (lon/lat).

Uso (desde la raíz del repo):
  python pipelines/banco_gente/geo/build_circuitos_geojson.py

- Decodifica el TopoJSON (transform + arcs codificados en delta), Python puro.
- Simplifica con Douglas-Peucker POR ARCO (~0,00003°, unos 3 m) y redondea a 5 decimales.
- Anillos exteriores en sentido antihorario y huecos en horario (RFC 7946).
- FeatureCollection con una Feature por circuito: properties { codigo, nombre }.
"""
import json
import sys
from pathlib import Path

PIPE = Path(__file__).resolve().parent.parent
ENTRADA = PIPE / "circuitos_cordoba.json"
SALIDA = PIPE.parent.parent / "data" / "banco_gente" / "circuitos.geojson"
OBJETO = "circuitos_cbacap"
TOLERANCIA = 0.00003      # grados
DECIMALES = 5
MAX_BYTES = 250_000
ESPERADOS = 119


def decodificar_arcos(topo: dict) -> list[list[tuple[float, float]]]:
    sx, sy = topo["transform"]["scale"]
    tx, ty = topo["transform"]["translate"]
    arcos = []
    for arco in topo["arcs"]:
        x = y = 0
        pts = []
        for dx, dy in arco:          # delta -> posición absoluta cuantizada
            x += dx
            y += dy
            pts.append((x * sx + tx, y * sy + ty))
        arcos.append(pts)
    return arcos


def douglas_peucker(pts, eps):
    if len(pts) <= 2:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    pila = [(0, len(pts) - 1)]
    while pila:
        i, j = pila.pop()
        (x1, y1), (x2, y2) = pts[i], pts[j]
        dx, dy = x2 - x1, y2 - y1
        norma = (dx * dx + dy * dy) ** 0.5
        mejor, k = -1.0, -1
        for m in range(i + 1, j):
            px, py = pts[m]
            d = (((px - x1) ** 2 + (py - y1) ** 2) ** 0.5 if norma == 0
                 else abs(dy * (px - x1) - dx * (py - y1)) / norma)
            if d > mejor:
                mejor, k = d, m
        if mejor > eps:
            keep[k] = True
            pila += [(i, k), (k, j)]
    return [p for p, k in zip(pts, keep) if k]


def anillo(arcos, idxs):
    """Une los arcos de un anillo (índice negativo = arco recorrido al revés)."""
    pts = []
    for i in idxs:
        a = arcos[i] if i >= 0 else arcos[~i][::-1]
        pts += a if not pts else a[1:]   # el primer punto de cada arco repite el último del anterior
    return pts


def area_firmada(pts):
    return sum(x1 * y2 - x2 * y1 for (x1, y1), (x2, y2) in zip(pts, pts[1:] + pts[:1])) / 2


def orientar(pts, antihorario):
    return pts if (area_firmada(pts) > 0) == antihorario else pts[::-1]


def redondear(pts):
    out = [[round(x, DECIMALES), round(y, DECIMALES)] for x, y in pts]
    out.append(out[0])   # cerrar el anillo
    return out


def main():
    topo = json.loads(ENTRADA.read_text(encoding="utf-8"))
    arcos = [douglas_peucker(a, TOLERANCIA) for a in decodificar_arcos(topo)]
    features = []
    for g in topo["objects"][OBJETO]["geometries"]:
        grupos = g["arcs"] if g["type"] == "MultiPolygon" else [g["arcs"]]
        coords = []
        for poli in grupos:
            anillos = []
            for n, ring in enumerate(poli):
                pts = anillo(arcos, ring)[:-1]
                if len(pts) < 3:
                    continue
                anillos.append(orientar(pts, antihorario=(n == 0)))
            if anillos:
                coords.append([redondear(a) for a in anillos])
        p = g["properties"]
        geom = ({"type": "Polygon", "coordinates": coords[0]} if len(coords) == 1
                else {"type": "MultiPolygon", "coordinates": coords})
        features.append({"type": "Feature", "properties": {"codigo": p["circuito"], "nombre": p["nombre_circuito"]},
                         "geometry": geom})

    codigos = [f["properties"]["codigo"] for f in features]
    if len(features) != ESPERADOS or len(set(codigos)) != ESPERADOS:
        sys.exit(f"Se esperaban {ESPERADOS} circuitos distintos y hay {len(features)} ({len(set(codigos))} códigos únicos)")

    out = {"type": "FeatureCollection", "features": features}
    txt = json.dumps(out, ensure_ascii=False, separators=(",", ":"))
    if len(txt.encode()) >= MAX_BYTES:
        sys.exit(f"El archivo pesa {len(txt.encode())/1000:.0f} KB (máximo {MAX_BYTES//1000} KB): subir la tolerancia")
    SALIDA.parent.mkdir(parents=True, exist_ok=True)
    SALIDA.write_text(txt, encoding="utf-8")
    print(f"OK: {len(features)} circuitos, {len(txt.encode())/1000:.0f} KB, {sum(len(f['geometry']['coordinates'][0][0]) if f['geometry']['type']=='Polygon' else 0 for f in features)} vértices exteriores -> {SALIDA}")


if __name__ == "__main__":
    main()
