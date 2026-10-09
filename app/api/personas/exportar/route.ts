import { NextResponse } from "next/server";
import { exigirRol } from "@/lib/sesion";
import { baseConfigurada, exportarPersonas, registrarAcceso, tablaFaltante, type Filtros } from "@/lib/personas";
import { generarPdfPersonas } from "@/lib/pdfPersonas";
import { etiquetaColumna } from "@/lib/personasComun";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const SIN_CACHE = { "Cache-Control": "no-store" };

// PDF con las personas que cumplen los filtros (máx. 5.000). Solo perfil "completo"; el rol se verifica acá, en el servidor.
export async function GET(req: Request) {
  const s = await exigirRol("completo");
  if (!s) return NextResponse.json({ error: "prohibido" }, { status: 403, headers: SIN_CACHE });
  if (!baseConfigurada()) return NextResponse.json({ error: "sin_base" }, { status: 503, headers: SIN_CACHE });
  const u = new URL(req.url).searchParams;
  const filtros: Filtros = {
    q: u.get("q") ?? undefined, departamento: u.get("departamento") ?? undefined, localidad: u.get("localidad") ?? undefined,
    categoria: u.get("categoria") ?? undefined, estado: u.get("estado") ?? undefined, linea: u.get("linea") ?? undefined,
  };
  const columnas = (u.get("columnas") ?? "").split(",").map(c => c.trim()).filter(c => /^[a-z0-9_]+$/.test(c));
  if (!columnas.length) return NextResponse.json({ error: "sin_columnas" }, { status: 400, headers: SIN_CACHE });
  try {
    const r = await exportarPersonas(filtros, columnas);
    if (r.excede) return NextResponse.json({ error: "demasiadas", total: r.total }, { status: 413, headers: SIN_CACHE });
    await registrarAcceso(s.usuario, s.rol, "exportacion", { ...filtros, columnas: r.columnas }, r.total);
    const aplicados = (["departamento", "localidad", "categoria", "estado", "linea"] as const)
      .filter(k => filtros[k]?.trim()).map(k => `${etiquetaColumna(k)}: ${filtros[k]!.trim()}`);
    if (filtros.q?.trim()) aplicados.push(`Búsqueda: ${filtros.q.trim()}`);
    const fecha = new Date().toLocaleString("es-AR", { timeZone: "America/Argentina/Cordoba", dateStyle: "short", timeStyle: "short" });
    const pdf = await generarPdfPersonas({ columnas: r.columnas, filas: r.filas, filtros: aplicados, usuario: s.usuario, fecha });
    const nombre = `personas-${new Date().toISOString().slice(0, 10)}.pdf`;
    return new NextResponse(Buffer.from(pdf), {
      headers: { ...SIN_CACHE, "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${nombre}"` },
    });
  } catch (e) {
    if (tablaFaltante(e)) return NextResponse.json({ error: "sin_base" }, { status: 503, headers: SIN_CACHE });
    console.error("Error en /api/personas/exportar", (e as Error)?.name);   // sin mensaje: podría incluir datos
    return NextResponse.json({ error: "error" }, { status: 500, headers: SIN_CACHE });
  }
}
