import ExcelJS from "exceljs";

/* Excel (.xlsx) de Córdoba me capacita con datos NOMINALES: lo genera el servidor y solo lo reciben los perfiles completo y admin
   (ver /api/cmc/exportar). */
export interface ColumnaXlsx { clave: string; titulo: string; ancho: number; tipo?: "fecha" }

const aFecha = (v: unknown): Date | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v instanceof Date ? v.toISOString() : String(v ?? ""));
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12)) : null;   // al mediodía UTC: el día no cambia por la zona horaria
};

export async function armarExcelCmc(d: { hoja: string; alcance: string; columnas: ColumnaXlsx[]; filas: Record<string, unknown>[]; usuario: string; fecha: string }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Tablero Córdoba me capacita";
  const hoja = wb.addWorksheet(d.hoja, { views: [{ state: "frozen", ySplit: 1 }] });
  hoja.columns = d.columnas.map(c => ({ header: c.titulo, key: c.clave, width: c.ancho }));
  for (const f of d.filas) hoja.addRow(Object.fromEntries(d.columnas.map(c => [c.clave, c.tipo === "fecha" ? aFecha(f[c.clave]) : f[c.clave] ?? null])));
  const cab = hoja.getRow(1);
  cab.font = { bold: true, color: { argb: "FFFFFFFF" } };
  cab.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B4680" } };
  cab.alignment = { vertical: "middle", wrapText: true };
  d.columnas.forEach((c, i) => { if (c.tipo === "fecha") hoja.getColumn(i + 1).numFmt = "dd/mm/yyyy"; });
  if (d.filas.length) hoja.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: d.columnas.length } };
  const info = wb.addWorksheet("Detalle");
  info.columns = [{ width: 24 }, { width: 70 }];
  info.addRows([["Alcance", d.alcance], ["Filas", d.filas.length], ["Generado", d.fecha], ["Generado por", d.usuario],
    ["Aviso", "Información confidencial: contiene datos personales. Uso interno del Ministerio de Desarrollo Social y Promoción del Empleo."]]);
  info.getColumn(1).font = { bold: true };
  return Buffer.from(await wb.xlsx.writeBuffer());
}
