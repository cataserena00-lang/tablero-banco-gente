import type { AlcanceCmc } from "@/lib/cmcNominal";

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
  const q = (u.get("q") ?? "").trim().slice(0, 100);
  if (q) a.q = q;
  return a;
}
export const PAGINA = (u: URLSearchParams) => Math.min(100_000, Math.max(1, Number(u.get("pagina")) || 1));
