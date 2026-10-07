import { NextResponse } from "next/server";
import { exigirRol } from "@/lib/sesion";
import { baseConfigurada, detallePersona, registrarAcceso, tablaFaltante } from "@/lib/personas";

export const dynamic = "force-dynamic";
const SIN_CACHE = { "Cache-Control": "no-store" };

// Una persona (datos de su última solicitud) y todas sus solicitudes, de la más nueva a la más vieja. `id` es el de la persona en el listado.
// Solo perfil "completo"; cada consulta queda registrada en `accesos`.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await exigirRol("completo");
  if (!s) return NextResponse.json({ error: "prohibido" }, { status: 403, headers: SIN_CACHE });
  if (!baseConfigurada()) return NextResponse.json({ error: "sin_base" }, { status: 503, headers: SIN_CACHE });
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) return NextResponse.json({ error: "id_invalido" }, { status: 400, headers: SIN_CACHE });
  try {
    const d = await detallePersona(id);
    if (!d) return NextResponse.json({ error: "no_existe" }, { status: 404, headers: SIN_CACHE });
    await registrarAcceso(s.usuario, s.rol, "ficha", { id }, d.solicitudes.length);
    return NextResponse.json(d, { headers: SIN_CACHE });
  } catch (e) {
    if (tablaFaltante(e)) return NextResponse.json({ error: "sin_base" }, { status: 503, headers: SIN_CACHE });
    console.error("Error en /api/personas/[id]", (e as Error)?.name);
    return NextResponse.json({ error: "error" }, { status: 500, headers: SIN_CACHE });
  }
}
