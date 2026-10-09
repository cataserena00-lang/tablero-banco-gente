// Estados de los créditos y su agrupación en categorías (la de la tabla que armó el equipo).
// Sin datos: solo nombres. Lo usan el servidor (filtros de la vista de personas) y el navegador (fichas y gráficos).

export const CATEGORIAS = [
  "En evaluación",
  "Aprobados pendientes de pago",
  "Pago en curso",
  "No cobrados",
  "Pagados - cuotas al día",
  "Pagados - con mora",
  "Finalizados",
  "Cerrados sin desembolso",
] as const;
export type Categoria = (typeof CATEGORIAS)[number];
export const SIN_CLASIFICAR = "Sin clasificar";   // estado vacío o que no figura en la tabla

// Estado (tal como viene en la base) -> categoría
const ESTADOS: [string, Categoria][] = [
  ["CREADO", "En evaluación"],
  ["EVALUACIÓN TÉCNICA", "En evaluación"],
  ["A PAGAR", "Aprobados pendientes de pago"],
  ["A PAGAR CON LOTE", "Aprobados pendientes de pago"],
  ["A PAGAR CON BANCO", "Aprobados pendientes de pago"],
  ["MUTUO FIRMADO", "Aprobados pendientes de pago"],
  ["PAGO EMITIDO", "Pago en curso"],
  ["IMPAGO", "No cobrados"],
  ["IMPAGO DESISTIDO", "No cobrados"],
  ["CON PLAN DE CUOTAS", "Pagados - cuotas al día"],
  ["PAGADO", "Pagados - cuotas al día"],
  ["CON PLAN DE CUOTAS CON IMPAGOS", "Pagados - con mora"],
  ["MOROSO >= 5 MESES", "Pagados - con mora"],
  ["MOROSO ENTRE 3 Y 4 MESES", "Pagados - con mora"],
  ["PRE-FINALIZADO", "Pagados - con mora"],
  ["FINALIZADO", "Finalizados"],
  ["BAJA ADMINISTRATIVA", "Cerrados sin desembolso"],
  ["DESISTIDO", "Cerrados sin desembolso"],
  ["RECHAZADO", "Cerrados sin desembolso"],
];

const sinTildes = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "");
/** Clave de comparación: sin tildes, mayúsculas y espacios simples. */
export const claveEstado = (s: string | null | undefined) => sinTildes(s ?? "").toUpperCase().replace(/\s+/g, " ").trim();

const POR_CLAVE = new Map(ESTADOS.map(([e, c]) => [claveEstado(e), c]));
/** Nombre oficial del estado (con tildes) si figura en la tabla; si no, el original. */
const OFICIAL = new Map(ESTADOS.map(([e]) => [claveEstado(e), e]));
export const estadoOficial = (s: string | null | undefined) => OFICIAL.get(claveEstado(s)) ?? (s ?? "").trim();

export function categoriaDe(estado: string | null | undefined): Categoria | typeof SIN_CLASIFICAR {
  return POR_CLAVE.get(claveEstado(estado)) ?? SIN_CLASIFICAR;
}

/** Estados de una categoría, en el orden de la tabla. */
export const estadosDe = (categoria: string) => ESTADOS.filter(([, c]) => c === categoria).map(([e]) => e);

/** Todas las grafías de los estados de una categoría (con y sin tildes), para filtrar con `estado = ANY(...)`. */
export const grafiasDe = (categoria: string) => [...new Set(estadosDe(categoria).flatMap(e => [e, sinTildes(e)]))];
export const todasLasGrafias = () => [...new Set(ESTADOS.flatMap(([e]) => [e, sinTildes(e)]))];

export const esCategoria = (s: string): s is Categoria | typeof SIN_CLASIFICAR =>
  s === SIN_CLASIFICAR || (CATEGORIAS as readonly string[]).includes(s);
