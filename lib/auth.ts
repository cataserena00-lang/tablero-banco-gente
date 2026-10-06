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

export async function verificarCredenciales(usuario: string, clave: string) {
  const lista = (process.env.DASHBOARD_USERS ?? "").split(",").map(x => x.trim()).filter(Boolean);
  const hash = await hmac(clave, secreto());
  let ok = false;
  for (const par of lista) {
    const i = par.indexOf(":");
    if (i < 0) continue;
    if (par.slice(0, i) === usuario && igual(par.slice(i + 1), hash)) ok = true;
  }
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
