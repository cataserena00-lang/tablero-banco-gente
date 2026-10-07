// Funciona en Edge (middleware) y Node: solo usa Web Crypto.
const enc = new TextEncoder();
export const COOKIE = "sesion";
const DURACION_MS = 1000 * 60 * 60 * 12; // 12 h

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");

async function hmac(msg: string, secret: string) {
  const k = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", k, enc.encode(msg)));
}
function igual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
const secreto = () => { const s = process.env.AUTH_SECRET; if (!s) throw new Error("Falta AUTH_SECRET"); return s; };

const bytes = (h: string) => new Uint8Array((h.match(/../g) ?? []).map(x => parseInt(x, 16)));

// Hash independiente de AUTH_SECRET: "pbkdf2.<iteraciones>.<sal hex>.<hash hex>" (PBKDF2-SHA256, 256 bits).
// Se usa "." y no "$" como separador (el "$" se interpreta como variable en shells y archivos .env);
// por compatibilidad también se acepta "pbkdf2$<iteraciones>$<sal>$<hash>".
async function pbkdf2(clave: string, saltHex: string, iteraciones: number) {
  const k = await crypto.subtle.importKey("raw", enc.encode(clave), "PBKDF2", false, ["deriveBits"]);
  return hex(await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: bytes(saltHex), iterations: iteraciones }, k, 256));
}

const formatoDe = (g: string) => /^pbkdf2[.$]/.test(g) ? "pbkdf2" : /^[0-9a-f]{64}$/.test(g) ? "hmac" : "desconocido";

async function coincide(guardado: string, clave: string, hmacClave: string) {
  if (formatoDe(guardado) === "pbkdf2") {
    const [, iter, sal, hash] = guardado.split(/[.$]/);
    const n = Number(iter);
    if (!sal || !hash || !Number.isInteger(n) || n < 1 || n > 1_000_000) return false;
    return igual(hash, await pbkdf2(clave, sal, n));
  }
  return igual(guardado, hmacClave);   // formato original: HMAC-SHA256(clave) con AUTH_SECRET
}

// DASHBOARD_USERS = "usuario:hash,otro:hash" (formato original, hash con AUTH_SECRET).
// DASHBOARD_USERS_EXTRA = más usuarios en el mismo formato; acepta además hashes pbkdf2$... (ver scripts/hash-password.mjs).
export async function verificarCredenciales(usuario: string, clave: string) {
  const lista = [process.env.DASHBOARD_USERS, process.env.DASHBOARD_USERS_EXTRA]
    .flatMap(v => (v ?? "").split(",")).map(x => x.trim()).filter(Boolean);
  const hmacClave = await hmac(clave, secreto());
  let ok = false;
  const candidatos: string[] = [];   // formato de las entradas que tienen ese usuario (para diagnosticar)
  for (const par of lista) {
    const i = par.indexOf(":");
    if (i < 0 || par.slice(0, i) !== usuario) continue;
    candidatos.push(formatoDe(par.slice(i + 1)));
    if (await coincide(par.slice(i + 1), clave, hmacClave)) ok = true;
  }
  // Solo metadatos: nunca la clave ni los hashes
  if (!ok) console.warn("login fallido", { usuario, entradasConfiguradas: lista.length, formatosDelUsuario: candidatos });
  return ok;
}
export async function crearSesion(usuario: string) {
  const cuerpo = `${encodeURIComponent(usuario)}.${Date.now() + DURACION_MS}`;
  return `${cuerpo}.${await hmac(cuerpo, secreto())}`;
}
export async function sesionValida(token?: string) {
  if (!token) return false;
  const partes = token.split(".");
  if (partes.length !== 3) return false;
  const [u, exp, firma] = partes;
  if (!igual(firma, await hmac(`${u}.${exp}`, secreto()))) return false;
  return Number(exp) > Date.now();
}
export const SESION_SEGUNDOS = DURACION_MS / 1000;
