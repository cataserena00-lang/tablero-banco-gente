import ExcelJS from "exceljs";
import type { Celda, ColumnaPend } from "@/lib/pendientes";

/* Arma el Excel (.xlsx) con los créditos pendientes de una zona. Datos nominales: lo genera el servidor y solo lo reciben
   los perfiles completo y admin (ver /api/pendientes/exportar). */

// Los nombres de columna de la base van sin tildes ni mayúsculas: se restituyen los más comunes
const TITULOS: Record<string, string> = {
  barrio: "Barrio (depurado)", circuito: "Circuito", linea_oficial: "Línea (oficial)", linea: "Línea", cuil: "CUIL", cuit: "CUIT", dni: "DNI",
  nro_doc: "Nro. de documento", fecha_aprobacion: "Fecha de aprobación", ano: "Año",
};
export const titulo = (c: string) => TITULOS[c] ?? (c.charAt(0).toUpperCase() + c.slice(1).replace(/_/g, " "));

/** Fechas de la base ("2026-01-05" o Date) como fecha de Excel, al mediodía UTC para que no cambie el día por la zona horaria. */
function aFecha(v: Celda): Date | null {
  if (v instanceof Date) return new Date(Date.UTC(v.getFullYear(), v.getMonth(), v.getDate(), 12));
  const m = typeof v === "string" ? /^(\d{4})-(\d{2})-(\d{2})/.exec(v) : null;
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12)) : null;
}

export async function armarExcel(d: { zona: string; columnas: ColumnaPend[]; filas: Record<string, Celda>[]; usuario: string; fecha: string }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Tablero Banco de la Gente";
  const hoja = wb.addWorksheet("Pendientes", { views: [{ state: "frozen", ySplit: 1 }] });
  hoja.columns = d.columnas.map(c => {
    const largo = Math.max(titulo(c.nombre).length, ...d.filas.slice(0, 200).map(f => String(f[c.nombre] ?? "").length));
    return { header: titulo(c.nombre), key: c.nombre, width: Math.min(42, Math.max(10, largo + 2)) };
  });
  for (const f of d.filas) {
    hoja.addRow(Object.fromEntries(d.columnas.map(c => [c.nombre, c.tipo === "date" ? aFecha(f[c.nombre]) : f[c.nombre] ?? null])));
  }
  const cab = hoja.getRow(1);
  cab.font = { bold: true, color: { argb: "FFFFFFFF" } };
  cab.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F3A63" } };
  cab.alignment = { vertical: "middle", wrapText: true };
  d.columnas.forEach((c, i) => {
    const col = hoja.getColumn(i + 1);
    if (c.tipo === "date") col.numFmt = "dd/mm/yyyy";
    else if (c.tipo === "double precision") col.numFmt = /monto|importe|valor|cuota/i.test(c.nombre) ? "#,##0" : "0";   // sin notación científica en CUIL/DNI
  });
  if (d.filas.length) hoja.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: d.columnas.length } };

  const info = wb.addWorksheet("Detalle");
  info.columns = [{ width: 24 }, { width: 70 }];
  info.addRows([
    ["Zona", d.zona], ["Créditos pendientes de entrega", d.filas.length], ["Generado", d.fecha], ["Generado por", d.usuario],
    ["Aviso", "Información confidencial: contiene datos personales. Uso interno del Banco de la Gente."],
  ]);
  info.getColumn(1).font = { bold: true };
  return Buffer.from(await wb.xlsx.writeBuffer());
}
