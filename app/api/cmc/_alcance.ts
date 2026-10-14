import type { AlcanceCmc } from "@/lib/cmcNominal";

export const MAX_ZONAS_URL = 60;
const ESTADOS = new Set(["INSCRIPTO", "CURSANDO", "APROBADO", "EGRESADO", "NO APROBADO", "BAJA"]);

/** Alcance pedido en la URL: ?curso=123 | ?zdep=COLON&zloc=UNQUILLO, y ?q= para buscar. Devuelve null si algo no es válido. */
export function alcanceDe(u: URLSearchParams): AlcanceCmc | null {
  const a: AlcanceCmc = {};
  const curso = u.get("curso");
  if (curso !== null) {
    if (!/^\d{1,9}$/.test(curso)) return null;
    a.curso = Number(curso);
  }
  const dep = (u.get("zdep") ?? "").trim().slice(0, 100), loc = (u.get("zloc") ?? "").trim().slice(0, 100);
  if (dep) a.dep = dep;
  if (loc) a.loc = loc;
  // Varias zonas: ?z=COLON&z=CAPITAL~CORDOBA (departamento, o departamento~localidad)
  const zonas = u.getAll("z").slice(0, MAX_ZONAS_URL + 1).map(v => { const [dep, loc] = v.split("~"); return { dep: dep.trim().slice(0, 100), loc: loc?.trim().slice(0, 100) || undefined }; }).filter(z => z.dep);
  if (zonas.length > MAX_ZONAS_URL) return null;
  if (zonas.length) a.zonas = zonas;
  const estado = (u.get("estado") ?? "").trim();
  if (estado) {
    if (!ESTADOS.has(estado)) return null;
    a.estado = estado;
  }
  const q = (u.get("q") ?? "").trim().slice(0, 100);
  if (q) a.q = q;
  return a;
}
export const PAGINA = (u: URLSearchParams) => Math.min(100_000, Math.max(1, Number(u.get("pagina")) || 1));
