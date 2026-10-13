import { NextResponse } from "next/server";
import { exigirRol } from "@/lib/sesion";
import { baseConfigurada, tablaFaltante } from "@/lib/personas";
import { contarPendientes } from "@/lib/pendientes";
import { zonaDe } from "../_zona";

export const dynamic = "force-dynamic";
const SIN_CACHE = { "Cache-Control": "no-store" };

// Cuántos créditos pendientes tiene una zona (solo la cantidad). Solo perfil "completo" o admin.
export async function GET(req: Request) {
  if (!(await exigirRol("completo"))) return NextResponse.json({ error: "prohibido" }, { status: 403, headers: SIN_CACHE });
  if (!baseConfigurada()) return NextResponse.json({ error: "sin_base" }, { status: 503, headers: SIN_CACHE });
  const zona = zonaDe(new URL(req.url).searchParams);
  if (!zona) return NextResponse.json({ error: "invalido" }, { status: 400, headers: SIN_CACHE });
  try {
    return NextResponse.json({ total: await contarPendientes(zona) }, { headers: SIN_CACHE });
  } catch (e) {
    if (tablaFaltante(e)) return NextResponse.json({ error: "sin_base" }, { status: 503, headers: SIN_CACHE });
    console.error("Error en /api/pendientes/contar", (e as Error)?.name);
    return NextResponse.json({ error: "error" }, { status: 500, headers: SIN_CACHE });
  }
}
