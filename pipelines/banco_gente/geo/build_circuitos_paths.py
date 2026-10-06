"""Script único: circuitos_cordoba.json (TopoJSON) -> circuitos_paths.json (paths SVG).

Uso (desde la raíz del repo):
  python pipelines/banco_gente/geo/build_circuitos_paths.py

- Decodifica el TopoJSON (transform + arcs codificados en delta), Python puro.
- Proyecta a plano con corrección por cos(latitud media): x = (lon - lon0) * cos(lat0), y = lat1 - lat.
- Simplifica con Douglas-Peucker POR ARCO (los arcos son compartidos entre circuitos vecinos, así los
  bordes siguen coincidiendo y no aparecen huecos). Busca la menor tolerancia que deje el JSON < 150 KB.
- Escribe pipelines/banco_gente/circuitos_paths.json y lo copia a data/banco_gente/
  (convención de deptos_paths.json: {w, h, items:[{codigo, nombre, d, bbox}]}).
"""
import json
import math
import shutil
import sys
from pathlib import Path

AQUI = Path(__file__).resolve().parent
PIPE = AQUI.parent
DATA = PIPE.parent.parent / "data" / "banco_gente"
ENTRADA = PIPE / "circuitos_cordoba.json"
SALIDA = PIPE / "circuitos_paths.json"
ANCHO = 600           # unidades del viewBox
MAX_BYTES = 150_000
OBJETO = "circuitos_cbacap"


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


def douglas_peucker(pts: list[tuple[float, float]], eps: float) -> list[tuple[float, float]]:
    if len(pts) <= 2:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    pila = [(0, len(pts) - 1)]
    while pila:
        i, j = pila.pop()
        (x1, y1), (x2, y2) = pts[i], pts[j]
        dx, dy = x2 - x1, y2 - y1
        norma = math.hypot(dx, dy)
        mejor, k = -1.0, -1
        for m in range(i + 1, j):
            px, py = pts[m]
            d = (math.hypot(px - x1, py - y1) if norma == 0
                 else abs(dy * (px - x1) - dx * (py - y1)) / norma)
            if d > mejor:
                mejor, k = d, m
        if mejor > eps:
            keep[k] = True
            pila += [(i, k), (k, j)]
    return [p for p, k in zip(pts, keep) if k]


def anillo(arcos: list[list], idxs: list[int]) -> list[tuple[float, float]]:
    """Une los arcos de un anillo (índice negativo = arco recorrido al revés)."""
    pts: list[tuple[float, float]] = []
    for i in idxs:
        a = arcos[i] if i >= 0 else arcos[~i][::-1]
        pts += a if not pts else a[1:]   # el primer punto de cada arco repite el último del anterior
    return pts


def construir(eps: float, topo: dict, proy_arcos: list[list]) -> dict:
    simp = [douglas_peucker(a, eps) for a in proy_arcos]
    items = []
    for g in topo["objects"][OBJETO]["geometries"]:
        poligonos = g["arcs"] if g["type"] == "MultiPolygon" else [g["arcs"]]
        d, xs, ys = [], [], []
        for poli in poligonos:
            for ring in poli:
                pts = anillo(simp, ring)
                if len(pts) < 4:
                    continue
                xs += [p[0] for p in pts]
                ys += [p[1] for p in pts]
                d.append("M" + "L".join(f"{x:.1f} {y:.1f}" for x, y in pts[:-1]) + "Z")
        p = g["properties"]
        items.append({
            "codigo": p["circuito"], "nombre": p["nombre_circuito"], "d": "".join(d),
            "bbox": [round(min(xs), 1), round(min(ys), 1), round(max(xs), 1), round(max(ys), 1)],
        })
    return items


def main():
    topo = json.loads(ENTRADA.read_text(encoding="utf-8"))
    arcos = decodificar_arcos(topo)
    lons = [p[0] for a in arcos for p in a]
    lats = [p[1] for a in arcos for p in a]
    lon0, lat0, lat1 = min(lons), (min(lats) + max(lats)) / 2, max(lats)
    k = math.cos(math.radians(lat0))
    # grados -> unidades de plano (x corregido por cos(lat)); luego se escala a ANCHO
    ancho_deg = (max(lons) - lon0) * k
    esc = ANCHO / ancho_deg
    proy = [[((lo - lon0) * k * esc, (lat1 - la) * esc) for lo, la in a] for a in arcos]
    alto = (lat1 - min(lats)) * esc

    elegido = None
    for eps in [0.05, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5, 0.75, 1.0, 1.5, 2.0]:
        items = construir(eps, topo, proy)
        out = {"w": ANCHO, "h": round(alto), "items": items}
        txt = json.dumps(out, ensure_ascii=False, separators=(",", ":"))
        if len(txt.encode()) < MAX_BYTES:
            elegido = (eps, txt, items)
            break
    if not elegido:
        sys.exit("No se logró bajar de 150 KB; revisar el TopoJSON")
    eps, txt, items = elegido
    SALIDA.write_text(txt, encoding="utf-8")
    DATA.mkdir(parents=True, exist_ok=True)
    shutil.copy2(SALIDA, DATA / SALIDA.name)
    print(f"OK: {len(items)} circuitos, {len(txt.encode())/1000:.0f} KB, tolerancia {eps}, viewBox {ANCHO}x{round(alto)}")


if __name__ == "__main__":
    main()
