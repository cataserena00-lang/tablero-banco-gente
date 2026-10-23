import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, sesionValida } from "@/lib/auth";
import { COOKIE_SESION, modoV2 } from "@/lib/auth2/config";
import { modoLocalSinBase } from "@/lib/auth2/db";
import { leerSesionDb } from "@/lib/auth2/sesiones";

const PUBLICAS = ["/login", "/api/login"];
const esPublica = (p: string) => PUBLICAS.some(x => p === x || p.startsWith(x + "/"));

// Validaciones recientes (por instancia, 20 s): evita una consulta a la base por cada archivo o pedido de la misma pantalla.
// El servidor vuelve a verificar la sesión, sin cache, en cada página y cada ruta /api.
const recientes = new Map<string, { hasta: number; ok: boolean }>();
async function sesionCompletaValida(token: string | undefined) {
  if (!token) return false;
  if (modoLocalSinBase()) return true;
  const hit = recientes.get(token);
  if (hit && hit.hasta > Date.now()) return hit.ok;
  const s = await leerSesionDb(token, false).catch(() => null);
  const ok = !!s && s.etapa === "completa";
  if (recientes.size > 500) recientes.clear();
  recientes.set(token, { hasta: Date.now() + 20_000, ok });
  return ok;
}

// Política de contenido (CSP): los scripts solo se ejecutan si traen el nonce de este pedido (Next lo agrega a los suyos);
// no se puede incrustar el sitio en otra página; los mapas cargan teselas de OpenStreetMap y nada más viene de afuera.
function csp(nonce: string) {
  const dev = process.env.NODE_ENV !== "production";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://tile.openstreetmap.org https://*.tile.openstreetmap.org",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
    ...(process.env.VERCEL ? ["upgrade-insecure-requests"] : []),   // solo en Vercel (https); en pruebas locales por http rompería los pedidos
  ].join("; ");
}
function conCsp(req: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const politica = csp(nonce);
  const cabeceras = new Headers(req.headers);
  cabeceras.set("x-nonce", nonce);
  cabeceras.set("content-security-policy", politica);
  const res = NextResponse.next({ request: { headers: cabeceras } });
  res.headers.set("Content-Security-Policy", politica);
  return res;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (esPublica(pathname)) return conCsp(req);
  const valida = modoV2() ? await sesionCompletaValida(req.cookies.get(COOKIE_SESION)?.value) : await sesionValida(req.cookies.get(COOKIE)?.value);
  if (valida) return conCsp(req);
  if (pathname.startsWith("/api/")) return new NextResponse("No autorizado", { status: 401 });
  const url = req.nextUrl.clone(); url.pathname = "/login"; url.search = "";
  return NextResponse.redirect(url);
}
export const config = { matcher: ["/((?!_next/static|favicon.ico).*)"] };
