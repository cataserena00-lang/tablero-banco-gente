import { NextResponse } from "next/server";
import { exigirRol } from "@/lib/sesion";
import { baseConfigurada, registrarAcceso, tablaFaltante } from "@/lib/personas";
import { listarParticipantes } from "@/lib/cmcNominal";
import { PAGINA, alcanceDe } from "../_alcance";

export const dynamic = "force-dynamic";
const SIN_CACHE = { "Cache-Control": "no-store" };

// Participantes de un curso o de una zona (datos NOMINALES). Solo perfil completo o admin con acceso a Córdoba me capacita; se verifica acá, en el servidor.
export async function GET(req: Request) {
  const s = await exigirRol("completo", "cmc");
  if (!s) return NextResponse.json({ error: "prohibido" }, { status: 403, headers: SIN_CACHE });
  if (!baseConfigurada()) return NextResponse.json({ error: "sin_base" }, { status: 503, headers: SIN_CACHE });
  const u = new URL(req.url), a = alcanceDe(u.searchParams);
  if (!a) return NextResponse.json({ error: "invalido" }, { status: 400, headers: SIN_CACHE });
  try {
    const r = await listarParticipantes(a, PAGINA(u.searchParams));
    if (a.q) await registrarAcceso(s.usuario, s.rol, "busqueda", { programa: "cmc", tipo: "participantes", dep: a.dep, loc: a.loc, curso: a.curso, estado: a.estado, conTexto: true }, r.total);
    return NextResponse.json(r, { headers: SIN_CACHE });
  } catch (e) {
    if (tablaFaltante(e)) return NextResponse.json({ error: "sin_base" }, { status: 503, headers: SIN_CACHE });
    console.error("Error en /api/cmc/participantes", (e as Error)?.name);   // sin mensaje: podría incluir datos
    return NextResponse.json({ error: "error" }, { status: 500, headers: SIN_CACHE });
  }
}
