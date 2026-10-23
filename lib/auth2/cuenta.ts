import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { COOKIE_SESION, modoV2 } from "./config";
import { leerSesionDb, type SesionDb } from "./sesiones";
import { origenValido } from "./origen";
import { tieneRol } from "../auth";

/** Sesión completa del acceso v2 (con el id del usuario). Null si no hay, no está completa o el acceso v2 no está activo. */
export async function sesionV2(): Promise<SesionDb | null> {
  if (!modoV2()) return null;
  const s = await leerSesionDb((await cookies()).get(COOKIE_SESION)?.value);
  return s && s.etapa === "completa" ? s : null;
}

const SIN_CACHE = { "Cache-Control": "no-store" };
export const json = (cuerpo: unknown, status = 200) => NextResponse.json(cuerpo, { status, headers: SIN_CACHE });

/** Para las rutas /api/cuenta y /api/admin: verifica sesión (y perfil admin si se pide) y, en pedidos que modifican, el origen. */
export async function guardia(req: Request, admin = false): Promise<{ s: SesionDb } | { error: NextResponse }> {
  const s = await sesionV2();
  if (!s) return { error: json({ error: "sesion" }, 401) };
  if (admin && !tieneRol(s.rol, "admin")) return { error: json({ error: "prohibido" }, 403) };
  if (req.method !== "GET" && !origenValido(req)) return { error: json({ error: "origen" }, 403) };
  return { s };
}
