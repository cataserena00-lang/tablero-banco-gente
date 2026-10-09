import { neon } from "@neondatabase/serverless";
import { COLUMNAS_TABLA, MAX_EXPORTACION } from "@/lib/personasComun";
import { CATEGORIAS, SIN_CLASIFICAR, categoriaDe, esCategoria, estadoOficial, grafiasDe, todasLasGrafias } from "@/lib/estados";
import { GRAFIAS_LINEA, LINEAS, LINEA_OTRAS, lineaCanonica } from "@/lib/formato";

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
  q?: string; departamento?: string; localidad?: string; categoria?: string; estado?: string; linea?: string; pagina?: number;
}
export type Fila = Record<string, string | number | null>;

// Columnas de personas_resumen que se pueden listar y exportar (nombres fijos: nunca vienen del navegador sin validar)
export const COLUMNAS_RESUMEN = ["nombre", "cuil", "nro_doc", "departamento", "localidad", "categoria", "estado", "linea", "nro_formulario", "ano", "mes", "solicitudes"];
// "categoria" no es una columna de la base: se calcula a partir del estado (ver lib/estados.ts)
const COLUMNAS_SQL = COLUMNAS_RESUMEN.filter(c => c !== "categoria");

const sinTildesTxt = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "");

/** La línea se muestra siempre con su nombre oficial (L2 = Libre disponibilidad, L4 = Iniciar emprendimiento, PE = Potenciar emprendimiento). */
function presentar<T extends Fila>(fila: T): T {
  const linea = fila.linea;
  return typeof linea === "string" ? { ...fila, linea: lineaCanonica(linea) ?? linea } : fila;
}

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
  for (const c of ["departamento", "localidad"] as const) {
    const v = f[c]?.trim();
    if (v) where.push(`"${c}" = ${p(v)}`);   // el nombre de columna sale de una lista fija
  }
  // Categoría de estado (grupo de estados) y, opcionalmente, un estado puntual
  const cat = f.categoria?.trim();
  if (cat && esCategoria(cat)) {
    where.push(cat === SIN_CLASIFICAR
      ? `("estado" IS NULL OR NOT ("estado" = ANY(${p(todasLasGrafias())}::text[])))`
      : `"estado" = ANY(${p(grafiasDe(cat))}::text[])`);
  }
  const est = f.estado?.trim();
  if (est) where.push(`"estado" = ANY(${p([...new Set([est, sinTildesTxt(est)])])}::text[])`);
  // Línea: se filtra por el nombre oficial (agrupa sus grafías); "Otras líneas" es todo lo que no es una de las tres
  const lin = f.linea?.trim();
  if (lin) {
    const todas = Object.values(GRAFIAS_LINEA).flat();
    if (lin === LINEA_OTRAS) where.push(`("linea" IS NULL OR NOT ("linea" = ANY(${p(todas)}::text[])))`);
    else where.push(`"linea" = ANY(${p(GRAFIAS_LINEA[lineaCanonica(lin) ?? ""] ?? [lin])}::text[])`);
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
  return { filas: filas.map(presentar), total: total[0]?.n ?? 0, solicitudes: total[0]?.s ?? 0, pagina, porPagina: POR_PAGINA, columnas: COLUMNAS_TABLA };
}

/** Valores para los filtros. Las localidades dependen del departamento elegido. Los estados se agrupan en categorías
    (con el detalle de cada una); las líneas se ofrecen con su nombre oficial. */
export async function facetas(departamento?: string) {
  const sql = conexion();
  if (!sql) throw new Error("sin_base");
  const distintos = async (c: "departamento" | "localidad" | "estado" | "linea", dep?: string) =>
    (await consulta<{ v: string }>(sql,
      `SELECT DISTINCT "${c}" AS v FROM personas_resumen WHERE "${c}" IS NOT NULL ${dep ? "AND departamento = $1" : ""} ORDER BY 1`,
      dep ? [dep] : [])).map(r => r.v);
  const [departamentos, localidades, estadosCrudos, lineasCrudas] = await Promise.all([
    distintos("departamento"), departamento ? distintos("localidad", departamento) : Promise.resolve([] as string[]),
    distintos("estado"), distintos("linea"),
  ]);
  const estadosPorCategoria: Record<string, string[]> = {};
  for (const e of new Set(estadosCrudos.map(estadoOficial))) (estadosPorCategoria[categoriaDe(e)] ??= []).push(e);
  const categorias = [...CATEGORIAS, SIN_CLASIFICAR].filter(c => estadosPorCategoria[c]?.length);
  const presentes = new Set(lineasCrudas.map(l => lineaCanonica(l) ?? LINEA_OTRAS));
  const lineas = [...LINEAS, LINEA_OTRAS].filter(l => presentes.has(l));
  return { departamentos, localidades, categorias, estadosPorCategoria, estados: [...new Set(estadosCrudos.map(estadoOficial))], lineas, columnas: COLUMNAS_RESUMEN };
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
  return { persona: { ...presentar(datos as Fila), categoria: categoriaDe(datos.estado as string | null) }, solicitudes: solicitudes.map(presentar) };
}

/** Personas que cumplen los filtros, con las columnas pedidas (solo las permitidas), para el PDF.
    Si superan MAX_EXPORTACION no devuelve filas: el llamador pide acotar los filtros. */
export async function exportarPersonas(f: Filtros, columnas: string[]) {
  const sql = conexion();
  if (!sql) throw new Error("sin_base");
  const elegidas = [...new Set(columnas)].filter(c => COLUMNAS_RESUMEN.includes(c));
  const deBase = elegidas.filter(c => COLUMNAS_SQL.includes(c));
  if (elegidas.includes("categoria") && !deBase.includes("estado")) deBase.push("estado");   // la categoría se calcula con el estado
  if (!elegidas.length) throw new Error("sin_columnas");
  const { sql: where, params } = condiciones(f);
  const total = (await consulta<{ n: number }>(sql, `SELECT count(*)::int AS n FROM personas_resumen ${where}`, params))[0]?.n ?? 0;
  if (total > MAX_EXPORTACION) return { total, columnas: elegidas, filas: [] as Fila[], excede: true };
  const filas = (await consulta<Fila>(sql,
    `SELECT ${deBase.map(c => `"${c}"`).join(", ")} FROM personas_resumen ${where} ORDER BY nombre NULLS LAST, id LIMIT ${MAX_EXPORTACION}`,
    params)).map(f => presentar(elegidas.includes("categoria") ? { ...f, categoria: categoriaDe(f.estado as string | null) } : f));
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
