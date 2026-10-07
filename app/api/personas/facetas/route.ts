import { NextResponse } from "next/server";
import { exigirRol } from "@/lib/sesion";
import { baseConfigurada, facetas, tablaFaltante } from "@/lib/personas";

export const dynamic = "force-dynamic";
const SIN_CACHE = { "Cache-Control": "no-store" };

// Valores de los filtros (departamentos, localidades del departamento elegido, estados, líneas). Solo perfil "completo".
export async function GET(req: Request) {
  if (!(await exigirRol("completo"))) return NextResponse.json({ error: "prohibido" }, { status: 403, headers: SIN_CACHE });
  if (!baseConfigurada()) return NextResponse.json({ error: "sin_base" }, { status: 503, headers: SIN_CACHE });
  try {
    return NextResponse.json(await facetas(new URL(req.url).searchParams.get("departamento") ?? undefined), { headers: SIN_CACHE });
  } catch (e) {
    if (tablaFaltante(e)) return NextResponse.json({ error: "sin_base" }, { status: 503, headers: SIN_CACHE });
    console.error("Error en /api/personas/facetas", (e as Error)?.name);
    return NextResponse.json({ error: "error" }, { status: 500, headers: SIN_CACHE });
  }
}
