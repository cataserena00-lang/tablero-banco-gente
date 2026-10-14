// Córdoba me capacita: tipos y cálculos del tablero (datos agregados de data/cba_me_capacita/cursos.json, sin datos personales).
// Cada curso lleva su zona y atributos, y un vector de perfil con los conteos de sus inscriptos (ver pipelines/cba_me_capacita/procesar.py).

export interface DatosCmc {
  version: number; actualizado: string; desde: string;
  dep: string[]; zonas: [number, string][];            // zona = [índice de departamento, localidad]
  cursos_nombres: string[]; inst: string[]; sectores: string[]; tipos: string[]; modalidades: string[]; etapas: string[]; meses: string[];
  campos_perfil: [string, string[]][];
  cursos: number[][];                                  // [id, curso, inst, zona, sector, tipo, modalidad, etapa, mes|-1, horas]
  perfil: number[][];                                  // un vector por curso
  unicos: number[][];                                  // [zona (≥0) | -1 total | -2-dep, etapa|-1, personas, capacitadores]
}
export interface Filtro {
  etapa: number; sector: number; tipo: number; modalidad: number; desde: number; hasta: number;   // -1 = sin filtro (desde/hasta: índice de mes)
  dep: number; zona: number;
  curso: string;                                                                                   // texto a buscar en el nombre o la institución
}
export const SIN_FILTRO: Filtro = { etapa: -1, sector: -1, tipo: -1, modalidad: -1, desde: -1, hasta: -1, dep: -1, zona: -1, curso: "" };

export const C = { id: 0, curso: 1, inst: 2, zona: 3, sector: 4, tipo: 5, modalidad: 6, etapa: 7, mes: 8, hs: 9 } as const;

/** Posición de cada grupo dentro del vector de perfil. */
export function offsets(d: DatosCmc) {
  const o: Record<string, { ini: number; cats: string[] }> = {};
  let p = 0;
  for (const [n, cats] of d.campos_perfil) { o[n] = { ini: p, cats }; p += cats.length; }
  return o;
}

export const normaliza = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** ¿El curso `i` cumple los filtros? (el texto se compara ya normalizado, en `textoNorm`) */
export function pasa(d: DatosCmc, i: number, f: Filtro, textoNorm: string, nombresNorm: string[], instNorm: string[]): boolean {
  const c = d.cursos[i], z = d.zonas[c[C.zona]];
  if (f.etapa >= 0 && c[C.etapa] !== f.etapa) return false;
  if (f.sector >= 0 && c[C.sector] !== f.sector) return false;
  if (f.tipo >= 0 && c[C.tipo] !== f.tipo) return false;
  if (f.modalidad >= 0 && c[C.modalidad] !== f.modalidad) return false;
  if (f.dep >= 0 && z[0] !== f.dep) return false;
  if (f.zona >= 0 && c[C.zona] !== f.zona) return false;
  if (f.desde >= 0 && (c[C.mes] < 0 || c[C.mes] < f.desde)) return false;
  if (f.hasta >= 0 && (c[C.mes] < 0 || c[C.mes] > f.hasta)) return false;
  if (textoNorm && !nombresNorm[c[C.curso]].includes(textoNorm) && !instNorm[c[C.inst]].includes(textoNorm)) return false;
  return true;
}

export interface Agregado { cursos: number; perfil: number[]; indices: number[] }
export interface Grupo { cursos: number; insc: number }

/** Suma el perfil de los cursos que pasan el filtro. Devuelve también cuáles son (para tablas y gráficos). */
export function agregar(d: DatosCmc, f: Filtro, nombresNorm: string[], instNorm: string[]): Agregado {
  const largo = d.perfil[0]?.length ?? 0, perfil = new Array(largo).fill(0), indices: number[] = [];
  const t = normaliza(f.curso.trim());
  for (let i = 0; i < d.cursos.length; i++) {
    if (!pasa(d, i, f, t, nombresNorm, instNorm)) continue;
    indices.push(i);
    const v = d.perfil[i];
    for (let k = 0; k < largo; k++) perfil[k] += v[k];
  }
  return { cursos: indices.length, perfil, indices };
}

export function agrupar(d: DatosCmc, indices: number[], clave: (c: number[]) => number, n: number): Grupo[] {
  const g: Grupo[] = Array.from({ length: n }, () => ({ cursos: 0, insc: 0 }));
  for (const i of indices) { const x = g[clave(d.cursos[i])]; x.cursos++; x.insc += d.perfil[i][0]; }
  return g;
}

/** Personas y capacitadores DISTINTOS de una zona y etapa (precalculados; no se pueden sumar entre cursos). */
export function unicosDe(d: DatosCmc, f: Filtro): { personas: number; capacitadores: number } | null {
  if (f.sector >= 0 || f.tipo >= 0 || f.modalidad >= 0 || f.desde >= 0 || f.hasta >= 0 || f.curso.trim()) return null;
  const zona = f.zona >= 0 ? f.zona : f.dep >= 0 ? -2 - f.dep : -1;
  const u = d.unicos.find(x => x[0] === zona && x[1] === f.etapa);
  return u ? { personas: u[2], capacitadores: u[3] } : null;
}

export const pct = (a: number, b: number) => (b ? (100 * a / b).toLocaleString("es-AR", { maximumFractionDigits: 1 }) + " %" : "—");
export const mesTexto = (k: string) => { const M = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]; return `${M[+k.slice(5, 7) - 1]} ${k.slice(0, 4)}`; };
