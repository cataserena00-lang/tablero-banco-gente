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

export function nombreLinea(s: string) {
  const map: Record<string,string> = {
    "LIBRE DISPONIBILIDAD": "Libre Disponibilidad",
    "POTENCIAR EMPRENDIMIENTO": "Potenciar Emprendimiento",
    "PE": "PE",
    "L2": "L2",
    "L4.": "L4",
  };
  return map[s] || s;
}
