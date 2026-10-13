import { NextResponse } from "next/server";
import { exigirRol } from "@/lib/sesion";
import { baseConfigurada, registrarAcceso, tablaFaltante } from "@/lib/personas";
import { listarEventos, resumenActividad } from "@/lib/actividad";

export const dynamic = "force-dynamic";
const SIN_CACHE = { "Cache-Control": "no-store" };

// Actividad de los usuarios (ingresos y exportables). SOLO perfil admin; el rol se verifica acá, en el servidor.
export async function GET(req: Request) {
  if (!(await exigirRol("admin"))) return NextResponse.json({ error: "prohibido" }, { status: 403, headers: SIN_CACHE });
  if (!baseConfigurada()) return NextResponse.json({ error: "sin_base" }, { status: 503, headers: SIN_CACHE });
  const u = new URL(req.url).searchParams;
  try {
    const dias = Number(u.get("dias")) || 30;
    const [eventos, resumen] = await Promise.all([
      listarEventos({ usuario: u.get("usuario") ?? undefined, grupo: u.get("grupo") ?? undefined, desde: u.get("desde") ?? undefined,
        hasta: u.get("hasta") ?? undefined, pagina: Number(u.get("pagina")) || 1 }),
      resumenActividad(dias),
    ]);
    return NextResponse.json({ ...eventos, resumen }, { headers: SIN_CACHE });
  } catch (e) {
    // 42501 = el rol de lectura todavía no tiene permiso de lectura sobre `accesos`
    if (tablaFaltante(e)) return NextResponse.json({ error: "sin_base" }, { status: 503, headers: SIN_CACHE });
    if ((e as { code?: string } | null)?.code === "42501") return NextResponse.json({ error: "sin_permiso" }, { status: 503, headers: SIN_CACHE });
    console.error("Error en /api/actividad", (e as Error)?.name);
    return NextResponse.json({ error: "error" }, { status: 500, headers: SIN_CACHE });
  }
}

const TIPOS = new Set(["ficha", "fichas", "panorama"]);
const CONTENIDOS = new Set(["pendientes", "completa", "completa+personas"]);
const recortar = (v: unknown, max: number) => String(v ?? "").slice(0, max);

// Cualquier usuario con sesión avisa que generó un exportable que se arma en su navegador (fichas, panorama):
// queda registrado quién y qué. Solo se guardan datos de una lista cerrada, con largo acotado.
export async function POST(req: Request) {
  const s = await exigirRol("agregado");
  if (!s) return NextResponse.json({ error: "prohibido" }, { status: 403, headers: SIN_CACHE });
  let cuerpo: Record<string, unknown> = {};
  try { cuerpo = await req.json(); } catch { /* cuerpo vacío o inválido: se rechaza abajo */ }
  const tipo = String(cuerpo.tipo ?? "");
  if (!TIPOS.has(tipo)) return NextResponse.json({ error: "invalido" }, { status: 400, headers: SIN_CACHE });
  const zonas = Array.isArray(cuerpo.zonas) ? cuerpo.zonas.slice(0, 30).map(z => recortar(z, 80)) : [];
  const contenido = CONTENIDOS.has(String(cuerpo.contenido)) ? String(cuerpo.contenido) : "pendientes";
  const cantidad = Math.min(Math.max(0, Math.floor(Number(cuerpo.cantidad)) || 0), 100000);
  await registrarAcceso(s.usuario, s.rol, "exportable", { tipo, zonas, contenido, cantidad }, zonas.length || undefined);
  return NextResponse.json({ ok: true }, { headers: SIN_CACHE });
}
