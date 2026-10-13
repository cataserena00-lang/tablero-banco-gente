import { NextResponse } from "next/server";
import { exigirRol } from "@/lib/sesion";
import { baseConfigurada, registrarAcceso, tablaFaltante } from "@/lib/personas";
import { listarPendientes } from "@/lib/pendientes";
import { armarExcel } from "@/lib/excelPendientes";
import { zonaDe } from "../_zona";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const SIN_CACHE = { "Cache-Control": "no-store" };
const slug = (t: string) => t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// Excel con los créditos pendientes de una zona (datos NOMINALES). Solo perfil "completo" o admin; el rol se verifica acá, en el servidor.
export async function GET(req: Request) {
  const s = await exigirRol("completo");
  if (!s) return NextResponse.json({ error: "prohibido" }, { status: 403, headers: SIN_CACHE });
  if (!baseConfigurada()) return NextResponse.json({ error: "sin_base" }, { status: 503, headers: SIN_CACHE });
  const zona = zonaDe(new URL(req.url).searchParams);
  if (!zona) return NextResponse.json({ error: "invalido" }, { status: 400, headers: SIN_CACHE });
  try {
    const r = await listarPendientes(zona);
    if (r.excede) return NextResponse.json({ error: "demasiadas", total: r.total }, { status: 413, headers: SIN_CACHE });
    if (!r.total) return NextResponse.json({ error: "sin_datos" }, { status: 404, headers: SIN_CACHE });
    await registrarAcceso(s.usuario, s.rol, "exportacion", { tipo: "pendientes_excel", ...zona }, r.total);
    const nombreZona = [zona.dep, zona.loc, zona.circuito === undefined ? null : zona.circuito === "__sin__" ? "sin circuito" : `circuito ${zona.circuito}`,
      zona.barrio === "" ? "sin barrio" : zona.barrio].filter(x => x).join(" · ");
    const fecha = new Date().toLocaleString("es-AR", { timeZone: "America/Argentina/Cordoba", dateStyle: "short", timeStyle: "short" });
    const buf = await armarExcel({ zona: nombreZona, columnas: r.columnas, filas: r.filas, usuario: s.usuario, fecha });
    const archivo = `pendientes-${slug(nombreZona) || "zona"}-${new Date().toISOString().slice(0, 10)}.xlsx`;
    return new NextResponse(new Uint8Array(buf), {
      headers: { ...SIN_CACHE, "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${archivo}"` },
    });
  } catch (e) {
    if (tablaFaltante(e)) return NextResponse.json({ error: "sin_base" }, { status: 503, headers: SIN_CACHE });
    console.error("Error en /api/pendientes/exportar", (e as Error)?.name);   // sin mensaje: podría incluir datos
    return NextResponse.json({ error: "error" }, { status: 500, headers: SIN_CACHE });
  }
}
