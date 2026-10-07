/* Constantes y etiquetas de la vista de personas que comparten el servidor y el navegador (sin datos). */

export const MAX_EXPORTACION = 5000;
export const COLUMNAS_TABLA = ["nombre", "cuil", "nro_doc", "departamento", "localidad", "estado", "linea"];

const ETIQUETAS: Record<string, string> = {
  nombre: "Nombre", cuil: "CUIL", nro_doc: "Documento", departamento: "Departamento", localidad: "Localidad", estado: "Estado", linea: "Línea",
};
export const etiquetaColumna = (c: string) => ETIQUETAS[c] ?? (c.charAt(0).toUpperCase() + c.slice(1).replace(/_/g, " "));
