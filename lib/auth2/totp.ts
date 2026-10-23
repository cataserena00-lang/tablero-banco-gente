import { createHmac, randomBytes } from "node:crypto";

/* Código del autenticador (TOTP, RFC 6238: SHA-1, 6 dígitos, 30 segundos): sirve Google Authenticator, Microsoft Authenticator, Authy, 1Password... */

const ALFABETO = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const PASO_S = 30;

export function base32(bytes: Buffer): string {
  let bits = 0, valor = 0, s = "";
  for (const b of bytes) { valor = (valor << 8) | b; bits += 8; while (bits >= 5) { s += ALFABETO[(valor >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) s += ALFABETO[(valor << (5 - bits)) & 31];
  return s;
}
export function desdeBase32(s: string): Buffer {
  let bits = 0, valor = 0; const out: number[] = [];
  for (const ch of s.toUpperCase().replace(/[^A-Z2-7]/g, "")) { valor = (valor << 5) | ALFABETO.indexOf(ch); bits += 5; if (bits >= 8) { out.push((valor >>> (bits - 8)) & 255); bits -= 8; } }
  return Buffer.from(out);
}

export const secretoNuevo = () => base32(randomBytes(20));
export const pasoActual = (ahoraMs = Date.now()) => Math.floor(ahoraMs / 1000 / PASO_S);

export function codigoDelPaso(secretoB32: string, paso: number): string {
  const msg = Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(paso));
  const h = createHmac("sha1", desdeBase32(secretoB32)).update(msg).digest();
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1_000_000).padStart(6, "0");
}

/** Devuelve el paso aceptado si el código es válido (con ±1 paso de tolerancia por el reloj) y no se usó ya; si no, null. */
export function verificarCodigo(secretoB32: string, codigo: string, ultimoPaso: number | null, ahoraMs = Date.now()): number | null {
  const c = codigo.replace(/\s/g, "");
  if (!/^\d{6}$/.test(c)) return null;
  const actual = pasoActual(ahoraMs);
  for (const paso of [actual, actual - 1, actual + 1]) {
    if (ultimoPaso !== null && paso <= ultimoPaso) continue;           // un mismo código no se puede usar dos veces
    if (codigoDelPaso(secretoB32, paso) === c) return paso;
  }
  return null;
}

export function uriOtpauth(secretoB32: string, etiqueta: string, emisor: string): string {
  return `otpauth://totp/${encodeURIComponent(emisor)}:${encodeURIComponent(etiqueta)}?secret=${secretoB32}&issuer=${encodeURIComponent(emisor)}&algorithm=SHA1&digits=6&period=${PASO_S}`;
}
