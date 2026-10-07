"""Conciliación de barrios del Domicilio con la base oficial de barrios de Córdoba Capital.

El nombre del barrio lo resuelve `depurar_barrios.MatcherBarrios` (normalización, abreviaturas, alias,
fonética, descriptores VILLA/GENERAL/PARQUE, etc.; se mantiene tal cual lo generó el equipo). Este módulo
lo envuelve para el pipeline y agrega el CIRCUITO de cada barrio, según barrios_cordoba.xlsx.

Reglas de salida (lo que ve el tablero):
  - Si el barrio concilia: nombre depurado (el barrio oficial) y su circuito.
  - Si no hay coincidencia (SIN COINCIDENCIA / AMBIGUO): queda el nombre original que trae la base.
  - Si viene vacío (SIN DATO): queda vacío; el crédito sigue siendo de Córdoba Capital, sin barrio.

Prioridad: primero los overrides manuales de barrios_alias.csv (variante,barrio), después el matcher.
Un nombre repetido en el Excel de barrios se asigna al circuito del barrio oficial; si quedan circuitos
distintos el barrio se asigna igual pero sin circuito (no se elige al azar).
"""
from __future__ import annotations

import re
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import depurar_barrios as dep  # noqa: E402

# Métodos que no hace falta revisar a mano (el resto de los que asignan barrio se listan como "dudosos").
CONFIABLES = {"EXACTO", "NORMALIZADO", "ALIAS", "ALIAS MANUAL", "ORDEN DE PALABRAS", "FONETICO"}
SIN_ASIGNAR = {"SIN COINCIDENCIA", "AMBIGUO"}


def etiqueta(metodo: str) -> str:
    """'APROXIMADO (93%)' -> 'APROXIMADO'; 'ALIAS (sin ruido)' -> 'ALIAS'."""
    return metodo.split(" (")[0]


# ── Base oficial (con circuitos) ────────────────────────────────────────
@dataclass(frozen=True)
class RegistroBase:
    id_barrio: int
    barrio: str
    oficial: bool
    codigo: str
    circuito: str


class BaseBarrios:
    def __init__(self, registros: list[RegistroBase]):
        self.registros = registros
        self.por_nombre: dict[str, list[RegistroBase]] = defaultdict(list)
        for r in registros:
            self.por_nombre[r.barrio].append(r)
        self.circuitos = {r.codigo: r.circuito for r in registros}

    @classmethod
    def desde_excel(cls, ruta: Path) -> "BaseBarrios":
        df = pd.read_excel(ruta, sheet_name="Barrios")
        regs = []
        for _, f in df.iterrows():
            barrio, circ = str(f["Barrio"]).strip(), f["Circuito principal"]
            if barrio.upper() == "SD" or pd.isna(circ):
                continue  # barrios "SD" sin circuito: se ignoran
            codigo, _, nombre = str(circ).partition(" - ")
            regs.append(RegistroBase(
                id_barrio=int(f["ID barrio"]), barrio=barrio,
                oficial=str(f["Tipo de barrio"]) == "BarrioOficial",
                codigo=codigo.strip(), circuito=nombre.strip()))
        return cls(regs)

    def circuito_de(self, nombre: str) -> RegistroBase | None:
        """Registro del barrio con ese nombre exacto. Prefiere BarrioOficial; si siguen siendo varios con
        circuitos distintos devuelve None (ambiguo). Si todos están en el mismo circuito, ese."""
        regs = self.por_nombre.get(nombre, [])
        if any(r.oficial for r in regs):
            regs = [r for r in regs if r.oficial]
        if regs and len({r.codigo for r in regs}) == 1:
            return min(regs, key=lambda r: r.id_barrio)
        return None


def cargar_alias(ruta: Path) -> dict[str, str]:
    """barrios_alias.csv (variante,barrio) -> {clave normalizada de la variante: nombre del barrio}."""
    if not Path(ruta).exists():
        return {}
    df = pd.read_csv(ruta, dtype=str).dropna()
    return {dep.clave_total(v): b.strip() for v, b in zip(df.variante, df.barrio) if dep.clave_total(v)}


# ── Resultado ───────────────────────────────────────────────────────────
@dataclass
class Match:
    crudo: str
    barrio_oficial: str | None = None   # None si no se asignó (sin dato, sin coincidencia o ambiguo)
    id_barrio: int | None = None
    codigo_circuito: str | None = None
    circuito: str | None = None
    metodo: str = "SIN COINCIDENCIA"
    confianza: float = 0.0
    candidatos: list[dict] = field(default_factory=list)  # sugerencias para revisar

    @property
    def nombre_mostrado(self) -> str:
        """Barrio depurado; sin coincidencia/ambiguo: el original de la base; vacío (o 'SD', 'S/D'...): vacío."""
        if self.barrio_oficial:
            return self.barrio_oficial
        return "" if etiqueta(self.metodo) == "SIN DATO" else self.crudo

    @property
    def con_circuito(self) -> bool:
        return self.codigo_circuito is not None

    @property
    def dudoso(self) -> bool:
        """Asignó barrio con un método que conviene revisar a mano."""
        return self.barrio_oficial is not None and etiqueta(self.metodo) not in CONFIABLES


def _confianza(metodo: str) -> float:
    et = etiqueta(metodo)
    if et in ("EXACTO", "NORMALIZADO", "ALIAS", "ALIAS MANUAL", "ORDEN DE PALABRAS"):
        return 1.0
    if et == "FONETICO":
        return 0.95
    if et == "APROXIMADO":
        m = re.search(r"\((\d+)%\)", metodo)
        return round(int(m.group(1)) / 100, 2) if m else 0.9
    return 0.85


class Conciliador:
    """Concilia nombres crudos de barrio con barrios_cordoba.xlsx (+ overrides del CSV)."""

    def __init__(self, ruta_barrios: Path, ruta_alias: Path | None = None):
        self.matcher = dep.MatcherBarrios(str(ruta_barrios))
        self.base = BaseBarrios.desde_excel(Path(ruta_barrios))
        self.alias = cargar_alias(ruta_alias) if ruta_alias else {}

    def _candidatos(self, texto: str) -> list[dict]:
        """'A | B (87%)' -> [{'barrio': 'A', 'circuito': ...}, {'barrio': 'B', 'score': 87, ...}]"""
        out = []
        for parte in filter(None, (p.strip() for p in texto.split(" | "))):
            m = re.match(r"^(.*?)\s*\((\d+)%\)$", parte)
            nombre, score = (m.group(1), int(m.group(2))) if m else (parte, None)
            reg = self.base.circuito_de(nombre)
            c = {"barrio": nombre, "circuito": reg.codigo if reg else None}
            if score is not None:
                c["score"] = score
            out.append(c)
        return out

    def _circuito_comun(self, m: Match) -> None:
        """Ambiguo entre varios barrios que están TODOS en el mismo circuito (por ejemplo las secciones
        1, 2 y 3 de PARQUE LICEO): no se elige barrio, pero el circuito es seguro y se asigna."""
        regs = [self.base.circuito_de(c["barrio"]) for c in m.candidatos]
        if regs and all(regs) and len({r.codigo for r in regs}) == 1:
            m.codigo_circuito, m.circuito = regs[0].codigo, regs[0].circuito

    def conciliar_uno(self, crudo: str) -> Match:
        crudo = crudo or ""
        # 0. Override manual del CSV (prioridad máxima)
        destino = self.alias.get(dep.clave_total(crudo)) if crudo.strip() else None
        if destino:
            nombre, metodo, cands = destino, "ALIAS MANUAL", ""
            if destino not in self.matcher.oficiales:
                resuelto, _, _ = self.matcher.resolver(destino)
                nombre = resuelto or destino      # fuera de la lista oficial: se respeta, sin circuito
        else:
            nombre, metodo, cands = self.matcher.resolver(crudo)

        m = Match(crudo=crudo, metodo=metodo)
        if not nombre:                             # sin dato / sin coincidencia / ambiguo
            m.candidatos = self._candidatos(cands)
            if etiqueta(metodo) == "AMBIGUO":
                self._circuito_comun(m)
            return m
        m.barrio_oficial, m.confianza = nombre, _confianza(metodo)
        reg = self.base.circuito_de(nombre)
        if reg:
            m.id_barrio, m.codigo_circuito, m.circuito = reg.id_barrio, reg.codigo, reg.circuito
        return m

    def conciliar(self, crudos) -> dict[str, Match]:
        """{barrio crudo: Match} para cada barrio crudo distinto."""
        return {c: self.conciliar_uno(c) for c in dict.fromkeys(crudos)}


# ── Reporte ─────────────────────────────────────────────────────────────
def resumen(matches: dict[str, Match], creditos: dict[str, int]) -> dict:
    """% de barrios y de créditos por método. `creditos`: {barrio crudo: cantidad}."""
    tot_b, tot_real = len(matches), sum(creditos.get(k, 0) for k in matches)
    tot_c = tot_real or 1
    barrios, creds = Counter(), Counter()
    for k, m in matches.items():
        et = etiqueta(m.metodo)
        barrios[et] += 1
        creds[et] += creditos.get(k, 0)
    por = {et: {"barrios": barrios[et], "pct_barrios": round(100 * barrios[et] / max(tot_b, 1), 1),
                "creditos": creds[et], "pct_creditos": round(100 * creds[et] / tot_c, 1)}
           for et, _ in creds.most_common()}
    con = [k for k, m in matches.items() if m.con_circuito]
    cc = sum(creditos.get(k, 0) for k in con)
    asignados = [k for k, m in matches.items() if m.barrio_oficial is not None]
    ca = sum(creditos.get(k, 0) for k in asignados)
    return {"barrios": tot_b, "creditos": tot_real,
            "con_barrio_oficial": {"barrios": len(asignados), "pct_barrios": round(100 * len(asignados) / max(tot_b, 1), 1),
                                   "creditos": ca, "pct_creditos": round(100 * ca / tot_c, 1)},
            "con_circuito": {"barrios": len(con), "pct_barrios": round(100 * len(con) / max(tot_b, 1), 1),
                             "creditos": cc, "pct_creditos": round(100 * cc / tot_c, 1)},
            "por_metodo": por}


def texto_resumen(r: dict) -> str:
    l = [f"Conciliación de barrios: {r['barrios']} barrios distintos, {r['creditos']} créditos en Capital"]
    for met, v in r["por_metodo"].items():
        l.append(f"  {met:45s} {v['barrios']:5d} barrios ({v['pct_barrios']:5.1f}%)  "
                 f"{v['creditos']:6d} créditos ({v['pct_creditos']:5.1f}%)")
    a, c = r["con_barrio_oficial"], r["con_circuito"]
    l.append(f"  => con barrio oficial: {a['barrios']} barrios ({a['pct_barrios']}%), "
             f"{a['creditos']} créditos ({a['pct_creditos']}%)")
    l.append(f"  => con circuito asignado: {c['barrios']} barrios ({c['pct_barrios']}%), "
             f"{c['creditos']} créditos ({c['pct_creditos']}%)")
    return "\n".join(l)


def filas_revisar(matches: dict[str, Match], creditos: dict[str, int], montos: dict[str, int]) -> list[dict]:
    """Barrios para revisar: sin coincidencia, ambiguos, dudosos y asignados sin circuito.
    Ordenados por cantidad de créditos. Se corrigen completando barrios_alias.csv."""
    filas = []
    for k, m in matches.items():
        et = etiqueta(m.metodo)
        if et == "SIN DATO":
            continue
        if m.barrio_oficial is None:
            estado = "ambiguo" if et == "AMBIGUO" else "sin_coincidencia"
        elif m.dudoso:
            estado = "dudoso"
        elif not m.con_circuito:
            estado = "sin_circuito"
        else:
            continue
        filas.append({
            "barrio": k, "creditos": creditos.get(k, 0), "monto": montos.get(k, 0),
            "estado": estado, "metodo": m.metodo, "confianza": m.confianza,
            "asignado": m.barrio_oficial, "circuito": m.codigo_circuito,
            "candidatos": m.candidatos,
        })
    return sorted(filas, key=lambda f: (-f["creditos"], f["barrio"]))
