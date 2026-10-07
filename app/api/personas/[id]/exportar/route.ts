import { NextResponse } from "next/server";
import { exigirRol } from "@/lib/sesion";
import { baseConfigurada, detallePersona, registrarAcceso, tablaFaltante } from "@/lib/personas";
import { generarPdfFicha } from "@/lib/pdfFicha";

export const dynamic = "force-dynamic";
export const maxDuration = 30;
const SIN_CACHE = { "Cache-Control": "no-store" };

// PDF con la ficha de una persona y todas sus solicitudes. Solo perfil "completo" (se verifica acá, en el servidor);
// queda registrado en `accesos` como exportación.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await exigirRol("completo");
  if (!s) return NextResponse.json({ error: "prohibido" }, { status: 403, headers: SIN_CACHE });
  if (!baseConfigurada()) return NextResponse.json({ error: "sin_base" }, { status: 503, headers: SIN_CACHE });
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) return NextResponse.json({ error: "id_invalido" }, { status: 400, headers: SIN_CACHE });
  try {
    const d = await detallePersona(id);
    if (!d) return NextResponse.json({ error: "no_existe" }, { status: 404, headers: SIN_CACHE });
    await registrarAcceso(s.usuario, s.rol, "exportacion", { tipo: "ficha", id }, d.solicitudes.length);
    const fecha = new Date().toLocaleString("es-AR", { timeZone: "America/Argentina/Cordoba", dateStyle: "short", timeStyle: "short" });
    const pdf = await generarPdfFicha({ persona: d.persona, solicitudes: d.solicitudes, usuario: s.usuario, fecha });
    return new NextResponse(Buffer.from(pdf), {
      headers: { ...SIN_CACHE, "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="ficha-persona-${id}-${new Date().toISOString().slice(0, 10)}.pdf"` },
    });
  } catch (e) {
    if (tablaFaltante(e)) return NextResponse.json({ error: "sin_base" }, { status: 503, headers: SIN_CACHE });
    console.error("Error en /api/personas/[id]/exportar", (e as Error)?.name);   // sin mensaje: podría incluir datos
    return NextResponse.json({ error: "error" }, { status: 500, headers: SIN_CACHE });
  }
}
