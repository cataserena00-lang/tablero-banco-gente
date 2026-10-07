import { etiquetaColumna, periodo } from "@/lib/personasComun";
import { ALTO_PIE, COLOR, cabecera, crearDocumento, envolver, franja, limpiarTexto, pies } from "@/lib/pdfMarca";

/* PDF de la ficha de una persona: datos fijos y una tarjeta por solicitud, de la más reciente a la más antigua.
   Se arma en el servidor, solo para el perfil "completo" (ver app/api/personas/[id]/exportar). */

type Valor = string | number | null | undefined;
export interface DatosFicha {
  persona: Record<string, Valor>; solicitudes: Record<string, Valor>[]; usuario: string; fecha: string;
}

const FIJOS = ["cuil", "nro_doc", "departamento", "localidad", "solicitudes"];
const A4: [number, number] = [595.28, 841.89];
const MARGEN = 40, TAM = 9.5, LINEA = 13.5, PAD = 8;

export async function generarPdfFicha(d: DatosFicha): Promise<Uint8Array> {
  const m = await crearDocumento(`Ficha — ${limpiarTexto(d.persona.nombre)}`);
  const { pdf, regular, semi, negrita } = m;
  const util = A4[0] - MARGEN * 2;
  const paginas = [pdf.addPage(A4)];
  let pag = paginas[0];
  let y = cabecera(m, pag, MARGEN, "Ficha de persona", `Generada el ${limpiarTexto(d.fecha)} por ${limpiarTexto(d.usuario)}`) - 10;
  const piso = MARGEN + ALTO_PIE;
  const nueva = () => { pag = pdf.addPage(A4); paginas.push(pag); franja(pag); y = A4[1] - MARGEN - 6; };

  // Nombre
  envolver(limpiarTexto(d.persona.nombre), negrita, 15, util).forEach(l => {
    pag.drawText(l, { x: MARGEN, y: y - 15, size: 15, font: negrita, color: COLOR.azul }); y -= 20;
  });
  y -= 4;

  // Pares etiqueta / valor; devuelve la altura que ocupa. `dibujar=false` solo mide.
  // La columna de etiquetas se ajusta a la etiqueta más larga (y si no entra, la etiqueta se parte en renglones).
  const bloque = (pares: [string, string][], x: number, ancho: number, dibujar: boolean, yIni: number) => {
    const maxEtiqueta = Math.max(0, ...pares.map(([k]) => semi.widthOfTextAtSize(limpiarTexto(k), 8.5)));
    const col = Math.min(ancho * 0.5, Math.max(110, maxEtiqueta + 16));
    let yy = yIni;
    for (const [k, v] of pares) {
      const etiqueta = envolver(limpiarTexto(k), semi, 8.5, col - 10);
      const lineas = envolver(v, regular, TAM, ancho - col - 6);
      if (dibujar) {
        etiqueta.forEach((l, i) => pag.drawText(l, { x, y: yy - TAM - i * LINEA, size: 8.5, font: semi, color: COLOR.gris }));
        lineas.forEach((l, i) => pag.drawText(l, { x: x + col, y: yy - TAM - i * LINEA, size: TAM, font: regular, color: COLOR.texto }));
      }
      yy -= Math.max(etiqueta.length, lineas.length) * LINEA + 2;
    }
    return yIni - yy;
  };
  const pares = (o: Record<string, Valor>, claves: string[]): [string, string][] =>
    claves.filter(k => o[k] !== null && o[k] !== undefined && o[k] !== "").map(k => [etiquetaColumna(k), limpiarTexto(o[k])]);

  const fijos = pares(d.persona, FIJOS);
  const hFijos = bloque(fijos, 0, util - PAD * 2, false, 0) + PAD * 2;
  pag.drawRectangle({ x: MARGEN, y: y - hFijos, width: util, height: hFijos, color: COLOR.zebra, borderColor: COLOR.linea, borderWidth: 0.6 });
  bloque(fijos, MARGEN + PAD, util - PAD * 2, true, y - PAD);
  y -= hFijos + 16;

  const n = d.solicitudes.length;
  pag.drawText(`${n} ${n === 1 ? "solicitud" : "solicitudes"}, de la más reciente a la más antigua`,
    { x: MARGEN, y: y - 10, size: 10.5, font: negrita, color: COLOR.primario });
  y -= 22;

  d.solicitudes.forEach((s, i) => {
    const claves = Object.keys(s).filter(k => !["nombre", "cuil", "nro_doc", "departamento", "localidad", "ano", "mes"].includes(k));
    const filas = pares(s, claves);
    const alto = bloque(filas, 0, util - PAD * 2, false, 0) + PAD * 2 + 20;
    if (y - alto < piso) nueva();
    pag.drawRectangle({ x: MARGEN, y: y - alto, width: util, height: alto, borderColor: COLOR.linea, borderWidth: 0.8 });
    pag.drawRectangle({ x: MARGEN, y: y - alto, width: 3, height: alto, color: i === 0 ? COLOR.primario : COLOR.celeste });
    pag.drawText(`${periodo(s.ano, s.mes)}${i === 0 && n > 1 ? "  ·  última" : ""}`,
      { x: MARGEN + PAD + 2, y: y - PAD - 10, size: 10.5, font: negrita, color: COLOR.azul });
    bloque(filas, MARGEN + PAD + 2, util - PAD * 2 - 2, true, y - PAD - 20);
    y -= alto + 10;
  });

  pies(m, paginas, MARGEN);
  return pdf.save();
}
