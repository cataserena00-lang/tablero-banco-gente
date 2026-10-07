import { NextResponse } from "next/server";
import { COOKIE, SESION_SEGUNDOS, crearSesion, verificarCredenciales } from "@/lib/auth";

export async function POST(req: Request) {
  const f = await req.formData();
  const u = String(f.get("usuario") ?? ""), c = String(f.get("clave") ?? "");
  const base = new URL(req.url);
  if (!(await verificarCredenciales(u, c))) {
    return NextResponse.redirect(new URL("/login?error=1", base), 303);
  }
  const res = NextResponse.redirect(new URL("/banco-gente", base), 303);   // directo al tablero
  res.cookies.set(COOKIE, await crearSesion(u), {
    httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: SESION_SEGUNDOS,
  });
  return res;
}
