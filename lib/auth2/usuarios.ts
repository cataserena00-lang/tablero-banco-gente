import { consulta } from "./db";
import type { Rol } from "../auth";
import type { Programa } from "../programas";

export interface Usuario {
  id: number; usuario: string; nombre: string | null; rol: Rol; programas: Programa[]; clave_hash: string; debe_cambiar_clave: boolean;
  totp_secreto: string | null; totp_confirmado: boolean; totp_ultimo_paso: number | null; activo: boolean; origen: string; ultimo_ingreso: string | null;
}
const COLS = "id, usuario, nombre, rol, programas, clave_hash, debe_cambiar_clave, totp_secreto, totp_confirmado, totp_ultimo_paso::int8 AS totp_ultimo_paso, activo, origen, ultimo_ingreso";
const fila = (r: Record<string, unknown> | undefined): Usuario | null => r ? ({ ...r, id: Number(r.id), totp_ultimo_paso: r.totp_ultimo_paso === null ? null : Number(r.totp_ultimo_paso) } as Usuario) : null;

/** Usuario en minúsculas; si parece un CUIL (con guiones, puntos o espacios) se deja solo con dígitos. */
export function normalizarUsuario(u: string): string {
  const t = u.trim();
  return /^[\d.\-\s]+$/.test(t) && /\d/.test(t) ? t.replace(/\D/g, "") : t.toLowerCase();
}

export const buscarPorUsuario = async (usuario: string) => fila((await consulta(`SELECT ${COLS} FROM usuarios WHERE usuario = $1`, [usuario]))[0]);
export const buscarPorId = async (id: number) => fila((await consulta(`SELECT ${COLS} FROM usuarios WHERE id = $1`, [id]))[0]);

export async function crearUsuario(d: { usuario: string; nombre?: string | null; rol: Rol; programas: Programa[]; claveHash: string; debeCambiar?: boolean; origen: "panel" | "vercel"; activo?: boolean }) {
  const r = await consulta(
    `INSERT INTO usuarios (usuario, nombre, rol, programas, clave_hash, debe_cambiar_clave, origen, activo) VALUES ($1, $2, $3, $4::text[], $5, $6, $7, $8)
     ON CONFLICT (usuario) DO NOTHING RETURNING ${COLS}`,
    [d.usuario, d.nombre ?? null, d.rol, d.programas, d.claveHash, d.debeCambiar ?? true, d.origen, d.activo ?? true]);
  return fila(r[0]);
}

export async function listarUsuarios() {
  const r = await consulta<Record<string, unknown>>(
    `SELECT u.id, u.usuario, u.nombre, u.rol, u.programas, u.activo, u.origen, u.totp_confirmado, u.debe_cambiar_clave, u.creado, u.ultimo_ingreso,
            (SELECT count(*) FROM dispositivos_confiables d WHERE d.usuario_id = u.id AND d.expira > now())::int AS dispositivos,
            (SELECT count(*) FROM sesiones s WHERE s.usuario_id = u.id AND s.etapa = 'completa' AND s.expira > now())::int AS sesiones
     FROM usuarios u ORDER BY u.rol, u.nombre NULLS LAST, u.usuario`);
  return r;
}

export async function actualizarUsuario(id: number, c: { nombre?: string | null; rol?: Rol; programas?: Programa[]; activo?: boolean }) {
  const sets: string[] = [], params: unknown[] = [];
  const p = (v: unknown) => { params.push(v); return `$${params.length}`; };
  if (c.nombre !== undefined) sets.push(`nombre = ${p(c.nombre)}`);
  if (c.rol) sets.push(`rol = ${p(c.rol)}`);
  if (c.programas) sets.push(`programas = ${p(c.programas)}::text[]`);
  if (c.activo !== undefined) sets.push(`activo = ${p(c.activo)}`);
  if (!sets.length) return;
  params.push(id);
  await consulta(`UPDATE usuarios SET ${sets.join(", ")} WHERE id = $${params.length}`, params);
}

export async function nombresDe(usuarios: string[]): Promise<Record<string, string>> {
  if (!usuarios.length) return {};
  const r = await consulta<{ usuario: string; nombre: string | null }>("SELECT usuario, nombre FROM usuarios WHERE usuario = ANY($1::text[]) AND nombre IS NOT NULL", [usuarios]);
  return Object.fromEntries(r.map(x => [x.usuario, x.nombre!]));
}

// ── Segundo factor ──
export const guardarSecreto = (id: number, cifrado: string) =>
  consulta("UPDATE usuarios SET totp_secreto = $2, totp_confirmado = false, totp_ultimo_paso = NULL WHERE id = $1", [id, cifrado]);
export const confirmarTotp = (id: number, paso: number) =>
  consulta("UPDATE usuarios SET totp_confirmado = true, totp_ultimo_paso = $2 WHERE id = $1", [id, paso]);
export const registrarPaso = (id: number, paso: number) => consulta("UPDATE usuarios SET totp_ultimo_paso = $2 WHERE id = $1", [id, paso]);
export const resetear2fa = (id: number) => consulta("UPDATE usuarios SET totp_secreto = NULL, totp_confirmado = false, totp_ultimo_paso = NULL WHERE id = $1", [id]);

export const cambiarClave = (id: number, claveHash: string) =>
  consulta("UPDATE usuarios SET clave_hash = $2, debe_cambiar_clave = false, clave_cambiada = now() WHERE id = $1", [id, claveHash]);
export const marcarIngreso = (id: number) => consulta("UPDATE usuarios SET ultimo_ingreso = now() WHERE id = $1", [id]);

// ── Códigos de recuperación ──
export async function guardarCodigos(id: number, hashes: string[]) {
  await consulta("DELETE FROM codigos_recuperacion WHERE usuario_id = $1", [id]);
  for (const h of hashes) await consulta("INSERT INTO codigos_recuperacion (usuario_id, codigo_hash) VALUES ($1, $2)", [id, h]);
}
/** Marca un código de recuperación como usado. Devuelve true si existía y no se había usado. */
export async function usarCodigo(id: number, hash: string) {
  const r = await consulta("UPDATE codigos_recuperacion SET usado = now() WHERE usuario_id = $1 AND codigo_hash = $2 AND usado IS NULL RETURNING id", [id, hash]);
  return r.length > 0;
}
export const codigosRestantes = async (id: number) =>
  Number((await consulta<{ n: number }>("SELECT count(*)::int AS n FROM codigos_recuperacion WHERE usuario_id = $1 AND usado IS NULL", [id]))[0]?.n ?? 0);

// ── Freno al adivinar el código ──
export const anotarErrorCodigo = (id: number) => consulta("INSERT INTO intentos_2fa (usuario_id) VALUES ($1)", [id]);
export const limpiarErroresCodigo = (id: number) => consulta("DELETE FROM intentos_2fa WHERE usuario_id = $1", [id]);
export async function erroresRecientes(id: number, ventanaMs: number) {
  const r = await consulta<{ n: number }>("SELECT count(*)::int AS n FROM intentos_2fa WHERE usuario_id = $1 AND creado > now() - ($2::bigint * interval '1 millisecond')", [id, ventanaMs]);
  return Number(r[0]?.n ?? 0);
}
