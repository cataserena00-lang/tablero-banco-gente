import { conexion, consulta } from "@/lib/personas";

/* Actividad de los usuarios (tabla `accesos`): ingresos al tablero, consultas de personas y exportables generados.
   Solo la lee el perfil admin (rutas /api/actividad y página /banco-gente/actividad, siempre después de exigirRol("admin")).
   La conexión "lectura" necesita SELECT sobre `accesos` (ver pipelines/banco_gente/personas_schema.sql). */

export const POR_PAGINA_ACTIVIDAD = 50;

// Grupos de acciones del filtro
export const GRUPOS = {
  ingreso: ["ingreso"],
  exportable: ["exportacion", "exportable"],     // PDF de personas (servidor) y fichas/resúmenes impresos (navegador)
  consulta: ["busqueda", "ficha"],
} as const;
export type Grupo = keyof typeof GRUPOS;

export interface FiltrosActividad { usuario?: string; grupo?: string; desde?: string; hasta?: string; dias?: number; pagina?: number }
export interface Evento { id: number; creado: string; usuario: string; rol: string; accion: string; detalle: unknown; resultados: number | null }
export interface ResumenUsuario { usuario: string; rol: string; ingresos: number; ultimo_ingreso: string | null; exportables: number; consultas: number; ultimo: string }

const esFecha = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

function condiciones(f: FiltrosActividad) {
  const where: string[] = [], params: unknown[] = [];
  const p = (v: unknown) => { params.push(v); return `$${params.length}`; };
  if (f.usuario?.trim()) where.push(`usuario = ${p(f.usuario.trim())}`);
  const g = f.grupo as Grupo | undefined;
  if (g && g in GRUPOS) where.push(`accion = ANY(${p([...GRUPOS[g]])}::text[])`);
  if (esFecha(f.desde)) where.push(`creado >= (${p(f.desde)}::date)::timestamp AT TIME ZONE 'America/Argentina/Cordoba'`);
  if (esFecha(f.hasta)) where.push(`creado < ((${p(f.hasta)}::date) + 1)::timestamp AT TIME ZONE 'America/Argentina/Cordoba'`);
  return { sql: where.length ? "WHERE " + where.join(" AND ") : "", params };
}

export async function listarEventos(f: FiltrosActividad) {
  const sql = conexion();
  if (!sql) throw new Error("sin_base");
  const pagina = Math.min(Math.max(1, Math.floor(f.pagina || 1)), 1000);
  const { sql: where, params } = condiciones(f);
  const [filas, total] = await Promise.all([
    consulta<Evento>(sql, `SELECT id, creado, usuario, rol, accion, detalle, resultados FROM accesos ${where} ORDER BY creado DESC, id DESC LIMIT ${POR_PAGINA_ACTIVIDAD} OFFSET ${(pagina - 1) * POR_PAGINA_ACTIVIDAD}`, params),
    consulta<{ n: number }>(sql, `SELECT count(*)::int AS n FROM accesos ${where}`, params),
  ]);
  return { filas, total: total[0]?.n ?? 0, pagina, porPagina: POR_PAGINA_ACTIVIDAD };
}

/** Un renglón por usuario con lo que hizo en los últimos `dias` días, y los días con ingresos (para el gráfico). */
export async function resumenActividad(dias = 30) {
  const sql = conexion();
  if (!sql) throw new Error("sin_base");
  const d = Math.min(Math.max(1, Math.floor(dias) || 30), 365);
  const [usuarios, porDia, usuariosTodos] = await Promise.all([
    consulta<ResumenUsuario>(sql,
      `SELECT usuario, (array_agg(rol ORDER BY creado DESC))[1] AS rol,
              count(*) FILTER (WHERE accion = 'ingreso')::int AS ingresos,
              max(creado) FILTER (WHERE accion = 'ingreso') AS ultimo_ingreso,
              count(*) FILTER (WHERE accion IN ('exportacion', 'exportable'))::int AS exportables,
              count(*) FILTER (WHERE accion IN ('busqueda', 'ficha'))::int AS consultas,
              max(creado) AS ultimo
         FROM accesos WHERE creado >= now() - make_interval(days => $1)
         GROUP BY usuario ORDER BY count(*) FILTER (WHERE accion = 'ingreso') DESC, usuario`, [d]),
    consulta<{ dia: string; ingresos: number; exportables: number }>(sql,
      `SELECT to_char(creado AT TIME ZONE 'America/Argentina/Cordoba', 'YYYY-MM-DD') AS dia,
              count(*) FILTER (WHERE accion = 'ingreso')::int AS ingresos,
              count(*) FILTER (WHERE accion IN ('exportacion', 'exportable'))::int AS exportables
         FROM accesos WHERE creado >= now() - make_interval(days => $1) GROUP BY 1 ORDER BY 1`, [d]),
    consulta<{ usuario: string }>(sql, "SELECT DISTINCT usuario FROM accesos ORDER BY 1"),
  ]);
  return { dias: d, usuarios, porDia, todosLosUsuarios: usuariosTodos.map(u => u.usuario) };
}
