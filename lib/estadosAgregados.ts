// Agregados de créditos por estado (data/banco_gente/estados.json) para fichas y gráficos. Solo cantidades y montos.
import { CATEGORIAS, SIN_CLASIFICAR, categoriaDe, estadoOficial } from "./estados";

/** Contenido de estados.json (los números son índices a las listas del mismo archivo; ver procesar_estados.py). */
export interface DatosEstados {
  version?: number;   // 2: `serie` trae la línea
  actualizado: string; creditos: number;
  dep: string[]; loc: string[]; estados: string[]; lineas: string[]; meses: string[];
  zonas: number[][];   // [dep, loc, estado, linea, creditos, monto]
  serie: number[][];   // versión 2: [mes, dep, estado, linea, creditos, monto]; versión 1: [mes, dep, estado, creditos, monto]
}

export interface Zona { dep: string; loc?: string }   // sin `loc`: todo el departamento
export interface FilaEstado { estado: string; n: number; m: number }
export interface FilaCategoria { categoria: string; n: number; m: number; estados: FilaEstado[] }
/** Solicitudes de una zona agrupadas por estado puntual y línea (la base de todos los gráficos de la ficha). */
export interface Celda { estado: string; categoria: string; linea: string; n: number; m: number }
export interface PuntoSerie { mes: string; categoria: string; linea: string | null; n: number }
export interface ResumenEstados {
  n: number; m: number;
  celdas: Celda[];
  serie: PuntoSerie[] | null;   // por mes; null si no hay serie para la zona (localidades) o el archivo no la trae
  serieConLinea: boolean;       // false con archivos de la versión 1 (la serie no distingue la línea)
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
  const acc = new Map<string, Celda>();
  let n = 0, m = 0;
  for (const [di, li, ei, ln, cn, cm] of d.zonas) {
    if (!enteros.has(di) && !puntuales.has(`${di}|${li}`)) continue;
    n += cn; m += cm;
    const k = `${ei}|${ln}`;
    const c = acc.get(k) ?? { estado: estadoOficial(d.estados[ei]) || d.estados[ei], categoria: categoriaDe(d.estados[ei]), linea: d.lineas[ln], n: 0, m: 0 };
    c.n += cn; c.m += cm; acc.set(k, c);
  }
  const v2 = d.version === 2;
  return { n, m, celdas: [...acc.values()], serie: conSerie && !puntuales.size ? serieMensual(d, enteros, v2) : null, serieConLinea: v2 };
}

/** Solicitudes por mes, categoría y línea de los departamentos elegidos. */
function serieMensual(d: DatosEstados, deps: Set<number>, v2: boolean): PuntoSerie[] | null {
  const acc = new Map<string, PuntoSerie>();
  for (const fila of d.serie) {
    const [mi, di, ei] = fila;
    const ln = v2 ? fila[3] : -1, cn = v2 ? fila[4] : fila[3];
    if (deps.size && !deps.has(di)) continue;
    const categoria = categoriaDe(d.estados[ei]), linea = ln >= 0 ? d.lineas[ln] : null;
    const k = `${mi}|${categoria}|${linea}`;
    const p = acc.get(k) ?? { mes: d.meses[mi], categoria, linea, n: 0 };
    p.n += cn; acc.set(k, p);
  }
  return acc.size ? [...acc.values()] : null;
}

export interface FiltroResumen { categoria?: string | null; linea?: string | null }
export interface VistaResumen {
  n: number; m: number;
  categorias: FilaCategoria[];   // según la línea elegida (la categoría elegida se resalta, no se filtra)
  lineas: { linea: string; n: number; m: number }[];   // según la categoría elegida
  meses: { mes: string; v: number[] }[] | null;        // según categoría y línea; v en el orden de `etiquetasSerie`
  mesesSinLinea: boolean;        // se pidió una línea pero el archivo no distingue la línea por mes
}

/** Resumen con los filtros cruzados: elegir una línea cambia las barras de estado, y elegir un estado cambia las de línea. */
export function vistaResumen(r: ResumenEstados, f: FiltroResumen = {}): VistaResumen {
  const cat = f.categoria || null, lin = f.linea || null;
  const porCat = new Map<string, FilaCategoria>(), porLinea = new Map<string, { linea: string; n: number; m: number }>();
  let n = 0, m = 0;
  for (const c of r.celdas) {
    if (!lin || c.linea === lin) {
      const fc = porCat.get(c.categoria) ?? { categoria: c.categoria, n: 0, m: 0, estados: [] };
      fc.n += c.n; fc.m += c.m;
      const e = fc.estados.find(x => x.estado === c.estado);
      if (e) { e.n += c.n; e.m += c.m; } else fc.estados.push({ estado: c.estado, n: c.n, m: c.m });
      porCat.set(c.categoria, fc);
    }
    if (!cat || c.categoria === cat) {
      const fl = porLinea.get(c.linea) ?? { linea: c.linea, n: 0, m: 0 };
      fl.n += c.n; fl.m += c.m; porLinea.set(c.linea, fl);
      if (!lin || c.linea === lin) { n += c.n; m += c.m; }
    }
  }
  const categorias = etiquetasSerie.filter(c => porCat.has(c)).map(c => {
    const x = porCat.get(c)!; x.estados.sort((a, b) => b.n - a.n); return x;
  });
  const lineas = [...porLinea.values()].sort((a, b) => b.n - a.n);
  const mesesSinLinea = !!lin && !!r.serie && !r.serieConLinea;
  return { n, m, categorias, lineas, meses: mesesSinLinea ? null : serieCompleta(r.serie, cat, lin), mesesSinLinea };
}

/** Los meses sin solicitudes entre el primero y el último figuran en cero. */
function serieCompleta(serie: PuntoSerie[] | null, cat: string | null, lin: string | null): VistaResumen["meses"] {
  if (!serie) return null;
  const porMes = new Map<string, number[]>();
  for (const p of serie) {
    if (cat && p.categoria !== cat) continue;
    if (lin && p.linea !== lin) continue;
    const v = porMes.get(p.mes) ?? new Array(etiquetasSerie.length).fill(0);
    v[etiquetasSerie.indexOf(p.categoria)] += p.n; porMes.set(p.mes, v);
  }
  const claves = [...new Set(serie.map(p => p.mes))].sort();
  if (!claves.length) return null;
  const out: { mes: string; v: number[] }[] = [];
  let [y, mm] = claves[0].split("-").map(Number);
  const [ey, em] = claves[claves.length - 1].split("-").map(Number);
  while (y < ey || (y === ey && mm <= em)) {
    const k = `${y}-${String(mm).padStart(2, "0")}`;
    out.push({ mes: k, v: porMes.get(k) ?? new Array(etiquetasSerie.length).fill(0) });
    mm++; if (mm > 12) { mm = 1; y++; }
  }
  return out;
}

/** Todo el programa (todos los departamentos). */
export const resumenTotal = (d: DatosEstados) => resumenEstados(d, d.dep.map(dep => ({ dep })));
