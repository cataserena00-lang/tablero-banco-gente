import { NextResponse } from "next/server";
import { exigirRol } from "@/lib/sesion";
import { baseConfigurada, tablaFaltante } from "@/lib/personas";
import { detalleCurso, resumenZona } from "@/lib/cmcNominal";
import { alcanceDe } from "../_alcance";

export const dynamic = "force-dynamic";
const SIN_CACHE = { "Cache-Control": "no-store" };

// Detalle de un curso (capacitadores y costos) o resumen de una zona (costos y cantidad de capacitadores). Solo perfil completo o admin.
export async function GET(req: Request) {
  const s = await exigirRol("completo", "cmc");
  if (!s) return NextResponse.json({ error: "prohibido" }, { status: 403, headers: SIN_CACHE });
  if (!baseConfigurada()) return NextResponse.json({ error: "sin_base" }, { status: 503, headers: SIN_CACHE });
  const a = alcanceDe(new URL(req.url).searchParams);
  if (!a) return NextResponse.json({ error: "invalido" }, { status: 400, headers: SIN_CACHE });
  try {
    if (a.curso !== undefined) {
      const d = await detalleCurso(a.curso);
      return d ? NextResponse.json(d, { headers: SIN_CACHE }) : NextResponse.json({ error: "no_encontrado" }, { status: 404, headers: SIN_CACHE });
    }
    return NextResponse.json(await resumenZona(a.dep, a.loc), { headers: SIN_CACHE });
  } catch (e) {
    if (tablaFaltante(e)) return NextResponse.json({ error: "sin_base" }, { status: 503, headers: SIN_CACHE });
    console.error("Error en /api/cmc/resumen", (e as Error)?.name);
    return NextResponse.json({ error: "error" }, { status: 500, headers: SIN_CACHE });
  }
}
