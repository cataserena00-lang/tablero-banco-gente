import { NextResponse } from "next/server";
import { exigirRol } from "@/lib/sesion";
import { baseConfigurada, tablaFaltante } from "@/lib/personas";
import { cursosDeCapacitador } from "@/lib/cmcNominal";
import { alcanceDe } from "../../_alcance";

export const dynamic = "force-dynamic";
const SIN_CACHE = { "Cache-Control": "no-store" };

// Cursos que dio un capacitador y en qué fechas (datos NOMINALES). Solo perfil completo o admin con acceso a Córdoba me capacita; se verifica acá, en el servidor.
export async function GET(req: Request) {
  const s = await exigirRol("completo", "cmc");
  if (!s) return NextResponse.json({ error: "prohibido" }, { status: 403, headers: SIN_CACHE });
  if (!baseConfigurada()) return NextResponse.json({ error: "sin_base" }, { status: 503, headers: SIN_CACHE });
  const u = new URL(req.url), a = alcanceDe(u.searchParams), cuil = (u.searchParams.get("cuil") ?? "").trim();
  if (!a || !/^\d{11}$/.test(cuil)) return NextResponse.json({ error: "invalido" }, { status: 400, headers: SIN_CACHE });
  try {
    return NextResponse.json({ cursos: await cursosDeCapacitador(cuil, a) }, { headers: SIN_CACHE });
  } catch (e) {
    if (tablaFaltante(e)) return NextResponse.json({ error: "sin_base" }, { status: 503, headers: SIN_CACHE });
    console.error("Error en /api/cmc/capacitadores/cursos", (e as Error)?.name);
    return NextResponse.json({ error: "error" }, { status: 500, headers: SIN_CACHE });
  }
}
