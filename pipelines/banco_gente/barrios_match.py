"""Conciliación de barrios del Domicilio con la base oficial de barrios de Córdoba Capital.

Dado el nombre crudo de un barrio ("VILLA ALBERDI", "ALBERDI I", "B° ALBERDI") devuelve el barrio
oficial de barrios_cordoba.xlsx, su id y el código de circuito. Capas, en este orden:

  0. alias      overrides manuales de barrios_alias.csv (variante,barrio). Prioridad máxima.
  1. exacto     coincidencia exacta tras normalizar (mayúsculas, sin tildes ni puntuación).
  2. limpieza   se quitan prefijos/sufijos genéricos (B°, BARRIO, SECTOR, I/II/2...) y se reintenta.
                Siempre se prueba primero el nombre COMPLETO contra la base, así "VILLA ALBERDI"
                no se convierte en "ALBERDI". Quitar "VILLA" es el último recurso.
  3. fuzzy      coincidencia aproximada (rapidfuzz), umbral alto. Con dos candidatos cercanos
                no se asigna.

Nombres repetidos en la base: se prefiere BarrioOficial; si siguen siendo varios con circuitos
distintos el barrio queda "ambiguo" (no se elige al azar). Lo que no concilia queda "sin_clasificar".
"""
from __future__ import annotations

import re
import unicodedata
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path

import pandas as pd
from rapidfuzz import fuzz, process

# ── Parámetros ──────────────────────────────────────────────────────────
UMBRAL_FUZZY = 90          # score mínimo (0-100) para aceptar una coincidencia aproximada
MARGEN_FUZZY = 4           # si el 2º candidato (otro barrio) queda a menos de esto, es ambiguo
UMBRAL_DUDOSO = 0.9        # por debajo de esta confianza el barrio se lista para revisar

PREFIJOS = {"B", "BO", "BARRIO", "BRIO", "SECTOR", "ZONA", "MANZANA", "MZA", "MZ"}
PREFIJO_DEBIL = {"VILLA"}  # solo se descarta si el nombre completo no está en la base
SUFIJOS_PALABRA = {"ANEXO", "AMPLIACION"}
ROMANOS = {"I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"}

METODOS = ["alias", "exacto", "limpieza", "fuzzy", "ambiguo", "sin_clasificar", "sin_dato"]


def normalizar(s) -> str:
    """Mayúsculas, sin tildes, sin puntuación ('B°' -> 'B'), espacios simples."""
    if s is None or (isinstance(s, float) and pd.isna(s)):
        return ""
    s = str(s).replace("°", " ").replace("º", " ").replace("ª", " ")
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    s = re.sub(r"[^A-Za-z0-9]+", " ", s)
    return re.sub(r"\s+", " ", s).strip().upper()


# ── Base oficial ────────────────────────────────────────────────────────
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
        self.por_clave: dict[str, list[RegistroBase]] = defaultdict(list)
        for r in registros:
            self.por_clave[normalizar(r.barrio)].append(r)
        self.claves = list(self.por_clave)
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


def cargar_alias(ruta: Path) -> dict[str, str]:
    """barrios_alias.csv (variante,barrio) -> {variante normalizada: barrio normalizado}."""
    if not Path(ruta).exists():
        return {}
    df = pd.read_csv(ruta, dtype=str).dropna()
    return {normalizar(v): normalizar(b) for v, b in zip(df.variante, df.barrio) if normalizar(v)}


# ── Resultado ───────────────────────────────────────────────────────────
@dataclass
class Match:
    crudo: str
    barrio_oficial: str | None = None   # None si no concilió
    id_barrio: int | None = None
    codigo_circuito: str | None = None
    circuito: str | None = None
    metodo: str = "sin_clasificar"
    confianza: float = 0.0
    candidatos: list[dict] = field(default_factory=list)  # sugerencias para revisar

    @property
    def con_circuito(self) -> bool:
        return self.codigo_circuito is not None

    @property
    def dudoso(self) -> bool:
        """Para revisar a mano: ambiguos, coincidencias aproximadas y limpiezas poco seguras."""
        return self.metodo in ("ambiguo", "fuzzy") or (
            self.metodo == "limpieza" and self.confianza < UMBRAL_DUDOSO)


def _candidato(r: RegistroBase, score: float | None = None) -> dict:
    c = {"barrio": r.barrio, "circuito": r.codigo, "oficial": r.oficial}
    if score is not None:
        c["score"] = round(score, 1)
    return c


# ── Núcleo ──────────────────────────────────────────────────────────────
def _resolver_clave(base: BaseBarrios, clave: str):
    """Busca una clave normalizada en la base aplicando la regla de repetidos.
    Devuelve ('ok', registro) | ('ambiguo', [registros]) | None."""
    regs = base.por_clave.get(clave)
    if not regs:
        return None
    if any(r.oficial for r in regs):
        regs = [r for r in regs if r.oficial]
    if len({r.codigo for r in regs}) == 1:
        return "ok", min(regs, key=lambda r: r.id_barrio)
    return "ambiguo", regs


def variantes_limpias(clave: str) -> list[tuple[str, float]]:
    """Variantes de una clave sin prefijos/sufijos genéricos, de menos a más agresiva,
    con la confianza que merece cada una. No incluye la clave original."""
    toks = clave.split()
    salida: list[tuple[str, float]] = []

    def quitar_sufijos(t: list[str]) -> list[str]:
        t = list(t)
        while len(t) > 1 and (t[-1] in ROMANOS or t[-1].isdigit() or t[-1] in SUFIJOS_PALABRA):
            t.pop()
        return t

    def quitar_prefijos(t: list[str]) -> list[str]:
        t = list(t)
        while len(t) > 1 and t[0] in PREFIJOS:
            t.pop(0)
        return t

    pasos = [quitar_sufijos(toks), quitar_prefijos(toks), quitar_prefijos(quitar_sufijos(toks))]
    for t in pasos:
        v = " ".join(t)
        if v != clave and v not in [x for x, _ in salida]:
            salida.append((v, 0.95))
    # Último recurso: descartar "VILLA" (solo se llega acá si nada anterior coincidió)
    for v0 in [clave] + [v for v, _ in salida]:
        t = v0.split()
        if len(t) > 1 and t[0] in PREFIJO_DEBIL:
            v = " ".join(t[1:])
            if v not in [x for x, _ in salida] and v != clave:
                salida.append((v, 0.85))
    return salida


MESES = {"ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO",
         "SEPTIEMBRE", "SETIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"}
PUNTOS = {"NORTE": "NORTE", "SUR": "SUD", "SUD": "SUD", "ESTE": "ESTE", "OESTE": "OESTE"}


def _marcas(s: str) -> list[str]:
    """Tokens que distinguen barrios entre sí (números, meses, puntos cardinales, romanos).
    Dos nombres que difieren en alguno NO se pueden fusionar por parecido
    ('20 DE JULIO' != '20 DE JUNIO', '1A SECCION' != '2A SECCION', 'OESTE' != 'ESTE'). SUR == SUD."""
    marcas = []
    for t in s.split():
        if t[0].isdigit():
            marcas.append(re.match(r"\d+", t).group())
        elif t in MESES or t in ROMANOS:
            marcas.append(t)
        elif t in PUNTOS:
            marcas.append(PUNTOS[t])
    return sorted(marcas)


def _fuzzy(base: BaseBarrios, clave: str) -> Match | None:
    res = process.extract(clave, base.claves, scorer=fuzz.ratio, limit=5, score_cutoff=UMBRAL_FUZZY - 1)
    res = [(c, s) for c, s, _ in res if _marcas(c) == _marcas(clave)]
    if not res:
        return None
    # Un candidato por barrio (clave); desempate con la regla de repetidos
    resueltos = []
    for c, s in res:
        r = _resolver_clave(base, c)
        resueltos.append((c, s, r))
    mejor_c, mejor_s, mejor_r = resueltos[0]
    if mejor_s < UMBRAL_FUZZY:
        return None
    m = Match(crudo=clave)
    m.candidatos = [_candidato(rr, s) for c, s, r in resueltos
                    for rr in ([r[1]] if r and r[0] == "ok" else (r[1] if r else []))][:5]
    cercanos = [x for x in resueltos[1:] if mejor_s - x[1] < MARGEN_FUZZY]
    if mejor_r[0] == "ambiguo" or cercanos:
        m.metodo = "ambiguo"
        return m
    reg = mejor_r[1]
    m.barrio_oficial, m.id_barrio, m.codigo_circuito, m.circuito = reg.barrio, reg.id_barrio, reg.codigo, reg.circuito
    m.metodo, m.confianza = "fuzzy", round(mejor_s / 100, 2)
    return m


def _desde_resolucion(crudo: str, res, metodo: str, confianza: float) -> Match:
    estado, dato = res
    m = Match(crudo=crudo)
    if estado == "ambiguo":
        m.metodo = "ambiguo"
        m.candidatos = [_candidato(r) for r in dato]
        return m
    m.barrio_oficial, m.id_barrio, m.codigo_circuito, m.circuito = dato.barrio, dato.id_barrio, dato.codigo, dato.circuito
    m.metodo, m.confianza = metodo, confianza
    return m


def conciliar_uno(crudo: str, base: BaseBarrios, alias: dict[str, str]) -> Match:
    clave = normalizar(crudo)
    if not clave or clave == "SIN DATO":
        return Match(crudo=crudo, metodo="sin_dato")

    # 0. Override manual (prioridad máxima)
    if clave in alias:
        destino = alias[clave]
        res = _resolver_clave(base, destino)
        if res and res[0] == "ok":
            return _desde_resolucion(crudo, res, "alias", 1.0)
        # El alias fija el nombre aunque no esté en la base: se respeta, sin circuito.
        m = _desde_resolucion(crudo, res, "alias", 1.0) if res else Match(crudo=crudo)
        if not res:
            m.barrio_oficial, m.metodo, m.confianza = destino, "alias", 1.0
        return m

    # 1. Exacto
    res = _resolver_clave(base, clave)
    if res:
        return _desde_resolucion(crudo, res, "exacto", 1.0)

    # 2. Limpieza de prefijos/sufijos (el nombre completo ya se probó arriba)
    for v, conf in variantes_limpias(clave):
        res = _resolver_clave(base, v)
        if res:
            return _desde_resolucion(crudo, res, "limpieza", conf)

    # 3. Aproximada
    m = _fuzzy(base, clave)
    if m:
        m.crudo = crudo
        return m

    # Sin coincidencia: se sugieren los más parecidos (aunque bajo el umbral) para revisión manual
    m = Match(crudo=crudo)
    for c, s, _ in process.extract(clave, base.claves, scorer=fuzz.ratio, limit=3, score_cutoff=70):
        reg = _resolver_clave(base, c)
        if reg:
            m.candidatos += [_candidato(r, s) for r in ([reg[1]] if reg[0] == "ok" else reg[1])][:2]
    return m


def conciliar(crudos, base: BaseBarrios, alias: dict[str, str] | None = None) -> dict[str, Match]:
    """{barrio crudo: Match} para cada barrio crudo distinto."""
    alias = alias or {}
    return {c: conciliar_uno(c, base, alias) for c in dict.fromkeys(crudos)}


# ── Reporte ─────────────────────────────────────────────────────────────
def resumen(matches: dict[str, Match], creditos: dict[str, int]) -> dict:
    """% de barrios y de créditos por método. `creditos`: {barrio crudo: cantidad}."""
    tot_b, tot_real = len(matches), sum(creditos.get(k, 0) for k in matches)
    tot_c = tot_real or 1
    por = {}
    for met in METODOS:
        ks = [k for k, m in matches.items() if m.metodo == met]
        c = sum(creditos.get(k, 0) for k in ks)
        por[met] = {"barrios": len(ks), "pct_barrios": round(100 * len(ks) / max(tot_b, 1), 1),
                    "creditos": c, "pct_creditos": round(100 * c / tot_c, 1)}
    con = [k for k, m in matches.items() if m.con_circuito]
    cc = sum(creditos.get(k, 0) for k in con)
    return {"barrios": tot_b, "creditos": tot_real,
            "con_circuito": {"barrios": len(con), "pct_barrios": round(100 * len(con) / max(tot_b, 1), 1),
                             "creditos": cc, "pct_creditos": round(100 * cc / tot_c, 1)},
            "por_metodo": por}


def texto_resumen(r: dict) -> str:
    l = [f"Conciliación de barrios: {r['barrios']} barrios, {r['creditos']} créditos en Capital"]
    for met, v in r["por_metodo"].items():
        if v["barrios"]:
            l.append(f"  {met:15s} {v['barrios']:5d} barrios ({v['pct_barrios']:5.1f}%)  "
                     f"{v['creditos']:6d} créditos ({v['pct_creditos']:5.1f}%)")
    c = r["con_circuito"]
    l.append(f"  => con circuito asignado: {c['barrios']} barrios ({c['pct_barrios']}%), "
             f"{c['creditos']} créditos ({c['pct_creditos']}%)")
    return "\n".join(l)


def filas_revisar(matches: dict[str, Match], creditos: dict[str, int], montos: dict[str, int]) -> list[dict]:
    """No conciliados y dudosos, ordenados por cantidad de créditos."""
    filas = []
    for k, m in matches.items():
        if m.metodo == "sin_dato" or (m.con_circuito and not m.dudoso):
            continue
        filas.append({
            "barrio": k, "creditos": creditos.get(k, 0), "monto": montos.get(k, 0),
            "estado": "ambiguo" if m.metodo == "ambiguo" else
                      "dudoso" if m.con_circuito else "sin_clasificar",
            "metodo": m.metodo, "confianza": m.confianza,
            "asignado": m.barrio_oficial, "circuito": m.codigo_circuito,
            "candidatos": m.candidatos,
        })
    return sorted(filas, key=lambda f: (-f["creditos"], f["barrio"]))
