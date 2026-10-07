/* Constantes y etiquetas de la vista de personas que comparten el servidor y el navegador (sin datos).
   Cada fila del listado es una PERSONA con los datos de su última solicitud; las solicitudes anteriores se ven al expandirla. */

export const MAX_EXPORTACION = 5000;
// Columnas del listado. "ultima" no es una columna de la base: se arma con el año y el mes de la última solicitud.
export const COLUMNAS_TABLA = ["nombre", "cuil", "nro_doc", "departamento", "localidad", "estado", "linea", "ultima", "solicitudes"];

const ETIQUETAS: Record<string, string> = {
  nombre: "Nombre", cuil: "CUIL", nro_doc: "Documento", departamento: "Departamento", localidad: "Localidad", estado: "Estado", linea: "Línea",
  nro_formulario: "Formulario", ano: "Año", mes: "Mes", solicitudes: "Solicitudes", ultima: "Última solicitud",
};
export const etiquetaColumna = (c: string) => ETIQUETAS[c] ?? (c.charAt(0).toUpperCase() + c.slice(1).replace(/_/g, " "));

/** "10/2023" a partir del año y el mes de una solicitud; si falta el mes, solo el año; si falta todo, "—". */
export function periodo(ano: unknown, mes: unknown) {
  const a = String(ano ?? "").trim(), m = String(mes ?? "").trim();
  if (!a) return "—";
  const n = Number(m);
  return Number.isInteger(n) && n >= 1 && n <= 12 ? `${String(n).padStart(2, "0")}/${a}` : a;
}
