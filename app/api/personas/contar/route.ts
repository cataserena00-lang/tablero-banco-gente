import { NextResponse } from "next/server";
import { exigirRol } from "@/lib/sesion";
import { baseConfigurada, contarPersonas, tablaFaltante } from "@/lib/personas";

export const dynamic = "force-dynamic";
const SIN_CACHE = { "Cache-Control": "no-store" };

// Cuántas personas tiene una zona (departamento y, opcionalmente, localidad). Solo la cantidad; solo perfil "completo".
export async function GET(req: Request) {
  if (!(await exigirRol("completo"))) return NextResponse.json({ error: "prohibido" }, { status: 403, headers: SIN_CACHE });
  if (!baseConfigurada()) return NextResponse.json({ error: "sin_base" }, { status: 503, headers: SIN_CACHE });
  const u = new URL(req.url).searchParams;
  const zdep = u.get("zdep") ?? "";
  if (!zdep.trim()) return NextResponse.json({ error: "invalido" }, { status: 400, headers: SIN_CACHE });
  try {
    return NextResponse.json({ total: await contarPersonas({ zdep, zloc: u.get("zloc") ?? undefined }) }, { headers: SIN_CACHE });
  } catch (e) {
    if (tablaFaltante(e)) return NextResponse.json({ error: "sin_base" }, { status: 503, headers: SIN_CACHE });
    console.error("Error en /api/personas/contar", (e as Error)?.name);
    return NextResponse.json({ error: "error" }, { status: 500, headers: SIN_CACHE });
  }
}
