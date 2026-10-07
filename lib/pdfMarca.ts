import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, PDFFont, PDFImage, PDFPage, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

/* Identidad visual compartida por los PDF que se arman en el servidor (personas, ficha de persona).
   Colores = los del tablero (app/globals.css), muestreados de los logos oficiales (aproximados, a validar con el área).
   Fuente: Poppins incrustada (subconjunto), la misma del tablero; así se ven bien las tildes y la ñ.
   Los archivos se leen del disco: están declarados en next.config.mjs (outputFileTracingIncludes) para que viajen al despliegue. */

export const COLOR = {
  primario: rgb(0xBC / 255, 0x17 / 255, 0x34 / 255),
  celeste: rgb(0x6C / 255, 0xAE / 255, 0xE5 / 255),
  dorado: rgb(0xCF / 255, 0xA5 / 255, 0x5B / 255),
  azul: rgb(0x00 / 255, 0x40 / 255, 0x78 / 255),   // azul institucional del Gobierno
  texto: rgb(0.13, 0.14, 0.16),
  gris: rgb(0.4, 0.4, 0.4),
  zebra: rgb(0.95, 0.96, 0.98),
  linea: rgb(0.8, 0.82, 0.86),
  blanco: rgb(1, 1, 1),
};

export const AVISO_CONFIDENCIAL = "Información confidencial. Uso interno del Banco de la Gente; contiene datos personales (Ley 25.326).";
const MINISTERIO = "Ministerio de Producción, Ciencia e Innovación Tecnológica";

const raiz = process.cwd();
const FUENTES = {
  regular: path.join(raiz, "node_modules/@fontsource/poppins/files/poppins-latin-400-normal.woff"),
  semi: path.join(raiz, "node_modules/@fontsource/poppins/files/poppins-latin-600-normal.woff"),
  negrita: path.join(raiz, "node_modules/@fontsource/poppins/files/poppins-latin-700-normal.woff"),
};
const LOGOS = {
  banco: path.join(raiz, "assets/marca/banco-de-la-gente.png"),
  gobierno: path.join(raiz, "assets/marca/cordoba-gobierno-hacer-para-crecer.png"),
};

// Los archivos no cambian mientras corre el servidor: se leen una sola vez
const cache = new Map<string, Promise<Uint8Array>>();
const leer = (ruta: string) => {
  let p = cache.get(ruta);
  if (!p) { p = readFile(ruta).then(b => new Uint8Array(b)); cache.set(ruta, p); p.catch(() => cache.delete(ruta)); }
  return p;
};

export interface Marca {
  pdf: PDFDocument;
  regular: PDFFont; semi: PDFFont; negrita: PDFFont;
  logoBanco: PDFImage; logoGobierno: PDFImage;
}

/** Documento nuevo con la tipografía y los logos incrustados. */
export async function crearDocumento(titulo: string): Promise<Marca> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setTitle(titulo); pdf.setCreator("Tablero Banco de la Gente"); pdf.setAuthor("Banco de la Gente");
  const [r, s, n, lb, lg] = await Promise.all([FUENTES.regular, FUENTES.semi, FUENTES.negrita, LOGOS.banco, LOGOS.gobierno].map(leer));
  const [regular, semi, negrita] = await Promise.all([r, s, n].map(b => pdf.embedFont(b, { subset: true })));
  const [logoBanco, logoGobierno] = await Promise.all([pdf.embedPng(lb), pdf.embedPng(lg)]);
  return { pdf, regular, semi, negrita, logoBanco, logoGobierno };
}

type Valor = string | number | null | undefined;

/** Texto a una línea, sin saltos; "—" si falta. Lo que Poppins (latin) no tiene se reemplaza por "?" para no romper el PDF. */
export function limpiarTexto(v: Valor): string {
  const s = v === null || v === undefined || v === "" ? "—" : String(v);
  return s.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim()
    .replace(/[^\x20-\x7e\xa0-\xff‐-‧€™]/g, "?");
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

/** Franja de tres colores en el borde superior de la página (la misma del tablero). */
export function franja(pag: PDFPage) {
  const { width, height } = pag.getSize();
  const h = 5, tercio = width / 3;
  [COLOR.primario, COLOR.celeste, COLOR.dorado].forEach((color, i) =>
    pag.drawRectangle({ x: tercio * i, y: height - h, width: tercio + 0.5, height: h, color }));
}

/** Cabecera: franja, logo del Banco a la izquierda y título + subtítulo. Devuelve la `y` donde sigue el contenido. */
export function cabecera(m: Marca, pag: PDFPage, margen: number, titulo: string, subtitulo?: string): number {
  franja(pag);
  const { height } = pag.getSize();
  const altoLogo = 40, anchoLogo = altoLogo * m.logoBanco.width / m.logoBanco.height;
  const top = height - 5 - 14;
  pag.drawImage(m.logoBanco, { x: margen, y: top - altoLogo, width: anchoLogo, height: altoLogo });
  const x = margen + anchoLogo + 14;
  pag.drawText(limpiarTexto(titulo), { x, y: top - 20, size: 16, font: m.negrita, color: COLOR.primario });
  if (subtitulo) pag.drawText(limpiarTexto(subtitulo), { x, y: top - 36, size: 9, font: m.regular, color: COLOR.gris });
  return top - altoLogo - 10;
}

/** Pie en todas las páginas: logo de Gobierno, ministerio, aviso de confidencialidad y "Página X de Y". */
export function pies(m: Marca, paginas: PDFPage[], margen: number, extra?: string) {
  paginas.forEach((p, i) => {
    const { width } = p.getSize();
    const util = width - margen * 2;
    p.drawLine({ start: { x: margen, y: margen + 12 }, end: { x: margen + util, y: margen + 12 }, thickness: 0.6, color: COLOR.dorado });
    const alto = 14, ancho = alto * m.logoGobierno.width / m.logoGobierno.height;
    p.drawImage(m.logoGobierno, { x: margen, y: margen - 4, width: ancho, height: alto });
    const num = `Página ${i + 1} de ${paginas.length}`;
    p.drawText(num, { x: width - margen - m.regular.widthOfTextAtSize(num, 8), y: margen, size: 8, font: m.regular, color: COLOR.gris });
    const medio = [AVISO_CONFIDENCIAL, extra].filter(Boolean).join(" ");
    const x0 = margen + ancho + 12, libre = width - margen - m.regular.widthOfTextAtSize(num, 8) - 12 - x0;
    const lineas = envolver(limpiarTexto(medio), m.regular, 7, libre).slice(0, 2);
    lineas.forEach((l, k) => p.drawText(l, { x: x0, y: margen + 3 - k * 8.5, size: 7, font: m.regular, color: COLOR.gris }));
    if (lineas.length < 2) p.drawText(MINISTERIO, { x: x0, y: margen + 3 - 8.5, size: 7, font: m.regular, color: COLOR.gris });
  });
}
