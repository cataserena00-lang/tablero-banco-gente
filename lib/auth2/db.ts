import { neon } from "@neondatabase/serverless";

/* Conexión de la base de usuarios y sesiones: el rol `app_auth` (DATABASE_URL_AUTH). Solo puede tocar las tablas de acceso
   (usuarios, sesiones, dispositivos, códigos, intentos) e insertar en `accesos`; no puede crear ni borrar tablas.
   Funciona en Edge (el middleware valida la sesión) y en Node: usa el driver HTTP de Neon. */

export type Consulta = <T = Record<string, unknown>>(texto: string, params?: unknown[]) => Promise<T[]>;

// Para pruebas y desarrollo local (nunca en Vercel): una base en memoria que se inyecta con globalThis.__authConsultaLocal
// (ver instrumentation.ts y lib/auth2/dbLocal.ts); así se comparte entre todos los paquetes del servidor.
const g = globalThis as unknown as { __authConsultaLocal?: Consulta };
export function usarConsulta(c: Consulta | null) { if (c) g.__authConsultaLocal = c; else delete g.__authConsultaLocal; }
/** En el desarrollo local con base en memoria, el middleware (Edge) no puede consultarla: se conforma con ver la cookie. */
export const modoLocalSinBase = () => !!process.env.AUTH_PGLITE_DIR && !process.env.VERCEL;

let _sql: ReturnType<typeof neon> | null | undefined;

export const authConfigurada = () => !!(g.__authConsultaLocal || process.env.DATABASE_URL_AUTH);

export const consulta: Consulta = async <T,>(texto: string, params: unknown[] = []) => {
  if (g.__authConsultaLocal) return g.__authConsultaLocal<T>(texto, params);
  const url = process.env.DATABASE_URL_AUTH;
  if (!url) throw new Error("Falta DATABASE_URL_AUTH");
  _sql ??= neon(url);
  return (await _sql.query(texto, params)) as unknown as T[];
};
