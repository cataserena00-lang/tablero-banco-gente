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
  zonaIds: number[];                                                                               // varias zonas a la vez (índices de `zonas`); vacío = sin filtro
  curso: string;                                                                                   // texto a buscar en el nombre o la institución
}
export const SIN_FILTRO: Filtro = { etapa: -1, sector: -1, tipo: -1, modalidad: -1, desde: -1, hasta: -1, dep: -1, zona: -1, zonaIds: [], curso: "" };

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
  if (f.zonaIds.length && !f.zonaIds.includes(c[C.zona])) return false;
  if (f.desde >= 0 && (c[C.mes] < 0 || c[C.mes] < f.desde)) return false;
  if (f.hasta >= 0 && (c[C.mes] < 0 || c[C.mes] > f.hasta)) return false;
  if (textoNorm && !nombresNorm[c[C.curso]].includes(textoNorm) && !instNorm[c[C.inst]].includes(textoNorm)) return false;
  return true;
}

export interface Agregado { cursos: number; perfil: number[]; indices: number[] }
export interface Grupo { cursos: number; insc: number; egr: number }   // egr: egresados

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

export function agrupar(d: DatosCmc, indices: number[], clave: (c: number[]) => number, n: number, iEgr: number): Grupo[] {
  const g: Grupo[] = Array.from({ length: n }, () => ({ cursos: 0, insc: 0, egr: 0 }));
  for (const i of indices) { const x = g[clave(d.cursos[i])]; x.cursos++; x.insc += d.perfil[i][0]; x.egr += d.perfil[i][iEgr]; }
  return g;
}

/** Personas y capacitadores DISTINTOS de una zona y etapa (precalculados; no se pueden sumar entre cursos). */
export function unicosDe(d: DatosCmc, f: Filtro): { personas: number; capacitadores: number } | null {
  if (f.sector >= 0 || f.tipo >= 0 || f.modalidad >= 0 || f.desde >= 0 || f.hasta >= 0 || f.curso.trim() || f.zonaIds.length) return null;
  const zona = f.zona >= 0 ? f.zona : f.dep >= 0 ? -2 - f.dep : -1;
  const u = d.unicos.find(x => x[0] === zona && x[1] === f.etapa);
  return u ? { personas: u[2], capacitadores: u[3] } : null;
}

export const pct = (a: number, b: number) => (b ? (100 * a / b).toLocaleString("es-AR", { maximumFractionDigits: 1 }) + " %" : "—");
export const mesTexto = (k: string) => { const M = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]; return `${M[+k.slice(5, 7) - 1]} ${k.slice(0, 4)}`; };

/* ── Resumen de una vista (general, departamento o localidad), compartido por la pantalla, las hojas del PDF y la página de exportar ── */
export interface Contexto { off: ReturnType<typeof offsets>; nombresNorm: string[]; instNorm: string[] }
export const contexto = (d: DatosCmc): Contexto => ({ off: offsets(d), nombresNorm: d.cursos_nombres.map(normaliza), instNorm: d.inst.map(normaliza) });

export interface Resumen {
  ag: Agregado;
  insc: number;
  estados: { c: string; v: number }[];
  grupos: Record<string, { c: string; v: number }[]>;       // sexo, edad, estudios, trabajo, discapacidad
  porDep: Grupo[];                                          // sin aplicar el filtro de zona (para el mapa y el ranking)
  porZona: Grupo[];                                         // localidades, con el filtro de zona
  porSector: Grupo[];                                       // sin aplicar el filtro de sector (para poder elegir otro)
  meses: { mes: string; v: number[] }[];                    // inscripciones por mes de inicio, apiladas por estado
  unicos: { personas: number; capacitadores: number } | null;
}

export function calcular(d: DatosCmc, f: Filtro, cx: Contexto): Resumen {
  const ag = agregar(d, f, cx.nombresNorm, cx.instNorm);
  const agMapa = agregar(d, { ...f, dep: -1, zona: -1, zonaIds: [] }, cx.nombresNorm, cx.instNorm);
  const agSector = agregar(d, { ...f, sector: -1 }, cx.nombresNorm, cx.instNorm);
  const grupo = (n: string) => cx.off[n].cats.map((c, i) => ({ c, v: ag.perfil[cx.off[n].ini + i] }));
  const iEgr = cx.off.estado.ini + cx.off.estado.cats.indexOf("EGRESADO");
  const o = cx.off.estado, mapa = new Map<number, number[]>();
  for (const i of ag.indices) {
    const m = d.cursos[i][C.mes]; if (m < 0) continue;
    const v = mapa.get(m) ?? new Array(o.cats.length).fill(0);
    for (let k = 0; k < o.cats.length; k++) v[k] += d.perfil[i][o.ini + k];
    mapa.set(m, v);
  }
  return {
    ag, insc: ag.perfil[0], estados: grupo("estado"),
    grupos: Object.fromEntries(["sexo", "edad", "estudios", "trabajo", "discapacidad"].map(n => [n, grupo(n)])),
    porDep: agrupar(d, agMapa.indices, c => d.zonas[c[C.zona]][0], d.dep.length, iEgr),
    porZona: agrupar(d, ag.indices, c => c[C.zona], d.zonas.length, iEgr),
    porSector: agrupar(d, agSector.indices, c => c[C.sector], d.sectores.length, iEgr),
    meses: [...mapa.entries()].sort((a, b) => a[0] - b[0]).map(([m, v]) => ({ mes: d.meses[m], v })),
    unicos: unicosDe(d, f),
  };
}

/** Textos de los estados y las categorías que se muestran (los mismos en pantalla, hojas y Excel). */
export const TITULO_ESTADO: Record<string, string> = { INSCRIPTO: "Inscriptos", CURSANDO: "Cursando", APROBADO: "Aprobados", EGRESADO: "Egresados", "NO APROBADO": "No aprobados", BAJA: "Bajas" };
export const COLOR_ESTADO: Record<string, string> = { INSCRIPTO: "#9aa3b2", CURSANDO: "#2a78d6", APROBADO: "#1baf7a", EGRESADO: "#008300", "NO APROBADO": "#eda100", BAJA: "#e34948" };
export const TITULO_SEXO: Record<string, string> = { F: "Mujeres", M: "Varones", X: "Otro" };
export const GRUPOS_PERFIL: [string, string][] = [["sexo", "Sexo"], ["edad", "Edad"], ["estudios", "Nivel de estudios"], ["trabajo", "Situación laboral"]];
export const nEstado = (r: Resumen, e: string) => r.estados.find(x => x.c === e)?.v ?? 0;
