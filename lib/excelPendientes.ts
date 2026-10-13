import ExcelJS from "exceljs";
import type { Celda, ColumnaPend } from "@/lib/pendientes";

/* Arma el Excel (.xlsx) con los créditos pendientes de una zona. Datos nominales: lo genera el servidor y solo lo reciben
   los perfiles completo y admin (ver /api/pendientes/exportar). */

// Los nombres de columna de la base van sin tildes ni mayúsculas: se restituyen
const TITULOS: Record<string, string> = {
  cuil: "CUIL", sexo: "Sexo", solicitante: "Solicitante", localidad: "Localidad", departamento: "Departamento", telefono: "Teléfono",
  mail: "Mail", linea_oficial: "Línea", monto_credito: "Monto crédito", estado_prestamo: "Estado préstamo", fecha_aprobacion: "Fecha de aprobación",
};
export const titulo = (c: string) => TITULOS[c] ?? (c.charAt(0).toUpperCase() + c.slice(1).replace(/_/g, " "));

/** Fecha de la base como fecha de Excel (al mediodía UTC para que no cambie el día por la zona horaria). La base trae la fecha de
    aprobación de varias formas: número de serie de Excel ("46296"), "2025-11-03 00:00:00" o "03/11/2025". Si no se entiende, null. */
function aFecha(v: Celda): Date | null {
  if (v === null || v === undefined || v === "") return null;
  const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d, 12));
  if (v instanceof Date) return utc(v.getFullYear(), v.getMonth() + 1, v.getDate());
  const t = String(v).trim();
  let m: RegExpExecArray | null;
  if ((m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t))) return utc(+m[1], +m[2], +m[3]);
  if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(t))) return utc(+m[3], +m[2], +m[1]);
  if (/^\d{5}(\.\d+)?$/.test(t)) return new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(t)) * 86_400_000 + 12 * 3_600_000);   // serie de Excel
  return null;
}
const esFecha = (c: ColumnaPend) => c.tipo === "date" || c.nombre.startsWith("fecha");

export async function armarExcel(d: { zona: string; columnas: ColumnaPend[]; filas: Record<string, Celda>[]; usuario: string; fecha: string }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Tablero Banco de la Gente";
  const hoja = wb.addWorksheet("Pendientes", { views: [{ state: "frozen", ySplit: 1 }] });
  hoja.columns = d.columnas.map(c => {
    const largo = Math.max(titulo(c.nombre).length, ...d.filas.slice(0, 200).map(f => String(f[c.nombre] ?? "").length));
    return { header: titulo(c.nombre), key: c.nombre, width: Math.min(42, Math.max(10, largo + 2)) };
  });
  for (const f of d.filas) {
    hoja.addRow(Object.fromEntries(d.columnas.map(c => [c.nombre, esFecha(c) ? aFecha(f[c.nombre]) : f[c.nombre] ?? null])));
  }
  const cab = hoja.getRow(1);
  cab.font = { bold: true, color: { argb: "FFFFFFFF" } };
  cab.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F3A63" } };
  cab.alignment = { vertical: "middle", wrapText: true };
  d.columnas.forEach((c, i) => {
    const col = hoja.getColumn(i + 1);
    if (esFecha(c)) col.numFmt = "dd/mm/yyyy";
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
