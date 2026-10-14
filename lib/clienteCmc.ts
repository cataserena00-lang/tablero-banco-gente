/* Ayudas del navegador para Córdoba me capacita: descarga de los Excel nominales (los arma el servidor en /api/cmc/exportar,
   que verifica rol y programa en cada solicitud). */
export interface AlcanceCliente { curso?: number | null; dep?: string | null; loc?: string | null; q?: string; estado?: string; zonas?: { dep: string; loc?: string }[] }

export function parametros(a: AlcanceCliente): URLSearchParams {
  const p = new URLSearchParams();
  if (a.curso !== null && a.curso !== undefined) p.set("curso", String(a.curso));
  if (a.dep) p.set("zdep", a.dep);
  if (a.loc) p.set("zloc", a.loc);
  if (a.q?.trim()) p.set("q", a.q.trim());
  if (a.estado) p.set("estado", a.estado);
  for (const z of a.zonas ?? []) p.append("z", z.loc ? `${z.dep}~${z.loc}` : z.dep);
  return p;
}

/** Descarga el Excel. Devuelve un mensaje de error en español, o null si salió bien. */
export async function descargarExcelCmc(tipo: "participantes" | "capacitadores", a: AlcanceCliente): Promise<string | null> {
  try {
    const p = parametros(a); p.set("tipo", tipo);
    const r = await fetch(`/api/cmc/exportar?${p}`);
    if (!r.ok) return r.status === 413 ? "Son demasiadas filas para un solo Excel: elegí un departamento, una localidad o un curso."
      : r.status === 404 ? "No hay datos para exportar." : r.status === 403 ? "Tu usuario no tiene permiso para exportar datos de personas." : "No se pudo generar el Excel.";
    const blob = await r.blob(), a2 = document.createElement("a");
    a2.href = URL.createObjectURL(blob);
    a2.download = /filename="([^"]+)"/.exec(r.headers.get("Content-Disposition") ?? "")?.[1] ?? `${tipo}.xlsx`;
    a2.click(); URL.revokeObjectURL(a2.href);
    return null;
  } catch { return "No se pudo generar el Excel."; }
}
