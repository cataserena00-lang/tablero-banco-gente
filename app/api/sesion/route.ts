import { NextResponse } from "next/server";
import { sesionActual } from "@/lib/sesion";

// Quién es el usuario y con qué perfil entró. Sin datos sensibles. El middleware ya exige sesión.
export async function GET() {
  const s = await sesionActual();
  if (!s) return new NextResponse("No autorizado", { status: 401 });
  return NextResponse.json({ usuario: s.usuario, rol: s.rol });
}
