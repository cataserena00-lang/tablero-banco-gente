// Formato de nombres, números y fechas compartido por el tablero y las fichas de zona.
const TILDES: Record<string,string> = {
  "COLON":"Colón","RIO CUARTO":"Río Cuarto","RIO PRIMERO":"Río Primero",
  "RIO SECO":"Río Seco","RIO SEGUNDO":"Río Segundo","JUAREZ CELMAN":"Juárez Celman",
  "MARCOS JUAREZ":"Marcos Juárez","ISCHILIN":"Ischilín",
  "GENERAL SAN MARTIN":"General San Martín","UNION":"Unión",
  "PRESIDENTE ROQUE SAENZ PENA":"Presidente Roque Sáenz Peña",
  "SANTA MARIA":"Santa María","CORDOBA":"Córdoba",
  "SIN ASIGNAR":"Sin asignar","SIN DATO":"Sin dato",
};
export function nombreDep(s: string) {
  return TILDES[s] || s.toLowerCase()
    .replace(/(^|[\s])(\p{L})/gu, (_, a, b) => a + b.toUpperCase())
    .replace(/ De | Del /g, x => x.toLowerCase());
}
export const miles = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
export const peso = (n: number) => "$ " + miles(n);
export const fmtF = (iso: string) => iso.slice(8,10)+"/"+iso.slice(5,7)+"/"+iso.slice(0,4);

/* Las tres líneas del Banco. En las bases aparecen con varios nombres: "LIBRE DISPONIBILIDAD" y "L2" son la misma línea,
   "L4" y "L4." también, y "PE" es "POTENCIAR EMPRENDIMIENTO". */
export const LINEA_LIBRE = "Libre disponibilidad";
export const LINEA_INICIAR = "Iniciar emprendimiento";
export const LINEA_POTENCIAR = "Potenciar emprendimiento";
export const LINEAS = [LINEA_LIBRE, LINEA_INICIAR, LINEA_POTENCIAR] as const;
export const LINEA_OTRAS = "Otras líneas";

const claveLinea = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
const LINEA_POR_CLAVE: Record<string, string> = {
  "LIBRE DISPONIBILIDAD": LINEA_LIBRE, "L2": LINEA_LIBRE,
  "INICIAR EMPRENDIMIENTO": LINEA_INICIAR, "L4": LINEA_INICIAR,
  "POTENCIAR EMPRENDIMIENTO": LINEA_POTENCIAR, "PE": LINEA_POTENCIAR,
};
/** Nombre oficial de la línea, o null si no es una de las tres (L1, L3, L6, etc.). */
export const lineaCanonica = (s: string | null | undefined): string | null => (s ? LINEA_POR_CLAVE[claveLinea(s)] ?? null : null);

/** Nombre para mostrar: el oficial si es una de las tres; si no, el original. */
export const nombreLinea = (s: string) => lineaCanonica(s) ?? s;

/** Grafías con las que cada línea viene en las bases (para filtrar con `linea = ANY(...)`). */
export const GRAFIAS_LINEA: Record<string, string[]> = {
  [LINEA_LIBRE]: ["LIBRE DISPONIBILIDAD", "L2"],
  [LINEA_INICIAR]: ["L4", "L4.", "INICIAR EMPRENDIMIENTO"],
  [LINEA_POTENCIAR]: ["PE", "POTENCIAR EMPRENDIMIENTO"],
};
