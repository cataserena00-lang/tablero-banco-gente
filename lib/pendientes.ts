import { conexion, consulta } from "@/lib/personas";

/* Listado de créditos PENDIENTES DE ENTREGA (datos NOMINALES) en Neon, tabla `pendientes`.
   La arma pipelines/banco_gente/cargar_pendientes.py a partir del Excel de Drive. Solo se importa desde el servidor, siempre
   después de exigirRol("completo"). Las zonas se filtran con los mismos nombres que usa el tablero (zona_dep, zona_loc, barrio). */

export const MAX_FILAS_EXCEL = 100_000;

/** Zona a exportar. `barrio` y `circuito` solo en Capital (código del circuito, o SIN_CIRCUITO_PEND): "" es «sin barrio informado»; sin `barrio`, no se filtra por barrio. */
export const SIN_CIRCUITO_PEND = "__sin__";   // valor de `circuito` para «sin circuito asignado»
export interface ZonaPendientes { dep: string; loc?: string; barrio?: string; circuito?: string }
export type Celda = string | number | Date | null;
export interface ColumnaPend { nombre: string; tipo: string }   // tipo: "text" | "double precision" | "date"

function condiciones(z: ZonaPendientes) {
  const where = ["zona_dep = $1"], params: unknown[] = [z.dep];
  if (z.loc !== undefined) { params.push(z.loc); where.push(`zona_loc = $${params.length}`); }
  // «Sin barrio informado» ("") se guarda como nulo en la base: se compara sin distinguir nulo de vacío
  if (z.barrio !== undefined) { params.push(z.barrio); where.push(`COALESCE(barrio, '') = $${params.length}`); }
  // Circuito de Capital: el código es lo que va antes de " - " en la columna `circuito`
  if (z.circuito !== undefined) {
    if (z.circuito === SIN_CIRCUITO_PEND) where.push("circuito IS NULL");
    else { params.push(z.circuito); where.push(`split_part(circuito, ' - ', 1) = $${params.length}`); }
  }
  return { sql: "WHERE " + where.join(" AND "), params };
}

// Columnas del Excel, en este orden (las pidió el Banco). Es una lista cerrada: el resto de lo que trae el Excel de origen
// (CBU, cuenta bancaria, garante, etc.) nunca sale de la base. «linea_oficial» es la línea con su nombre oficial.
export const COLUMNAS_EXCEL = ["cuil", "sexo", "solicitante", "localidad", "departamento", "telefono", "mail", "linea_oficial",
  "monto_credito", "estado_prestamo", "fecha_aprobacion"];

// Tipo de cada columna de la lista, leído una vez de la tabla
let _cols: Promise<ColumnaPend[]> | null = null;
async function columnas(): Promise<ColumnaPend[]> {
  const sql = conexion();
  if (!sql) throw new Error("sin_base");
  _cols ??= consulta<{ column_name: string; data_type: string }>(sql,
    "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'pendientes'",
  ).then(r => {
    if (!r.length) throw Object.assign(new Error("sin_tabla"), { code: "42P01" });
    const tipos = new Map(r.map(x => [x.column_name, x.data_type]));
    return COLUMNAS_EXCEL.filter(c => tipos.has(c)).map(c => ({ nombre: c, tipo: tipos.get(c)! }));
  }).catch(e => { _cols = null; throw e; });
  return _cols;
}

export async function contarPendientes(z: ZonaPendientes) {
  const sql = conexion();
  if (!sql) throw new Error("sin_base");
  await columnas();   // si la tabla todavía no existe, falla igual que el listado (42P01)
  const { sql: where, params } = condiciones(z);
  return (await consulta<{ n: number }>(sql, `SELECT count(*)::int AS n FROM pendientes ${where}`, params))[0]?.n ?? 0;
}

/** Filas de la zona con todas las columnas del Excel y el barrio, circuito y línea oficial. Más de MAX_FILAS_EXCEL: no devuelve filas. */
export async function listarPendientes(z: ZonaPendientes) {
  const sql = conexion();
  if (!sql) throw new Error("sin_base");
  const cols = await columnas();
  const total = await contarPendientes(z);
  if (total > MAX_FILAS_EXCEL) return { total, columnas: cols, filas: [] as Record<string, Celda>[], excede: true };
  const { sql: where, params } = condiciones(z);
  const filas = await consulta<Record<string, Celda>>(sql,
    `SELECT ${cols.map(c => `"${c.nombre}"`).join(", ")} FROM pendientes ${where} ORDER BY id LIMIT ${MAX_FILAS_EXCEL}`, params);
  return { total, columnas: cols, filas, excede: false };
}
