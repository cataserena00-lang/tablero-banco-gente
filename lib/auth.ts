// Funciona en Edge (middleware) y Node: solo usa Web Crypto.
const enc = new TextEncoder();
export const COOKIE = "sesion";

// Perfiles: "completo" (todo, incluida la vista nominal cuando exista) y "agregado" (solo datos agregados).
// Sin rol explícito (o con uno desconocido) se asigna "agregado": el mínimo privilegio es el valor por defecto.
export type Rol = "completo" | "agregado";
export const ROL_POR_DEFECTO: Rol = "agregado";
const aRol = (v?: string): Rol => v === "completo" ? "completo" : ROL_POR_DEFECTO;
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
// DASHBOARD_USERS_EXTRA = más usuarios en el mismo formato; acepta además hashes pbkdf2.… (ver scripts/hash-password.mjs).
// Cada entrada puede terminar en "|completo" o "|agregado" (ej.: "ana:pbkdf2.100000.sal.hash|completo").
// Devuelve el rol del usuario si usuario y clave son correctos, o null.
export async function verificarCredenciales(usuario: string, clave: string): Promise<{ rol: Rol } | null> {
  const lista = [process.env.DASHBOARD_USERS, process.env.DASHBOARD_USERS_EXTRA]
    .flatMap(v => (v ?? "").split(",")).map(x => x.trim()).filter(Boolean);
  const hmacClave = await hmac(clave, secreto());
  let rol: Rol | null = null;
  const candidatos: string[] = [];   // formato de las entradas que tienen ese usuario (para diagnosticar)
  for (const par of lista) {
    const i = par.indexOf(":");
    if (i < 0 || par.slice(0, i) !== usuario) continue;
    const [guardado, rolTxt] = par.slice(i + 1).split("|");
    candidatos.push(formatoDe(guardado));
    if (await coincide(guardado, clave, hmacClave)) {
      const r = aRol(rolTxt);
      if (rol !== "completo") rol = r;   // si hay dos entradas válidas, vale el perfil completo solo si alguna lo declara
    }
  }
  // Solo metadatos: nunca la clave ni los hashes
  if (!rol) console.warn("login fallido", { usuario, entradasConfiguradas: lista.length, formatosDelUsuario: candidatos });
  return rol ? { rol } : null;
}
// Token de sesión: "<usuario>.<rol>.<expira>.<firma>" (firmado con AUTH_SECRET: el rol no se puede alterar).
// Los tokens anteriores, "<usuario>.<expira>.<firma>", siguen siendo válidos y valen como rol "agregado".
export async function crearSesion(usuario: string, rol: Rol = ROL_POR_DEFECTO) {
  const cuerpo = `${encodeURIComponent(usuario)}.${rol}.${Date.now() + DURACION_MS}`;
  return `${cuerpo}.${await hmac(cuerpo, secreto())}`;
}
export async function leerSesion(token?: string): Promise<{ usuario: string; rol: Rol } | null> {
  if (!token) return null;
  const partes = token.split(".");
  if (partes.length !== 3 && partes.length !== 4) return null;
  const firma = partes[partes.length - 1], exp = partes[partes.length - 2];
  if (!igual(firma, await hmac(partes.slice(0, -1).join("."), secreto()))) return null;
  if (!(Number(exp) > Date.now())) return null;
  return { usuario: decodeURIComponent(partes[0]), rol: partes.length === 4 ? aRol(partes[1]) : ROL_POR_DEFECTO };
}
export async function sesionValida(token?: string) {
  return (await leerSesion(token)) !== null;
}
export const SESION_SEGUNDOS = DURACION_MS / 1000;
