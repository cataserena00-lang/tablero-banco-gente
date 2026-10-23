import { consulta } from "./db";
import { sha256Hex, tokenAleatorio } from "./hash";
import { ACTUALIZAR_ACTIVIDAD_MS, DISPOSITIVO_MS, DURACION_SESION_MS, INACTIVIDAD_MS, MAX_DISPOSITIVOS, PASO_PENDIENTE_MS } from "./config";
import type { Rol } from "../auth";
import type { Programa } from "../programas";

/* Sesiones en la base: la cookie lleva un token al azar y acá solo se guarda su hash. Se pueden cerrar desde el servidor
   (por usuario, por el propio usuario o por un admin) y vencen a las 12 h o a las 2 h sin actividad. */

export interface SesionDb { sesionId: string; usuarioId: number; usuario: string; rol: Rol; nombre: string | null; programas: Programa[]; etapa: "clave" | "completa" }

const recortar = (s: string | null | undefined) => (s ?? "").slice(0, 160) || null;

export async function crearSesion(usuarioId: number, etapa: "clave" | "completa", agente?: string | null) {
  const token = tokenAleatorio(), id = await sha256Hex(token);
  const ms = etapa === "clave" ? PASO_PENDIENTE_MS : DURACION_SESION_MS;
  await consulta("DELETE FROM sesiones WHERE expira < now() - interval '1 day'");   // limpieza de sesiones viejas
  await consulta("INSERT INTO sesiones (id, usuario_id, etapa, expira, agente) VALUES ($1, $2, $3, now() + ($4::bigint * interval '1 millisecond'), $5)",
    [id, usuarioId, etapa, ms, recortar(agente)]);
  return { token, maxAgeS: Math.round(ms / 1000) };
}

/** Pasa una sesión de «clave» a «completa» (ya se verificó el código) y le da la duración completa. */
export async function completarSesion(sesionId: string) {
  await consulta("UPDATE sesiones SET etapa = 'completa', expira = now() + ($2::bigint * interval '1 millisecond'), ultima_actividad = now() WHERE id = $1",
    [sesionId, DURACION_SESION_MS]);
}

const SELECT_SESION = `SELECT s.id AS sesion_id, s.usuario_id, s.etapa, s.ultima_actividad, u.usuario, u.rol, u.nombre, u.programas
  FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id
  WHERE s.id = $1 AND s.expira > now() AND u.activo
    AND (s.etapa = 'clave' OR s.ultima_actividad > now() - ($2::bigint * interval '1 millisecond'))`;

/** Lee la sesión de un token. Devuelve null si no existe, venció, está inactiva o el usuario se desactivó. `tocar`: registra la actividad. */
export async function leerSesionDb(token: string | undefined, tocar = true): Promise<SesionDb | null> {
  if (!token || token.length < 20 || token.length > 100) return null;
  const id = await sha256Hex(token);
  const r = (await consulta<Record<string, unknown>>(SELECT_SESION, [id, INACTIVIDAD_MS]))[0];
  if (!r) return null;
  if (tocar && r.etapa === "completa")
    await consulta("UPDATE sesiones SET ultima_actividad = now() WHERE id = $1 AND ultima_actividad < now() - ($2::bigint * interval '1 millisecond')", [id, ACTUALIZAR_ACTIVIDAD_MS]);
  return { sesionId: String(r.sesion_id), usuarioId: Number(r.usuario_id), usuario: String(r.usuario), rol: r.rol as Rol, nombre: (r.nombre as string | null) ?? null,
    programas: (r.programas as Programa[]) ?? ["bg"], etapa: r.etapa as "clave" | "completa" };
}

export const cerrarSesion = (sesionId: string) => consulta("DELETE FROM sesiones WHERE id = $1", [sesionId]);
export const cerrarSesionesDe = (usuarioId: number, exceptoId?: string) =>
  consulta("DELETE FROM sesiones WHERE usuario_id = $1 AND ($2::text IS NULL OR id <> $2)", [usuarioId, exceptoId ?? null]);

// ── Dispositivos de confianza (evitan solo el código del autenticador, nunca la contraseña) ──
export async function confiarEnDispositivo(usuarioId: number, agente?: string | null) {
  const token = tokenAleatorio(), hash = await sha256Hex(token);
  await consulta("DELETE FROM dispositivos_confiables WHERE usuario_id = $1 AND expira < now()", [usuarioId]);
  // máximo MAX_DISPOSITIVOS por usuario: si ya hay, se borra el más viejo
  await consulta(`DELETE FROM dispositivos_confiables WHERE id IN (SELECT id FROM dispositivos_confiables WHERE usuario_id = $1 ORDER BY creado DESC OFFSET $2)`,
    [usuarioId, MAX_DISPOSITIVOS - 1]);
  await consulta("INSERT INTO dispositivos_confiables (usuario_id, token_hash, expira, agente) VALUES ($1, $2, now() + ($3::bigint * interval '1 millisecond'), $4)",
    [usuarioId, hash, DISPOSITIVO_MS, recortar(agente)]);
  return { token, maxAgeS: Math.round(DISPOSITIVO_MS / 1000) };
}
export async function dispositivoValido(usuarioId: number, token: string | undefined) {
  if (!token || token.length < 20 || token.length > 100) return false;
  const r = await consulta("UPDATE dispositivos_confiables SET ultimo_uso = now() WHERE usuario_id = $1 AND token_hash = $2 AND expira > now() RETURNING id", [usuarioId, await sha256Hex(token)]);
  return r.length > 0;
}
export const listarDispositivos = (usuarioId: number) =>
  consulta<{ id: number; creado: string; ultimo_uso: string | null; expira: string; agente: string | null }>(
    "SELECT id::int AS id, creado, ultimo_uso, expira, agente FROM dispositivos_confiables WHERE usuario_id = $1 AND expira > now() ORDER BY creado DESC", [usuarioId]);
export const quitarDispositivo = (usuarioId: number, id: number) => consulta("DELETE FROM dispositivos_confiables WHERE usuario_id = $1 AND id = $2", [usuarioId, id]);
export const quitarDispositivos = (usuarioId: number) => consulta("DELETE FROM dispositivos_confiables WHERE usuario_id = $1", [usuarioId]);
