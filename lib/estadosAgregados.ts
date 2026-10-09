// Agregados de créditos por estado (data/banco_gente/estados.json) para fichas y gráficos. Solo cantidades y montos.
import { CATEGORIAS, SIN_CLASIFICAR, categoriaDe, estadoOficial } from "./estados";

/** Contenido de estados.json (los números son índices a las listas del mismo archivo; ver procesar_estados.py). */
export interface DatosEstados {
  actualizado: string; creditos: number;
  dep: string[]; loc: string[]; estados: string[]; lineas: string[]; meses: string[];
  zonas: number[][];   // [dep, loc, estado, linea, creditos, monto]
  serie: number[][];   // [mes, dep, estado, creditos, monto]
}

export interface Zona { dep: string; loc?: string }   // sin `loc`: todo el departamento
export interface FilaEstado { estado: string; n: number; m: number }
export interface FilaCategoria { categoria: string; n: number; m: number; estados: FilaEstado[] }
export interface ResumenEstados {
  n: number; m: number;
  categorias: FilaCategoria[];            // en el orden de la tabla, solo las que tienen créditos
  lineas: { linea: string; n: number; m: number }[];
  meses: { mes: string; v: number[] }[] | null;   // por mes, una cantidad por categoría (orden de `etiquetasSerie`); null si no hay serie para la zona
}

export const etiquetasSerie = [...CATEGORIAS, SIN_CLASIFICAR] as string[];

// Categorías cuyo monto representa plata entregada o comprometida (en las otras el monto es solo lo solicitado)
export const CON_MONTO = new Set<string>(CATEGORIAS.slice(1, 7));
/** Créditos cobrados por el titular (al día, con mora o finalizados). */
export const PAGADOS = ["Pagados - cuotas al día", "Pagados - con mora", "Finalizados"];

/** Zonas del archivo que cumplen alguno de los selectores. Los selectores no deben superponerse (si no, se contaría dos veces). */
export function resumenEstados(d: DatosEstados, zonas: Zona[], conSerie = true): ResumenEstados {
  const deps = new Map(d.dep.map((x, i) => [x, i]));
  const locs = new Map(d.loc.map((x, i) => [x, i]));
  const enteros = new Set<number>(), puntuales = new Set<string>();
  for (const z of zonas) {
    const di = deps.get(z.dep);
    if (di === undefined) continue;
    if (z.loc === undefined) enteros.add(di);
    else { const li = locs.get(z.loc); if (li !== undefined) puntuales.add(`${di}|${li}`); }
  }
  const porEstado = new Map<number, { n: number; m: number }>(), porLinea = new Map<number, { n: number; m: number }>();
  let n = 0, m = 0;
  for (const [di, li, ei, ln, cn, cm] of d.zonas) {
    if (!enteros.has(di) && !puntuales.has(`${di}|${li}`)) continue;
    n += cn; m += cm;
    const e = porEstado.get(ei) ?? { n: 0, m: 0 }; e.n += cn; e.m += cm; porEstado.set(ei, e);
    const l = porLinea.get(ln) ?? { n: 0, m: 0 }; l.n += cn; l.m += cm; porLinea.set(ln, l);
  }
  const porCat = new Map<string, FilaCategoria>();
  for (const [ei, v] of porEstado) {
    const cat = categoriaDe(d.estados[ei]);
    const c = porCat.get(cat) ?? { categoria: cat, n: 0, m: 0, estados: [] };
    c.n += v.n; c.m += v.m;
    c.estados.push({ estado: estadoOficial(d.estados[ei]) || d.estados[ei], ...v });
    porCat.set(cat, c);
  }
  const categorias = etiquetasSerie.filter(c => porCat.has(c)).map(c => {
    const f = porCat.get(c)!; f.estados.sort((a, b) => b.n - a.n); return f;
  });
  const lineas = [...porLinea].map(([i, v]) => ({ linea: d.lineas[i], ...v })).sort((a, b) => b.n - a.n);
  return { n, m, categorias, lineas, meses: conSerie && !puntuales.size ? serieMensual(d, enteros) : null };
}

/** Solicitudes por mes y categoría (los meses sin solicitudes entre el primero y el último figuran en cero). */
function serieMensual(d: DatosEstados, deps: Set<number>): ResumenEstados["meses"] {
  const porMes = new Map<number, number[]>();
  const idxCat = (ei: number) => etiquetasSerie.indexOf(categoriaDe(d.estados[ei]));
  for (const [mi, di, ei, cn] of d.serie) {
    if (deps.size && !deps.has(di)) continue;
    const v = porMes.get(mi) ?? new Array(etiquetasSerie.length).fill(0);
    v[idxCat(ei)] += cn; porMes.set(mi, v);
  }
  if (!porMes.size) return null;
  const claves = [...porMes.keys()].map(i => d.meses[i]).sort();
  const out: { mes: string; v: number[] }[] = [];
  let [y, mm] = claves[0].split("-").map(Number);
  const [ey, em] = claves[claves.length - 1].split("-").map(Number);
  const porClave = new Map([...porMes].map(([i, v]) => [d.meses[i], v]));
  while (y < ey || (y === ey && mm <= em)) {
    const k = `${y}-${String(mm).padStart(2, "0")}`;
    out.push({ mes: k, v: porClave.get(k) ?? new Array(etiquetasSerie.length).fill(0) });
    mm++; if (mm > 12) { mm = 1; y++; }
  }
  return out;
}

/** Todo el programa (todos los departamentos). */
export const resumenTotal = (d: DatosEstados) => resumenEstados(d, d.dep.map(dep => ({ dep })));
