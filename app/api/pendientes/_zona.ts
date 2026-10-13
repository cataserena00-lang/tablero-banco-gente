import type { ZonaPendientes } from "@/lib/pendientes";

/** Zona pedida en la URL (?zdep=COLON&zloc=LA CALERA&barrio=ALTA CORDOBA). `barrio` presente pero vacío = sin barrio informado. */
export function zonaDe(u: URLSearchParams): ZonaPendientes | null {
  const dep = (u.get("zdep") ?? "").trim().slice(0, 100);
  if (!dep) return null;
  const loc = u.get("zloc");
  const barrio = u.get("barrio");
  return { dep, ...(loc !== null ? { loc: loc.trim().slice(0, 100) } : {}), ...(barrio !== null ? { barrio: barrio.trim().slice(0, 150) } : {}) };
}
