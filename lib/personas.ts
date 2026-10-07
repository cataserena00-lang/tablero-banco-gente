import { neon } from "@neondatabase/serverless";
import { MAX_EXPORTACION } from "@/lib/personasComun";

/* Acceso a la base de PERSONAS (datos nominales) en Neon. Solo se importa desde el servidor
   (rutas /api y componentes de servidor), siempre después de exigirRol("completo").
   La conexión es la del rol "lectura": solo puede leer `personas` e insertar en `accesos`. */

export const POR_PAGINA = 50;
const MAX_PAGINA = 2000;

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

// Consulta parametrizada (los valores van como $1, $2... nunca pegados al texto) con filas tipadas
const consulta = async <T>(sql: Sql, texto: string, params: unknown[] = []) => (await sql.query(texto, params)) as unknown as T[];

export interface Filtros {
  q?: string; departamento?: string; localidad?: string; estado?: string; linea?: string; pagina?: number;
}
type Fila = Record<string, string | number | null>;

// Columnas de la tabla (las arma el cargador a partir del CSV) y las que se muestran en el listado
let _columnas: Promise<string[]> | null = null;
async function columnasTabla(sql: Sql): Promise<string[]> {
  _columnas ??= consulta<{ column_name: string }>(sql,
    "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'personas' ORDER BY ordinal_position",
  ).then(r => r.map(x => x.column_name)).catch(e => { _columnas = null; throw e; });
  return _columnas;
}
const LISTADO = ["nombre", "cuil", "nro_doc", "departamento", "localidad", "estado", "linea"];

const sinTildes = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "");

/** Palabras del buscador: sin tildes, en mayúsculas; si parece un CUIL/DNI con puntos o guiones, solo dígitos. */
export function tokensBusqueda(q: string | undefined): string[] {
  return sinTildes(q ?? "").toUpperCase().split(/\s+/).filter(Boolean)
    .map(t => /^[\d.\-/]+$/.test(t) ? t.replace(/\D/g, "") : t)
    .filter(t => t.length >= 2).slice(0, 6);
}
const escaparLike = (t: string) => t.replace(/[\\%_]/g, c => "\\" + c);

export function condiciones(f: Filtros, cols: string[]) {
  const where: string[] = [], params: unknown[] = [];
  const p = (v: unknown) => { params.push(v); return `$${params.length}`; };
  for (const c of ["departamento", "localidad", "estado", "linea"] as const) {
    const v = f[c]?.trim();
    if (v && cols.includes(c)) where.push(`"${c}" = ${p(v)}`);   // el nombre de columna sale de una lista fija
  }
  for (const t of tokensBusqueda(f.q)) where.push(`busqueda LIKE ${p("%" + escaparLike(t) + "%")} ESCAPE '\\'`);
  return { sql: where.length ? "WHERE " + where.join(" AND ") : "", params };
}

export async function buscarPersonas(f: Filtros) {
  const sql = conexion();
  if (!sql) throw new Error("sin_base");
  const cols = await columnasTabla(sql);
  const mostrar = ["id", ...LISTADO.filter(c => cols.includes(c))];
  const pagina = Math.min(Math.max(1, Math.floor(f.pagina || 1)), MAX_PAGINA);
  const { sql: where, params } = condiciones(f, cols);
  const [filas, total] = await Promise.all([
    consulta<Fila>(sql,
      `SELECT ${mostrar.map(c => `"${c}"`).join(", ")} FROM personas ${where} ORDER BY nombre NULLS LAST, id LIMIT ${POR_PAGINA} OFFSET ${(pagina - 1) * POR_PAGINA}`,
      params),
    consulta<{ n: number }>(sql, `SELECT count(*)::int AS n FROM personas ${where}`, params),
  ]);
  return { filas, total: total[0]?.n ?? 0, pagina, porPagina: POR_PAGINA, columnas: mostrar.filter(c => c !== "id") };
}

/** Valores para los filtros. Las localidades dependen del departamento elegido. */
export async function facetas(departamento?: string) {
  const sql = conexion();
  if (!sql) throw new Error("sin_base");
  const cols = await columnasTabla(sql);
  const distintos = async (c: string, dep?: string) => cols.includes(c)
    ? (await consulta<{ v: string }>(sql,
        `SELECT DISTINCT "${c}" AS v FROM personas WHERE "${c}" IS NOT NULL ${dep ? `AND departamento = $1` : ""} ORDER BY 1`,
        dep ? [dep] : [])).map(r => r.v)
    : [];
  const [departamentos, localidades, estados, lineas] = await Promise.all([
    distintos("departamento"), departamento ? distintos("localidad", departamento) : Promise.resolve([] as string[]),
    distintos("estado"), distintos("linea"),
  ]);
  return { departamentos, localidades, estados, lineas, columnas: cols.filter(c => c !== "id" && c !== "busqueda") };
}

/** Personas que cumplen los filtros, con las columnas pedidas (solo las que existen), para el PDF.
    Si superan MAX_EXPORTACION no devuelve filas: el llamador pide acotar los filtros. */
export async function exportarPersonas(f: Filtros, columnas: string[]) {
  const sql = conexion();
  if (!sql) throw new Error("sin_base");
  const cols = await columnasTabla(sql);
  const elegidas = [...new Set(columnas)].filter(c => c !== "id" && c !== "busqueda" && cols.includes(c));
  if (!elegidas.length) throw new Error("sin_columnas");
  const { sql: where, params } = condiciones(f, cols);
  const total = (await consulta<{ n: number }>(sql, `SELECT count(*)::int AS n FROM personas ${where}`, params))[0]?.n ?? 0;
  if (total > MAX_EXPORTACION) return { total, columnas: elegidas, filas: [] as Fila[], excede: true };
  const filas = await consulta<Fila>(sql,
    `SELECT ${elegidas.map(c => `"${c}"`).join(", ")} FROM personas ${where} ORDER BY nombre NULLS LAST, id LIMIT ${MAX_EXPORTACION}`,
    params);
  return { total, columnas: elegidas, filas, excede: false };
}

/** Ficha completa de una persona (todas las columnas del CSV). */
export async function ficha(id: number) {
  const sql = conexion();
  if (!sql) throw new Error("sin_base");
  const cols = (await columnasTabla(sql)).filter(c => c !== "busqueda");
  const r = await consulta<Fila>(sql, `SELECT ${cols.map(c => `"${c}"`).join(", ")} FROM personas WHERE id = $1`, [id]);
  return r[0] ?? null;
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
