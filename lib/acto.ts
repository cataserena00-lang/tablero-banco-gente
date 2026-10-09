// Cálculos de la vista "Preparar acto". Solo trabaja con los cubos agregados de data/banco_gente/:
// no hay datos personales ni nominales.
import type { Cubo, CuboCapital } from "@/components/Tablero";
import { lineaCanonica, nombreDep } from "./formato";

// Mismos valores que `capital` en pipelines/banco_gente/config.yaml.
export const DEP_CAPITAL = "CAPITAL";
export const LOC_CAPITAL = "CORDOBA";

export interface Total { n: number; m: number }
export interface LineaFicha extends Total { linea: string }   // `linea` tal como viene en la base
export interface PuntoFecha extends Total { f: string }       // f = fecha de aprobación ISO
export interface Ficha extends Total { lineas: LineaFicha[]; fechas: PuntoFecha[] }
export interface ZonaBarrio extends Total { idx: number; nombre: string; circuito: string | null }
export interface ZonaLocalidad extends Total { dep: number; loc: number; depto: string; nombre: string; sumaDias: number }

export const SIN_LINEA = "SIN LINEA";
export const BARRIO_VACIO = "Sin barrio informado";

/* ── Fichas ── */
type Fila = [number, number, number, number]; // [fecha_idx, linea_idx, n, m]

function armarFicha(filas: Iterable<Fila>, fechas: string[], lineas: string[]): Ficha {
  const porLinea = new Map<string, Total>();
  const porFecha = new Map<string, Total>();
  let n = 0, m = 0;
  for (const [f, l, cn, cm] of filas) {
    n += cn; m += cm;
    const crudo = l >= 0 && l < lineas.length ? lineas[l] : SIN_LINEA;
    const nl = lineaCanonica(crudo) ?? crudo;   // L2 y LIBRE DISPONIBILIDAD son la misma línea, etc.
    const a = porLinea.get(nl) ?? { n: 0, m: 0 }; a.n += cn; a.m += cm; porLinea.set(nl, a);
    const iso = fechas[f];
    const b = porFecha.get(iso) ?? { n: 0, m: 0 }; b.n += cn; b.m += cm; porFecha.set(iso, b);
  }
  return {
    n, m,
    lineas: [...porLinea].map(([linea, t]) => ({ linea, ...t })).sort((x, y) => y.m - x.m),
    fechas: [...porFecha].map(([f, t]) => ({ f, ...t })).sort((x, y) => (x.f < y.f ? -1 : 1)),
  };
}

export function fichaBarrio(cc: CuboCapital, bar: number): Ficha {
  const filas: Fila[] = [];
  for (const r of cc.rows) if (r[1] === bar) filas.push([r[0], r[2], r[3], r[4]]);
  return armarFicha(filas, cc.f, cc.lin);
}

export function fichaLocalidad(c: Cubo, dep: number, loc: number): Ficha {
  const filas: Fila[] = [];
  for (const r of c.rows) if (r[1] === dep && r[2] === loc) filas.push([r[0], r[3], r[4], r[5]]);
  return armarFicha(filas, c.f, c.lin);
}

/** Todo un departamento (todas sus localidades). */
export function fichaDepartamento(c: Cubo, dep: number): Ficha {
  const filas: Fila[] = [];
  for (const r of c.rows) if (r[1] === dep) filas.push([r[0], r[3], r[4], r[5]]);
  return armarFicha(filas, c.f, c.lin);
}

/** Créditos del departamento Capital cuya localidad no es Córdoba (p. ej. "SIN ASIGNAR"): no tienen barrio. */
export function fichaSinAsignar(c: Cubo): Ficha {
  const dep = c.dep.indexOf(DEP_CAPITAL), loc = c.loc.indexOf(LOC_CAPITAL);
  const filas: Fila[] = [];
  if (dep >= 0) for (const r of c.rows) if (r[1] === dep && r[2] !== loc) filas.push([r[0], r[3], r[4], r[5]]);
  return armarFicha(filas, c.f, c.lin);
}

/* ── Zonas para el selector ── */
export function zonasCapital(cc: CuboCapital): ZonaBarrio[] {
  const acc = cc.bar.map(() => ({ n: 0, m: 0 }));
  for (const r of cc.rows) { acc[r[1]].n += r[3]; acc[r[1]].m += r[4]; }
  return cc.bar
    .map((b, idx): ZonaBarrio => {
      const ci = cc.bar_cir?.[idx] ?? -1;
      return { idx, nombre: b, circuito: ci >= 0 ? cc.cir?.[ci]?.n ?? null : null, ...acc[idx] };
    })
    .filter(z => z.n > 0)
    .sort((a, b) => b.n - a.n);
}

export function zonasInterior(c: Cubo): ZonaLocalidad[] {
  const capital = c.dep.indexOf(DEP_CAPITAL);
  const acc = new Map<string, ZonaLocalidad>();
  for (const r of c.rows) {
    if (r[1] === capital) continue;
    const k = `${r[1]}|${r[2]}`;
    const z = acc.get(k) ?? { dep: r[1], loc: r[2], depto: c.dep[r[1]], nombre: c.loc[r[2]], n: 0, m: 0, sumaDias: 0 };
    z.n += r[4]; z.m += r[5];
    z.sumaDias += r[4] * diaAbsoluto(c.f[r[0]]);   // para la espera promedio de la zona
    acc.set(k, z);
  }
  return [...acc.values()].sort((a, b) => b.n - a.n);
}

/* ── Antigüedad de la aprobación ── */
export const TRAMOS = [
  { id: "t30", etiqueta: "Hasta 30 días", max: 30 },
  { id: "t90", etiqueta: "31 a 90 días", max: 90 },
  { id: "t180", etiqueta: "91 a 180 días", max: 180 },
  { id: "tmas", etiqueta: "Más de 180 días", max: Infinity },
] as const;

export interface Antiguedad {
  tramos: { id: string; etiqueta: string; n: number; m: number }[];
  diasMasAntigua: number;
  diasPromedio: number;
}

/** Fecha ISO como número de días desde 1970 (para promediar fechas). */
export function diaAbsoluto(iso: string): number {
  return Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86_400_000;
}

/** Días de espera promedio de una zona (ponderado por créditos) al día `hoy`. */
export function esperaPromedio(z: { n: number; sumaDias: number }, hoy: string): number {
  return z.n ? Math.max(0, Math.round(diaAbsoluto(hoy) - z.sumaDias / z.n)) : 0;
}

export function hoyArgentina() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Cordoba" }).format(new Date());
}

export function diasEntre(desdeIso: string, hastaIso: string): number {
  const t = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  return Math.max(0, Math.round((t(hastaIso) - t(desdeIso)) / 86_400_000));
}

export function antiguedad(fechas: PuntoFecha[], hoy: string): Antiguedad {
  const tramos = TRAMOS.map(t => ({ id: t.id, etiqueta: t.etiqueta, n: 0, m: 0 }));
  let suma = 0, n = 0, max = 0;
  for (const p of fechas) {
    const d = diasEntre(p.f, hoy);
    const i = TRAMOS.findIndex(t => d <= t.max);
    tramos[i].n += p.n; tramos[i].m += p.m;
    suma += d * p.n; n += p.n; if (d > max) max = d;
  }
  return { tramos, diasMasAntigua: max, diasPromedio: n ? Math.round(suma / n) : 0 };
}

/* ── Textos de la ficha de un barrio ── */
export function subBarrio(cc: CuboCapital, idx: number): string {
  const ci = cc.bar_cir?.[idx] ?? -1;
  const circuito = ci >= 0 ? cc.cir?.[ci]?.n : null;
  return "Barrio de Córdoba Capital" + (circuito ? ` · Circuito ${nombreDep(circuito)}` : "");
}

export function notaBarrio(nombreCrudo: string): string {
  return nombreCrudo === ""
    ? "Son créditos de Córdoba Capital cuyo domicilio no informa barrio. No se pueden ubicar en una zona."
    : "El barrio se concilia con la base oficial de barrios; si no hay coincidencia, figura con el nombre original de la base.";
}
