import { NextResponse } from "next/server";
import { exigirRol } from "@/lib/sesion";
import { baseConfigurada, buscarPersonas, registrarAcceso, tablaFaltante } from "@/lib/personas";

export const dynamic = "force-dynamic";
const SIN_CACHE = { "Cache-Control": "no-store" };

// Listado de personas con filtros y buscador. Solo perfil "completo"; el rol se verifica acá, en el servidor.
export async function GET(req: Request) {
  const s = await exigirRol("completo");
  if (!s) return NextResponse.json({ error: "prohibido" }, { status: 403, headers: SIN_CACHE });
  if (!baseConfigurada()) return NextResponse.json({ error: "sin_base" }, { status: 503, headers: SIN_CACHE });
  const u = new URL(req.url).searchParams;
  const filtros = {
    q: u.get("q") ?? undefined, departamento: u.get("departamento") ?? undefined, localidad: u.get("localidad") ?? undefined,
    estado: u.get("estado") ?? undefined, linea: u.get("linea") ?? undefined, pagina: Number(u.get("pagina")) || 1,
  };
  try {
    const r = await buscarPersonas(filtros);
    await registrarAcceso(s.usuario, s.rol, "busqueda", filtros, r.total);
    return NextResponse.json(r, { headers: SIN_CACHE });
  } catch (e) {
    if (tablaFaltante(e)) return NextResponse.json({ error: "sin_base" }, { status: 503, headers: SIN_CACHE });
    console.error("Error en /api/personas", (e as Error)?.name);   // sin mensaje: podría incluir datos
    return NextResponse.json({ error: "error" }, { status: 500, headers: SIN_CACHE });
  }
}
