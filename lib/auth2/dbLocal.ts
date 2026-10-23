import { readFileSync } from "node:fs";
import { join } from "node:path";
import { usarConsulta, type Consulta } from "./db";

/* Base Postgres en memoria (PGlite) para probar el acceso v2 sin tocar Neon: pruebas automáticas y desarrollo local.
   Se carga solo con AUTH_PGLITE_DIR (nunca en Vercel). */
export async function iniciarBaseLocal(dir: string = "memoria") {
  const modulo = "@electric-sql/pglite";
  const { PGlite } = await import(/* webpackIgnore: true */ modulo);
  const db = new PGlite(dir === "memoria" ? undefined : dir);
  await db.exec(readFileSync(join(process.cwd(), "lib/auth2/esquema.sql"), "utf8"));
  const c = (async (texto: string, params: unknown[] = []) => (await db.query(texto, params)).rows) as Consulta;
  usarConsulta(c);
  return { consulta: c, cerrar: () => db.close() };
}
