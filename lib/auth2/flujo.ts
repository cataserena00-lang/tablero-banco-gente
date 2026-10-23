import { createHash, randomBytes } from "node:crypto";
import { normalizarUsuario as normalizarLegacy, nombreDe, verificarCredenciales, type Rol } from "../auth";
import { programasDe } from "../programas";
import { USUARIOS_DADOS_DE_BAJA, MAX_ERRORES_CODIGO, VENTANA_ERRORES_CODIGO_MS } from "./config";
import { cifrar, descifrar, gastarTiempo, hashClave, verificarClave } from "./cripto";
import { base32, secretoNuevo, verificarCodigo } from "./totp";
import {
  anotarErrorCodigo, buscarPorUsuario, confirmarTotp, crearUsuario, erroresRecientes, guardarCodigos, guardarSecreto, limpiarErroresCodigo,
  normalizarUsuario, registrarPaso, usarCodigo, type Usuario,
} from "./usuarios";

/* Pasos del ingreso: clave → (cambiar la clave inicial) → (alta del autenticador) → código del autenticador. */

export type PasoLogin = "/login/cambiar-clave" | "/login/configurar" | "/login/verificar";
export const proximoPaso = (u: Pick<Usuario, "debe_cambiar_clave" | "totp_confirmado">): PasoLogin =>
  u.debe_cambiar_clave ? "/login/cambiar-clave" : !u.totp_confirmado ? "/login/configurar" : "/login/verificar";

/** Verifica usuario y clave. Si el usuario todavía no está en la base pero sí en las variables de Vercel, se migra en este momento
 *  (con la misma clave, que tendrá que cambiar). Devuelve el usuario o null (siempre tarda parecido, exista o no). */
export async function verificarUsuarioYClave(usuarioTipeado: string, clave: string): Promise<Usuario | null> {
  const u = normalizarUsuario(usuarioTipeado);
  if (!u || u.length > 80 || !clave || clave.length > 200) { await gastarTiempo(clave || "x"); return null; }
  const existente = await buscarPorUsuario(u);
  if (existente) {
    if (!existente.activo) { await gastarTiempo(clave); return null; }
    return (await verificarClave(clave, existente.clave_hash)) ? existente : null;
  }
  if (USUARIOS_DADOS_DE_BAJA.has(u)) { await gastarTiempo(clave); return null; }
  // Migración desde las variables de Vercel (usuarios y claves del acceso anterior)
  for (const variante of new Set([normalizarLegacy(usuarioTipeado), u])) {
    const env = await verificarCredenciales(variante, clave).catch(() => null);
    if (!env) continue;
    const creado = await crearUsuario({
      usuario: u, nombre: nombreDe(variante), rol: env.rol as Rol, programas: programasDe(variante, env.rol as Rol),
      claveHash: await hashClave(clave), debeCambiar: true, origen: "vercel",
    });
    return creado ?? (await buscarPorUsuario(u));   // si dos pedidos migran a la vez, queda el primero
  }
  await gastarTiempo(clave);
  return null;
}

// ── Códigos de recuperación ──
const ALFA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ23456789";
export const normalizarCodigoRecuperacion = (c: string) => c.toUpperCase().replace(/[^A-Z0-9]/g, "");
const hashCodigo = (c: string) => createHash("sha256").update("recuperacion:" + normalizarCodigoRecuperacion(c)).digest("hex");
export function codigosNuevos(n = 10): string[] {
  return Array.from({ length: n }, () => {
    const b = randomBytes(10); let s = ""; for (const x of b) s += ALFA[x % ALFA.length];
    return `${s.slice(0, 5)}-${s.slice(5)}`;
  });
}
export const guardarCodigosNuevos = async (usuarioId: number, codigos: string[]) => guardarCodigos(usuarioId, codigos.map(hashCodigo));

// ── Alta del autenticador ──
/** Secreto del autenticador del usuario (en base32) para mostrar el QR; si todavía no tiene, se crea y se guarda cifrado. */
export async function secretoParaAlta(u: Usuario): Promise<string> {
  if (u.totp_secreto && !u.totp_confirmado) return descifrar(u.totp_secreto);
  const s = secretoNuevo();
  await guardarSecreto(u.id, cifrar(s));
  return s;
}
/** Confirma el alta con el primer código. Devuelve los códigos de recuperación (se muestran una sola vez) o null si el código no sirve. */
export async function confirmarAlta(u: Usuario, codigo: string): Promise<string[] | null> {
  if (!u.totp_secreto || u.totp_confirmado) return null;
  if ((await erroresRecientes(u.id, VENTANA_ERRORES_CODIGO_MS)) >= MAX_ERRORES_CODIGO) return null;
  const paso = verificarCodigo(descifrar(u.totp_secreto), codigo, null);
  if (paso === null) { await anotarErrorCodigo(u.id); return null; }
  await confirmarTotp(u.id, paso);
  await limpiarErroresCodigo(u.id);
  const codigos = codigosNuevos();
  await guardarCodigosNuevos(u.id, codigos);
  return codigos;
}

// ── Verificación en cada ingreso ──
export type ResultadoCodigo = "ok" | "recuperacion" | "incorrecto" | "bloqueado";
export async function verificarSegundoFactor(u: Usuario, entrada: string): Promise<ResultadoCodigo> {
  if ((await erroresRecientes(u.id, VENTANA_ERRORES_CODIGO_MS)) >= MAX_ERRORES_CODIGO) return "bloqueado";
  const limpio = entrada.replace(/\s/g, "");
  if (u.totp_secreto && /^\d{6}$/.test(limpio)) {
    const paso = verificarCodigo(descifrar(u.totp_secreto), limpio, u.totp_ultimo_paso);
    if (paso !== null) { await registrarPaso(u.id, paso); await limpiarErroresCodigo(u.id); return "ok"; }
  } else if (normalizarCodigoRecuperacion(limpio).length === 10 && await usarCodigo(u.id, hashCodigo(limpio))) {
    await limpiarErroresCodigo(u.id);
    return "recuperacion";
  }
  await anotarErrorCodigo(u.id);
  return "incorrecto";
}

/** Para el panel y la pantalla de cuenta: el secreto formateado en grupos de 4. */
export const secretoLegible = (s: string) => s.match(/.{1,4}/g)?.join(" ") ?? s;
export { base32 };
