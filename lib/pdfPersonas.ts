import { PDFFont, rgb } from "pdf-lib";
import { etiquetaColumna } from "@/lib/personasComun";
import { COLOR, cabecera, crearDocumento, envolver, franja, limpiarTexto, pies } from "@/lib/pdfMarca";

/* Arma el PDF de personas en el servidor (pdf-lib). Marca, tipografía (Poppins) y pie: lib/pdfMarca.ts. */
export { envolver, limpiarTexto };

type Valor = string | number | null | undefined;
export interface DatosPdf {
  columnas: string[]; filas: Record<string, Valor>[]; filtros: string[]; usuario: string; fecha: string;
}

const { azul: AZUL, gris: GRIS, zebra: ZEBRA, linea: LINEA } = COLOR;
const TAM = 8, TAM_ENC = 8.5, INTERLINEA = 1.3, PAD = 3, MARGEN = 32;

/** Anchos por columna según el contenido (muestra de filas), repartidos para ocupar el ancho útil. */
export function anchosColumnas(columnas: string[], filas: DatosPdf["filas"], fuente: PDFFont, util: number): number[] {
  const muestra = filas.length > 400 ? filas.filter((_, i) => i % Math.ceil(filas.length / 400) === 0) : filas;
  const ideal = columnas.map(c => {
    let max = fuente.widthOfTextAtSize(limpiarTexto(etiquetaColumna(c)), TAM_ENC);
    for (const f of muestra) max = Math.max(max, fuente.widthOfTextAtSize(limpiarTexto(f[c]), TAM));
    return Math.min(max, 190) + PAD * 2 + 2;
  });
  const suma = ideal.reduce((a, b) => a + b, 0);
  if (suma <= util) {            // sobra lugar: se reparte proporcional
    const k = util / suma;
    return ideal.map(a => a * k);
  }
  const minimo = 42;             // falta lugar: se achican proporcionalmente (con un piso) y el texto se envuelve
  let anchos = ideal.map(a => Math.max(minimo, a * util / suma));
  const exceso = anchos.reduce((a, b) => a + b, 0) - util;
  if (exceso > 0) {
    const flex = anchos.filter(a => a > minimo).reduce((a, b) => a + (b - minimo), 0);
    anchos = anchos.map(a => a > minimo ? a - exceso * ((a - minimo) / (flex || 1)) : a);
  }
  return anchos;
}

export async function generarPdfPersonas(d: DatosPdf): Promise<Uint8Array> {
  const marca = await crearDocumento("Personas — Banco de la Gente");
  const { pdf, regular: fuente, semi: negrita } = marca;

  const [aP, hP] = d.columnas.length > 8 ? [1190.55, 841.89] : [841.89, 595.28];   // A3 o A4 apaisado
  const util = aP - MARGEN * 2;
  const anchos = anchosColumnas(d.columnas, d.filas, fuente, util);
  const alto = (n: number) => n * TAM * INTERLINEA + PAD * 2;
  const altoEnc = TAM_ENC * INTERLINEA + PAD * 2;

  const paginas: ReturnType<typeof pdf.addPage>[] = [];
  let pag = pdf.addPage([aP, hP]);
  paginas.push(pag);
  let y = hP - MARGEN;

  // Cabecera de la primera página: logo, título y datos de la exportación
  y = cabecera(marca, pag, MARGEN, "Personas", "Banco de la Gente · créditos y solicitudes");
  const info = [`${d.filas.length} ${d.filas.length === 1 ? "persona" : "personas"}`, `Generado el ${limpiarTexto(d.fecha)} por ${limpiarTexto(d.usuario)}`,
    `Filtros: ${d.filtros.length ? d.filtros.map(limpiarTexto).join(" · ") : "ninguno"}`];
  for (const l of info.flatMap(t => envolver(t, fuente, 9, util))) {
    pag.drawText(l, { x: MARGEN, y: y - 9, size: 9, font: fuente, color: GRIS }); y -= 12;
  }
  y -= 6;

  const encabezado = () => {
    pag.drawRectangle({ x: MARGEN, y: y - altoEnc, width: util, height: altoEnc, color: AZUL });
    let x = MARGEN;
    d.columnas.forEach((c, i) => {
      const t = envolver(limpiarTexto(etiquetaColumna(c)), negrita, TAM_ENC, anchos[i] - PAD * 2)[0];
      pag.drawText(t, { x: x + PAD, y: y - altoEnc + PAD + 1.5, size: TAM_ENC, font: negrita, color: rgb(1, 1, 1) });
      x += anchos[i];
    });
    y -= altoEnc;
  };
  encabezado();

  const piso = MARGEN + 22;
  d.filas.forEach((fila, idx) => {
    const celdas = d.columnas.map((c, i) => envolver(limpiarTexto(fila[c]), fuente, TAM, anchos[i] - PAD * 2));
    const h = alto(Math.max(...celdas.map(c => c.length)));
    if (y - h < piso) {
      pag = pdf.addPage([aP, hP]); paginas.push(pag); franja(pag); y = hP - MARGEN; encabezado();
    }
    if (idx % 2 === 1) pag.drawRectangle({ x: MARGEN, y: y - h, width: util, height: h, color: ZEBRA });
    let x = MARGEN;
    celdas.forEach((lineas, i) => {
      lineas.forEach((l, k) => pag.drawText(l, { x: x + PAD, y: y - PAD - TAM - k * TAM * INTERLINEA + 1.5, size: TAM, font: fuente, color: rgb(0.1, 0.1, 0.1) }));
      x += anchos[i];
    });
    pag.drawLine({ start: { x: MARGEN, y: y - h }, end: { x: MARGEN + util, y: y - h }, thickness: 0.3, color: LINEA });
    y -= h;
  });

  pies(marca, paginas, MARGEN);
  return pdf.save();
}
