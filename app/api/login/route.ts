import { NextResponse } from "next/server";
import { COOKIE, SESION_SEGUNDOS, crearSesion, normalizarUsuario, verificarCredenciales } from "@/lib/auth";
import { registrarAcceso } from "@/lib/personas";

export async function POST(req: Request) {
  const f = await req.formData();
  const u = normalizarUsuario(String(f.get("usuario") ?? "")), c = String(f.get("clave") ?? "");
  const base = new URL(req.url);
  const acceso = await verificarCredenciales(u, c);
  if (!acceso) {
    return NextResponse.redirect(new URL("/login?error=1", base), 303);
  }
  await registrarAcceso(u, acceso.rol, "ingreso", null);   // quién entró y cuándo (lo ve el perfil admin); no frena el ingreso si falla
  const res = NextResponse.redirect(new URL("/", base), 303);   // al inicio del Ministerio (con un solo programa, la página redirige sola al tablero)
  res.cookies.set(COOKIE, await crearSesion(u, acceso.rol), {
    httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: SESION_SEGUNDOS,
  });
  return res;
}
