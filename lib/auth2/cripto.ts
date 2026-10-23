import { createCipheriv, createDecipheriv, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

/* Contraseñas (scrypt) y cifrado de secretos (AES-256-GCM). Solo Node: no se usa en el middleware. */

const N = 2 ** 17, R = 8, P = 1, LARGO = 32, MAXMEM = 256 * 1024 * 1024;
const scryptP = (clave: string, sal: Buffer, n: number, r: number, p: number) =>
  new Promise<Buffer>((ok, mal) => scrypt(clave.normalize("NFKC"), sal, LARGO, { N: n, r, p, maxmem: MAXMEM }, (e, k) => (e ? mal(e) : ok(k))));

/** "scrypt$N$r$p$sal$hash" (base64). */
export async function hashClave(clave: string): Promise<string> {
  const sal = randomBytes(16);
  const h = await scryptP(clave, sal, N, R, P);
  return `scrypt$${N}$${R}$${P}$${sal.toString("base64")}$${h.toString("base64")}`;
}
export async function verificarClave(clave: string, guardado: string): Promise<boolean> {
  const [alg, n, r, p, sal, hash] = guardado.split("$");
  if (alg !== "scrypt" || !sal || !hash) return false;
  const esperado = Buffer.from(hash, "base64");
  const h = await scryptP(clave, Buffer.from(sal, "base64"), +n, +r, +p);
  return h.length === esperado.length && timingSafeEqual(h, esperado);
}
/** Hash de relleno: se verifica contra él cuando el usuario no existe, para que tarde lo mismo. */
let relleno: Promise<string> | null = null;
export const gastarTiempo = async (clave: string) => { relleno ??= hashClave("relleno-sin-usuario"); await verificarClave(clave, await relleno); };

// ── Cifrado de secretos (el secreto del autenticador de cada usuario) ──
function clave(): Buffer {
  const b64 = process.env.CLAVE_CIFRADO;
  if (!b64) throw new Error("Falta CLAVE_CIFRADO");
  const k = Buffer.from(b64, "base64");
  if (k.length !== 32) throw new Error("CLAVE_CIFRADO tiene que ser de 32 bytes (base64)");
  return k;
}
const b64u = (b: Buffer) => b.toString("base64url");
export function cifrar(texto: string): string {
  const iv = randomBytes(12), c = createCipheriv("aes-256-gcm", clave(), iv);
  const ct = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  return `v1.${b64u(iv)}.${b64u(c.getAuthTag())}.${b64u(ct)}`;
}
export function descifrar(guardado: string): string {
  const [v, iv, tag, ct] = guardado.split(".");
  if (v !== "v1" || !iv || !tag || !ct) throw new Error("Formato de secreto desconocido");
  const d = createDecipheriv("aes-256-gcm", clave(), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]).toString("utf8");
}
