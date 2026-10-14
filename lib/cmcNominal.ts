import { conexion, consulta } from "@/lib/personas";

/* Datos NOMINALES de Córdoba me capacita en Neon (participantes, capacitadores y costos de los cursos).
   Solo se importa desde el servidor (rutas /api/cmc), siempre después de exigirRol("completo", "cmc").
   Las tablas las arma pipelines/cba_me_capacita/cargar_nominal_cmc.py; las zonas usan los mismos nombres que el tablero
   (zona_dep, zona_loc). Los valores van siempre como parámetros ($1, $2...), nunca pegados al texto de la consulta. */

export const POR_PAGINA_CMC = 50;
export const MAX_FILAS_EXCEL_CMC = 100_000;
export type Celda = string | number | null;

/** Qué se pide: un curso, o una zona (departamento y, si se quiere, localidad). Con `q`, busca por apellido, nombre, CUIL o documento. */
export interface AlcanceCmc { curso?: number; dep?: string; loc?: string; q?: string }

const sinTildes = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "");
const escapar = (s: string) => s.replace(/[\\%_]/g, c => "\\" + c);

function donde(a: AlcanceCmc, alias = "p") {
  const w: string[] = [], params: unknown[] = [];
  if (a.curso !== undefined) { params.push(a.curso); w.push(`${alias}.id_curso = $${params.length}`); }
  if (a.dep) { params.push(a.dep); w.push(`${alias}.zona_dep = $${params.length}`); }
  if (a.loc) { params.push(a.loc); w.push(`${alias}.zona_loc = $${params.length}`); }
  for (const t of sinTildes(a.q ?? "").toUpperCase().split(/\s+/).filter(Boolean).slice(0, 5)) {
    const digitos = t.replace(/\D/g, "");
    if (digitos.length >= 3 && digitos.length === t.replace(/[.\-]/g, "").length) { params.push(`%${digitos}%`); w.push(`(${alias}.cuil LIKE $${params.length} OR ${alias}.dni LIKE $${params.length})`); }
    else { params.push(`%${escapar(t)}%`); w.push(`translate(upper(${alias}.apellido || ' ' || ${alias}.nombre), 'ÁÉÍÓÚÜ', 'AEIOUU') LIKE $${params.length}`); }
  }
  return { sql: w.length ? "WHERE " + w.join(" AND ") : "", params };
}
const sql = () => { const c = conexion(); if (!c) throw new Error("sin_base"); return c; };

const COLS_LISTA = "p.apellido, p.nombre, p.cuil, p.dni, p.sexo, p.edad, p.telefono, p.mail, p.estado, c.curso, c.institucion, p.zona_loc AS localidad, p.zona_dep AS departamento";

export async function listarParticipantes(a: AlcanceCmc, pagina: number) {
  const c = sql(), { sql: w, params } = donde(a);
  const total = (await consulta<{ n: number }>(c, `SELECT count(*)::int AS n FROM cmc_participantes p ${w}`, params))[0]?.n ?? 0;
  const filas = await consulta<Record<string, Celda>>(c,
    `SELECT ${COLS_LISTA} FROM cmc_participantes p JOIN cmc_cursos c USING (id_curso) ${w} ORDER BY p.apellido, p.nombre, p.id LIMIT ${POR_PAGINA_CMC} OFFSET ${(Math.max(1, pagina) - 1) * POR_PAGINA_CMC}`, params);
  return { total, filas, pagina: Math.max(1, pagina), porPagina: POR_PAGINA_CMC };
}

/** Columnas del Excel de participantes, en este orden (lista cerrada). */
export const COLUMNAS_PARTICIPANTES_XLSX: { clave: string; titulo: string; ancho: number; tipo?: "fecha" }[] = [
  { clave: "cuil", titulo: "CUIL", ancho: 14 }, { clave: "dni", titulo: "DNI", ancho: 12 }, { clave: "apellido", titulo: "Apellido", ancho: 22 },
  { clave: "nombre", titulo: "Nombre", ancho: 22 }, { clave: "sexo", titulo: "Sexo", ancho: 7 }, { clave: "edad", titulo: "Edad", ancho: 7 },
  { clave: "telefono", titulo: "Teléfono", ancho: 14 }, { clave: "telefono_alt", titulo: "Teléfono alternativo", ancho: 14 }, { clave: "mail", titulo: "Mail", ancho: 28 },
  { clave: "estado", titulo: "Estado", ancho: 14 }, { clave: "curso", titulo: "Curso", ancho: 36 }, { clave: "institucion", titulo: "Institución", ancho: 28 },
  { clave: "localidad", titulo: "Localidad", ancho: 20 }, { clave: "departamento", titulo: "Departamento", ancho: 20 }, { clave: "inicio", titulo: "Inicio del curso", ancho: 14, tipo: "fecha" },
];
export async function participantesParaExcel(a: AlcanceCmc) {
  const c = sql(), { sql: w, params } = donde(a);
  const total = (await consulta<{ n: number }>(c, `SELECT count(*)::int AS n FROM cmc_participantes p ${w}`, params))[0]?.n ?? 0;
  if (total > MAX_FILAS_EXCEL_CMC) return { total, filas: [] as Record<string, Celda | Date>[], excede: true };
  const filas = await consulta<Record<string, Celda | Date>>(c,
    `SELECT ${COLS_LISTA}, p.telefono_alt, c.fecha_inicio AS inicio FROM cmc_participantes p JOIN cmc_cursos c USING (id_curso) ${w} ORDER BY p.apellido, p.nombre, p.id`, params);
  return { total, filas, excede: false };
}

export interface CursoDetalle {
  id_curso: number; curso: string; institucion: string; tipo_institucion: string; etapa: string; estado_planificacion: string; sector: string;
  trayecto: string | null; modalidad: string; fecha_inicio: string | null; fecha_fin: string | null; hs_presenciales: number | null; sede: string | null;
  zona_dep: string; zona_loc: string; condicion_pago: string | null; partida: string | null; total_honorarios: number | null; mat_pedagogico: number | null; total: number | null; inscriptos: number;
}
export async function detalleCurso(id: number) {
  const c = sql();
  const curso = (await consulta<CursoDetalle>(c, "SELECT * FROM cmc_cursos WHERE id_curso = $1", [id]))[0] ?? null;
  if (!curso) return null;
  const capacitadores = await consulta<{ apellido: string | null; nombre: string | null; cuil: string | null }>(c,
    "SELECT apellido, nombre, cuil FROM cmc_capacitadores WHERE id_curso = $1 ORDER BY apellido, nombre", [id]);
  return { curso, capacitadores };
}

/** Costos y capacitadores de una zona (o de todo el programa si no se indica). */
export async function resumenZona(dep?: string, loc?: string) {
  const c = sql(), params: unknown[] = [], w: string[] = [];
  if (dep) { params.push(dep); w.push(`zona_dep = $${params.length}`); }
  if (loc) { params.push(loc); w.push(`zona_loc = $${params.length}`); }
  const where = w.length ? "WHERE " + w.join(" AND ") : "";
  const costos = (await consulta<{ cursos: number; honorarios: number; material: number; total: number; horas: number }>(c,
    `SELECT count(*)::int AS cursos, COALESCE(sum(total_honorarios), 0)::bigint AS honorarios, COALESCE(sum(mat_pedagogico), 0)::bigint AS material,
            COALESCE(sum(total), 0)::bigint AS total, COALESCE(sum(hs_presenciales), 0)::int AS horas FROM cmc_cursos ${where}`, params))[0];
  const capacitadores = (await consulta<{ n: number }>(c,
    `SELECT count(DISTINCT k.cuil)::int AS n FROM cmc_capacitadores k JOIN cmc_cursos q USING (id_curso) ${where.replace(/zona_/g, "q.zona_")}`, params))[0]?.n ?? 0;
  return { costos: { ...costos, honorarios: Number(costos.honorarios), material: Number(costos.material), total: Number(costos.total) }, capacitadores };
}

export const COLUMNAS_CAPACITADORES_XLSX: { clave: string; titulo: string; ancho: number; tipo?: "fecha" }[] = [
  { clave: "cuil", titulo: "CUIL", ancho: 14 }, { clave: "apellido", titulo: "Apellido", ancho: 22 }, { clave: "nombre", titulo: "Nombre", ancho: 22 },
  { clave: "cursos", titulo: "Cursos", ancho: 9 }, { clave: "localidades", titulo: "Localidades", ancho: 40 }, { clave: "departamentos", titulo: "Departamentos", ancho: 30 },
];
export async function capacitadoresParaExcel(a: AlcanceCmc) {
  const c = sql(), params: unknown[] = [], w: string[] = [];
  if (a.curso !== undefined) { params.push(a.curso); w.push(`q.id_curso = $${params.length}`); }
  if (a.dep) { params.push(a.dep); w.push(`q.zona_dep = $${params.length}`); }
  if (a.loc) { params.push(a.loc); w.push(`q.zona_loc = $${params.length}`); }
  const where = w.length ? "WHERE " + w.join(" AND ") : "";
  const filas = await consulta<Record<string, Celda>>(c,
    `SELECT k.cuil, k.apellido, k.nombre, count(DISTINCT q.id_curso)::int AS cursos, string_agg(DISTINCT q.zona_loc, ', ' ORDER BY q.zona_loc) AS localidades,
            string_agg(DISTINCT q.zona_dep, ', ' ORDER BY q.zona_dep) AS departamentos
     FROM cmc_capacitadores k JOIN cmc_cursos q USING (id_curso) ${where} GROUP BY k.cuil, k.apellido, k.nombre ORDER BY k.apellido, k.nombre LIMIT ${MAX_FILAS_EXCEL_CMC}`, params);
  return { total: filas.length, filas };
}
