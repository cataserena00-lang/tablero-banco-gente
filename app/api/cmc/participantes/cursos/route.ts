import { NextResponse } from "next/server";
import { exigirRol } from "@/lib/sesion";
import { baseConfigurada, tablaFaltante } from "@/lib/personas";
import { cursosDePersona } from "@/lib/cmcNominal";

export const dynamic = "force-dynamic";
const SIN_CACHE = { "Cache-Control": "no-store" };

// Cursos en los que participó una persona y el estado de cada uno (datos NOMINALES). Solo perfil completo o admin con acceso a Córdoba me capacita;
// se verifica acá, en el servidor. La persona se pide con la clave que trae el listado (/api/cmc/participantes).
export async function GET(req: Request) {
  const s = await exigirRol("completo", "cmc");
  if (!s) return NextResponse.json({ error: "prohibido" }, { status: 403, headers: SIN_CACHE });
  if (!baseConfigurada()) return NextResponse.json({ error: "sin_base" }, { status: 503, headers: SIN_CACHE });
  const persona = (new URL(req.url).searchParams.get("persona") ?? "").slice(0, 300);
  if (!persona) return NextResponse.json({ error: "invalido" }, { status: 400, headers: SIN_CACHE });
  try {
    return NextResponse.json({ cursos: await cursosDePersona(persona) }, { headers: SIN_CACHE });
  } catch (e) {
    if (tablaFaltante(e)) return NextResponse.json({ error: "sin_base" }, { status: 503, headers: SIN_CACHE });
    console.error("Error en /api/cmc/participantes/cursos", (e as Error)?.name);
    return NextResponse.json({ error: "error" }, { status: 500, headers: SIN_CACHE });
  }
}
