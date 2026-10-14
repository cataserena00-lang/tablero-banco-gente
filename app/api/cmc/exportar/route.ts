import { NextResponse } from "next/server";
import { exigirRol } from "@/lib/sesion";
import { baseConfigurada, registrarAcceso, tablaFaltante } from "@/lib/personas";
import { COLUMNAS_CAPACITADORES_XLSX, COLUMNAS_PARTICIPANTES_XLSX, capacitadoresParaExcel, participantesParaExcel } from "@/lib/cmcNominal";
import { armarExcelCmc } from "@/lib/excelCmc";
import { alcanceDe } from "../_alcance";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const SIN_CACHE = { "Cache-Control": "no-store" };
const slug = (t: string) => t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// Excel de participantes o de capacitadores de un curso o una zona (datos NOMINALES). Solo perfil completo o admin; el rol se verifica acá, en el servidor.
export async function GET(req: Request) {
  const s = await exigirRol("completo", "cmc");
  if (!s) return NextResponse.json({ error: "prohibido" }, { status: 403, headers: SIN_CACHE });
  if (!baseConfigurada()) return NextResponse.json({ error: "sin_base" }, { status: 503, headers: SIN_CACHE });
  const u = new URL(req.url), a = alcanceDe(u.searchParams), tipo = u.searchParams.get("tipo");
  if (!a || (tipo !== "participantes" && tipo !== "capacitadores")) return NextResponse.json({ error: "invalido" }, { status: 400, headers: SIN_CACHE });
  if (a.curso === undefined && !a.dep) return NextResponse.json({ error: "invalido" }, { status: 400, headers: SIN_CACHE });
  try {
    const r = tipo === "participantes" ? await participantesParaExcel(a) : await capacitadoresParaExcel(a);
    if ("excede" in r && r.excede) return NextResponse.json({ error: "demasiadas", total: r.total }, { status: 413, headers: SIN_CACHE });
    if (!r.total) return NextResponse.json({ error: "sin_datos" }, { status: 404, headers: SIN_CACHE });
    const alcance = a.curso !== undefined ? `Curso ${a.curso}` : [a.dep, a.loc].filter(Boolean).join(" · ") + (a.q ? " (con búsqueda)" : "");
    await registrarAcceso(s.usuario, s.rol, "exportacion", { programa: "cmc", tipo: `${tipo}_excel`, curso: a.curso, dep: a.dep, loc: a.loc, conBusqueda: !!a.q }, r.total);
    const fecha = new Date().toLocaleString("es-AR", { timeZone: "America/Argentina/Cordoba", dateStyle: "short", timeStyle: "short" });
    const buf = await armarExcelCmc({
      hoja: tipo === "participantes" ? "Participantes" : "Capacitadores", alcance,
      columnas: tipo === "participantes" ? COLUMNAS_PARTICIPANTES_XLSX : COLUMNAS_CAPACITADORES_XLSX, filas: r.filas, usuario: s.usuario, fecha,
    });
    const archivo = `${tipo}-${slug(alcance) || "cmc"}-${new Date().toISOString().slice(0, 10)}.xlsx`;
    return new NextResponse(new Uint8Array(buf), {
      headers: { ...SIN_CACHE, "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${archivo}"` },
    });
  } catch (e) {
    if (tablaFaltante(e)) return NextResponse.json({ error: "sin_base" }, { status: 503, headers: SIN_CACHE });
    console.error("Error en /api/cmc/exportar", (e as Error)?.name);
    return NextResponse.json({ error: "error" }, { status: 500, headers: SIN_CACHE });
  }
}
