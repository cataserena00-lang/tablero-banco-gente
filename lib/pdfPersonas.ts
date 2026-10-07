import { PDFDocument, PDFFont, StandardFonts, rgb } from "pdf-lib";
import { etiquetaColumna } from "@/lib/personasComun";

/* Arma el PDF de personas en el servidor (pdf-lib, JavaScript puro, sin archivos de fuentes).
   Helvetica estándar solo admite WinAnsi (latin-1 + algunos signos): lo demás se reemplaza por "?". */

type Valor = string | number | null | undefined;
export interface DatosPdf {
  columnas: string[]; filas: Record<string, Valor>[]; filtros: string[]; usuario: string; fecha: string;
}

const AZUL = rgb(0.07, 0.25, 0.45), GRIS = rgb(0.4, 0.4, 0.4), ZEBRA = rgb(0.95, 0.96, 0.98), LINEA = rgb(0.8, 0.82, 0.86);
const TAM = 8, TAM_ENC = 8.5, INTERLINEA = 1.2, PAD = 3, MARGEN = 28;
const AVISO = "Información confidencial. Uso interno del Banco de la Gente; contiene datos personales.";

/** Reemplaza lo que Helvetica (WinAnsi) no puede dibujar y colapsa espacios. */
export function limpiarTexto(v: Valor): string {
  const s = v === null || v === undefined || v === "" ? "—" : String(v);
  return s.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim()
    .replace(/[^\x20-\x7e\xa0-\xff€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]/g, "?");
}

/** Parte un texto en líneas que entran en `ancho`; las palabras muy largas se cortan. */
export function envolver(texto: string, fuente: PDFFont, tam: number, ancho: number): string[] {
  const w = (t: string) => fuente.widthOfTextAtSize(t, tam);
  const lineas: string[] = [];
  let actual = "";
  const empujar = (palabra: string) => {
    if (w(palabra) <= ancho) { actual = palabra; return; }
    let trozo = "";
    for (const ch of palabra) {
      if (w(trozo + ch) > ancho && trozo) { lineas.push(trozo); trozo = ch; } else trozo += ch;
    }
    actual = trozo;
  };
  for (const palabra of texto.split(" ")) {
    if (!actual) { empujar(palabra); continue; }
    if (w(actual + " " + palabra) <= ancho) actual += " " + palabra;
    else { lineas.push(actual); actual = ""; empujar(palabra); }
  }
  if (actual) lineas.push(actual);
  return lineas.length ? lineas : [""];
}

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
  const pdf = await PDFDocument.create();
  pdf.setTitle("Personas — Banco de la Gente"); pdf.setCreator("Tablero Banco de la Gente");
  const fuente = await pdf.embedFont(StandardFonts.Helvetica);
  const negrita = await pdf.embedFont(StandardFonts.HelveticaBold);

  const [aP, hP] = d.columnas.length > 8 ? [1190.55, 841.89] : [841.89, 595.28];   // A3 o A4 apaisado
  const util = aP - MARGEN * 2;
  const anchos = anchosColumnas(d.columnas, d.filas, fuente, util);
  const alto = (n: number) => n * TAM * INTERLINEA + PAD * 2;
  const altoEnc = TAM_ENC * INTERLINEA + PAD * 2;

  const paginas: ReturnType<typeof pdf.addPage>[] = [];
  let pag = pdf.addPage([aP, hP]);
  paginas.push(pag);
  let y = hP - MARGEN;

  // Cabecera de la primera página
  pag.drawText("Banco de la Gente — Personas", { x: MARGEN, y: y - 14, size: 15, font: negrita, color: AZUL });
  y -= 22;
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

  const piso = MARGEN + 16;
  d.filas.forEach((fila, idx) => {
    const celdas = d.columnas.map((c, i) => envolver(limpiarTexto(fila[c]), fuente, TAM, anchos[i] - PAD * 2));
    const h = alto(Math.max(...celdas.map(c => c.length)));
    if (y - h < piso) {
      pag = pdf.addPage([aP, hP]); paginas.push(pag); y = hP - MARGEN; encabezado();
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

  // Pie en todas las páginas: aviso + "Página X de Y"
  paginas.forEach((p, i) => {
    p.drawText(AVISO, { x: MARGEN, y: MARGEN - 6, size: 7.5, font: fuente, color: GRIS });
    const t = `Página ${i + 1} de ${paginas.length}`;
    p.drawText(t, { x: aP - MARGEN - fuente.widthOfTextAtSize(t, 8), y: MARGEN - 6, size: 8, font: fuente, color: GRIS });
  });
  return pdf.save();
}
