// Selección de zonas para exportar fichas (departamentos, localidades, barrios de Córdoba) y suma sin doble conteo.
// Solo trabaja con los cubos agregados de data/banco_gente/: no hay datos personales.
import type { Cubo, CuboCapital } from "@/components/Tablero";
import {
  DEP_CAPITAL, LOC_CAPITAL, fichaBarrio, fichaCircuito, fichaDepartamento, fichaLocalidad,
  type Ficha, type LineaFicha, type PuntoFecha, type Total,
} from "./acto";

export const MAX_ZONAS = 300;

export type Tipo = "dep" | "loc" | "bar" | "circ";
export interface Zona extends Total {
  clave: string;       // "d:<dep>", "l:<dep>|<loc>", "b:<idx>", "c:<código>" ("c:" solo: sin circuito)
  tipo: Tipo;
  nombre: string;      // tal como viene en la base (se formatea al mostrar)
  depto?: string;      // para localidades
  dep?: number; loc?: number; idx?: number;
  codigo?: string | null;   // circuitos: código ("0004"); null = barrios sin circuito
}

/** Departamentos, localidades (de todos los departamentos), barrios y circuitos de Capital con sus totales. */
export function listarZonas(c: Cubo, cc: CuboCapital) {
  const deps = new Map<number, Zona>(), locs = new Map<string, Zona>();
  for (const r of c.rows) {
    const d = deps.get(r[1]) ?? { clave: `d:${r[1]}`, tipo: "dep" as const, nombre: c.dep[r[1]], dep: r[1], n: 0, m: 0 };
    d.n += r[4]; d.m += r[5]; deps.set(r[1], d);
    const k = `l:${r[1]}|${r[2]}`;
    const l = locs.get(k) ?? { clave: k, tipo: "loc" as const, nombre: c.loc[r[2]], depto: c.dep[r[1]], dep: r[1], loc: r[2], n: 0, m: 0 };
    l.n += r[4]; l.m += r[5]; locs.set(k, l);
  }
  const acc = cc.bar.map(() => ({ n: 0, m: 0 }));
  for (const r of cc.rows) { acc[r[1]].n += r[3]; acc[r[1]].m += r[4]; }
  const barrios: Zona[] = cc.bar
    .map((b, idx): Zona => ({ clave: `b:${idx}`, tipo: "bar", nombre: b, idx, ...acc[idx] }))
    .filter(z => z.n > 0);
  // Circuitos: suma de sus barrios; los barrios sin circuito van aparte
  const porCirc = new Map<number, Zona>();
  const nombreCirc = (i: number) => cc.cir?.[i]?.n ?? "";
  cc.bar.forEach((_, idx) => {
    if (!acc[idx].n) return;
    const ci = cc.bar_cir?.[idx] ?? -1;
    const z = porCirc.get(ci) ?? { clave: ci >= 0 ? `c:${cc.cir![ci].c}` : "c:", tipo: "circ" as const, nombre: ci >= 0 ? nombreCirc(ci) : "", codigo: ci >= 0 ? cc.cir![ci].c : null, n: 0, m: 0 };
    z.n += acc[idx].n; z.m += acc[idx].m; porCirc.set(ci, z);
  });
  const porN = (a: Zona, b: Zona) => b.n - a.n;
  return { deps: [...deps.values()].sort(porN), locs: [...locs.values()].sort(porN), barrios: barrios.sort(porN), circuitos: [...porCirc.values()].sort(porN) };
}

export function fichaDeZona(z: Zona, c: Cubo, cc: CuboCapital): Ficha {
  if (z.tipo === "dep") return fichaDepartamento(c, z.dep!);
  if (z.tipo === "loc") return fichaLocalidad(c, z.dep!, z.loc!);
  if (z.tipo === "circ") return fichaCircuito(cc, z.codigo ?? null);
  return fichaBarrio(cc, z.idx!);
}

/** Zonas que se suman al total: se descartan las que ya están contenidas en otra elegida (una localidad dentro de un
    departamento elegido; un circuito o un barrio dentro de Capital o de la localidad Córdoba; un barrio dentro de un circuito elegido). */
export function zonasSinSuperposicion(zonas: Zona[], c: Cubo, cc?: CuboCapital): Zona[] {
  const depCapital = c.dep.indexOf(DEP_CAPITAL), locCapital = c.loc.indexOf(LOC_CAPITAL);
  const depsElegidos = new Set(zonas.filter(z => z.tipo === "dep").map(z => z.dep!));
  const cordobaElegida = zonas.some(z => z.tipo === "loc" && z.dep === depCapital && z.loc === locCapital);
  const circElegidos = new Set(zonas.filter(z => z.tipo === "circ").map(z => z.codigo ?? null));
  const circDeBarrio = (idx: number) => { const ci = cc?.bar_cir?.[idx] ?? -1; return ci >= 0 ? cc?.cir?.[ci]?.c ?? null : null; };
  return zonas.filter(z => {
    if (z.tipo === "dep") return true;
    if (z.tipo === "loc") return !depsElegidos.has(z.dep!);
    const enCapital = !depsElegidos.has(depCapital) && !cordobaElegida;   // circuito o barrio de Córdoba Capital
    if (z.tipo === "circ") return enCapital;
    return enCapital && !circElegidos.has(circDeBarrio(z.idx!));        // barrio
  });
}

export function sumarFichas(fichas: Ficha[]): Ficha {
  const lineas = new Map<string, Total>(), fechas = new Map<string, Total>();
  let n = 0, m = 0;
  for (const f of fichas) {
    n += f.n; m += f.m;
    for (const l of f.lineas) { const a = lineas.get(l.linea) ?? { n: 0, m: 0 }; a.n += l.n; a.m += l.m; lineas.set(l.linea, a); }
    for (const p of f.fechas) { const a = fechas.get(p.f) ?? { n: 0, m: 0 }; a.n += p.n; a.m += p.m; fechas.set(p.f, a); }
  }
  return {
    n, m,
    lineas: [...lineas].map(([linea, t]): LineaFicha => ({ linea, ...t })).sort((x, y) => y.m - x.m),
    fechas: [...fechas].map(([f, t]): PuntoFecha => ({ f, ...t })).sort((x, y) => (x.f < y.f ? -1 : 1)),
  };
}
