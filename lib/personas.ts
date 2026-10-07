import { neon } from "@neondatabase/serverless";
import { COLUMNAS_TABLA, MAX_EXPORTACION } from "@/lib/personasComun";

/* Acceso a la base de PERSONAS (datos nominales) en Neon. Solo se importa desde el servidor
   (rutas /api y componentes de servidor), siempre después de exigirRol("completo").
   La conexión es la del rol "lectura": solo puede leer `personas` y `personas_resumen` e insertar en `accesos`.

   Cada fila del CSV de origen es una SOLICITUD (un Nro Formulario distinto), y una persona puede tener varias:
   - `personas_resumen`: una fila por persona, con los datos de su última solicitud y la cantidad de solicitudes.
   - `personas`: una fila por solicitud (todas las columnas del CSV), con la clave `persona` y el número `orden`.
   Los dos las arma pipelines/banco_gente/cargar_personas.py. Los filtros de estado y línea se aplican a la última solicitud. */

export const POR_PAGINA = 50;
const MAX_PAGINA = 2000;
const MAX_SOLICITUDES = 200;

type Sql = ReturnType<typeof neon>;
let _sql: Sql | null | undefined;
export function conexion(): Sql | null {
  if (_sql === undefined) {
    const url = process.env.DATABASE_URL_LECTURA;
    _sql = url ? neon(url) : null;
  }
  return _sql;
}
export const baseConfigurada = () => conexion() !== null;

/** La tabla todavía no existe (por ejemplo, hasta la primera carga después de este cambio): se avisa como "base no disponible". */
export const tablaFaltante = (e: unknown) => (e as { code?: string } | null)?.code === "42P01";

// Consulta parametrizada (los valores van como $1, $2... nunca pegados al texto) con filas tipadas
const consulta = async <T>(sql: Sql, texto: string, params: unknown[] = []) => (await sql.query(texto, params)) as unknown as T[];

export interface Filtros {
  q?: string; departamento?: string; localidad?: string; estado?: string; linea?: string; pagina?: number;
}
export type Fila = Record<string, string | number | null>;

// Columnas de personas_resumen que se pueden listar y exportar (nombres fijos: nunca vienen del navegador sin validar)
export const COLUMNAS_RESUMEN = ["nombre", "cuil", "nro_doc", "departamento", "localidad", "estado", "linea", "nro_formulario", "ano", "mes", "solicitudes"];

const sinTildes = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "");

/** Palabras del buscador: sin tildes, en mayúsculas; si parece un CUIL/DNI con puntos o guiones, solo dígitos. */
export function tokensBusqueda(q: string | undefined): string[] {
  return sinTildes(q ?? "").toUpperCase().split(/\s+/).filter(Boolean)
    .map(t => /^[\d.\-/]+$/.test(t) ? t.replace(/\D/g, "") : t)
    .filter(t => t.length >= 2).slice(0, 6);
}
const escaparLike = (t: string) => t.replace(/[\\%_]/g, c => "\\" + c);

export function condiciones(f: Filtros) {
  const where: string[] = [], params: unknown[] = [];
  const p = (v: unknown) => { params.push(v); return `$${params.length}`; };
  for (const c of ["departamento", "localidad", "estado", "linea"] as const) {
    const v = f[c]?.trim();
    if (v) where.push(`"${c}" = ${p(v)}`);   // el nombre de columna sale de una lista fija
  }
  for (const t of tokensBusqueda(f.q)) where.push(`busqueda LIKE ${p("%" + escaparLike(t) + "%")} ESCAPE '\\'`);
  return { sql: where.length ? "WHERE " + where.join(" AND ") : "", params };
}

/** Una página de personas (50), cada una con los datos de su última solicitud. */
export async function buscarPersonas(f: Filtros) {
  const sql = conexion();
  if (!sql) throw new Error("sin_base");
  const pagina = Math.min(Math.max(1, Math.floor(f.pagina || 1)), MAX_PAGINA);
  const { sql: where, params } = condiciones(f);
  const [filas, total] = await Promise.all([
    consulta<Fila>(sql,
      `SELECT id, nombre, cuil, nro_doc, departamento, localidad, estado, linea, ano, mes, solicitudes FROM personas_resumen ${where} ` +
      `ORDER BY nombre NULLS LAST, id LIMIT ${POR_PAGINA} OFFSET ${(pagina - 1) * POR_PAGINA}`, params),
    consulta<{ n: number; s: number }>(sql,
      `SELECT count(*)::int AS n, COALESCE(sum(solicitudes), 0)::int AS s FROM personas_resumen ${where}`, params),
  ]);
  return { filas, total: total[0]?.n ?? 0, solicitudes: total[0]?.s ?? 0, pagina, porPagina: POR_PAGINA, columnas: COLUMNAS_TABLA };
}

/** Valores para los filtros. Las localidades dependen del departamento elegido. */
export async function facetas(departamento?: string) {
  const sql = conexion();
  if (!sql) throw new Error("sin_base");
  const distintos = async (c: "departamento" | "localidad" | "estado" | "linea", dep?: string) =>
    (await consulta<{ v: string }>(sql,
      `SELECT DISTINCT "${c}" AS v FROM personas_resumen WHERE "${c}" IS NOT NULL ${dep ? "AND departamento = $1" : ""} ORDER BY 1`,
      dep ? [dep] : [])).map(r => r.v);
  const [departamentos, localidades, estados, lineas] = await Promise.all([
    distintos("departamento"), departamento ? distintos("localidad", departamento) : Promise.resolve([] as string[]),
    distintos("estado"), distintos("linea"),
  ]);
  return { departamentos, localidades, estados, lineas, columnas: COLUMNAS_RESUMEN };
}

// Columnas de una solicitud (todas las del CSV, menos las internas), leídas una vez
let _columnasSolicitud: Promise<string[]> | null = null;
async function columnasSolicitud(sql: Sql): Promise<string[]> {
  _columnasSolicitud ??= consulta<{ column_name: string }>(sql,
    "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'personas' ORDER BY ordinal_position",
  ).then(r => r.map(x => x.column_name).filter(c => !["id", "busqueda", "persona", "orden"].includes(c)))
    .catch(e => { _columnasSolicitud = null; throw e; });
  return _columnasSolicitud;
}

/** Una persona (datos de su última solicitud) y todas sus solicitudes, de la más nueva a la más vieja. `id` es el de personas_resumen. */
export async function detallePersona(id: number) {
  const sql = conexion();
  if (!sql) throw new Error("sin_base");
  const p = (await consulta<Fila & { persona: string }>(sql,
    "SELECT id, persona, nombre, cuil, nro_doc, departamento, localidad, estado, linea, nro_formulario, ano, mes, solicitudes FROM personas_resumen WHERE id = $1",
    [id]))[0];
  if (!p) return null;
  const cols = await columnasSolicitud(sql);
  if (!cols.length) throw new Error("sin_columnas");
  const solicitudes = await consulta<Fila>(sql,
    `SELECT ${cols.map(c => `"${c}"`).join(", ")} FROM personas WHERE persona = $1 ORDER BY orden DESC, id DESC LIMIT ${MAX_SOLICITUDES}`,
    [p.persona]);
  const { persona: _clave, ...datos } = p;   // la clave interna no sale del servidor
  return { persona: datos as Fila, solicitudes };
}

/** Personas que cumplen los filtros, con las columnas pedidas (solo las permitidas), para el PDF.
    Si superan MAX_EXPORTACION no devuelve filas: el llamador pide acotar los filtros. */
export async function exportarPersonas(f: Filtros, columnas: string[]) {
  const sql = conexion();
  if (!sql) throw new Error("sin_base");
  const elegidas = [...new Set(columnas)].filter(c => COLUMNAS_RESUMEN.includes(c));
  if (!elegidas.length) throw new Error("sin_columnas");
  const { sql: where, params } = condiciones(f);
  const total = (await consulta<{ n: number }>(sql, `SELECT count(*)::int AS n FROM personas_resumen ${where}`, params))[0]?.n ?? 0;
  if (total > MAX_EXPORTACION) return { total, columnas: elegidas, filas: [] as Fila[], excede: true };
  const filas = await consulta<Fila>(sql,
    `SELECT ${elegidas.map(c => `"${c}"`).join(", ")} FROM personas_resumen ${where} ORDER BY nombre NULLS LAST, id LIMIT ${MAX_EXPORTACION}`,
    params);
  return { total, columnas: elegidas, filas, excede: false };
}

/** Deja constancia de quién consultó qué. Si falla no interrumpe la consulta, y nunca se imprime el contenido. */
export async function registrarAcceso(usuario: string, rol: string, accion: "busqueda" | "ficha" | "exportacion", detalle: unknown, resultados?: number) {
  try {
    const sql = conexion();
    if (!sql) return;
    await consulta(sql, "INSERT INTO accesos (usuario, rol, accion, detalle, resultados) VALUES ($1, $2, $3, $4::jsonb, $5)",
      [usuario, rol, accion, JSON.stringify(detalle ?? null), resultados ?? null]);
  } catch (e) {
    console.error("No se pudo registrar el acceso", (e as Error)?.name);
  }
}
