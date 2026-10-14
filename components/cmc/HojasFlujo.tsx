"use client";
import { Fragment, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CabeceraHojaCmc, PieHoja } from "../Marca";

/* Hojas A4 con contenido que fluye: se mide cada bloque con los estilos reales, se reparten en páginas llenando cada una y las tablas
   largas se parten por filas (con el encabezado repetido y sin dejar filas sueltas en la última hoja). Así no quedan hojas casi vacías
   con un solo dato. Solo se usa al imprimir. */

export type Bloque =
  | { id: string; nodo: ReactNode }
  | { id: string; tabla: { titulo: ReactNode; continuacion: ReactNode; cabecera: ReactNode; filas: ReactNode[]; pie?: ReactNode } };

type Trozo = { id: string; nodo?: ReactNode; tabla?: { desde: number; hasta: number; conTitulo: boolean; conPie: boolean; bloque: Extract<Bloque, { tabla: unknown }> } };
const MIN_FILAS = 4;        // una tabla no empieza ni termina con menos filas que estas (salvo que tenga menos)
const MARGEN = 0.985;        // un poco de aire para diferencias entre pantalla e impresión

/** Reparte los bloques (con sus alturas medidas) en páginas. Función pura: se prueba sola. */
export function repartir(alturas: Map<string, { total: number; filas?: number[]; fijo?: number; pie?: number }>, bloques: Bloque[], capacidad: number): { paginas: Trozo[][]; llenado: number } {
  const cap = capacidad * MARGEN;
  const paginas: Trozo[][] = [[]];
  let resto = cap;
  const nueva = () => { paginas.push([]); resto = cap; };
  const vacia = () => paginas[paginas.length - 1].length === 0;
  for (const b of bloques) {
    const m = alturas.get(b.id)!;
    if (!("tabla" in b)) {
      if (m.total > resto && !vacia()) nueva();
      paginas[paginas.length - 1].push({ id: b.id, nodo: b.nodo });
      resto -= m.total;
      continue;
    }
    const filas = m.filas ?? [], n = filas.length, fijo = m.fijo ?? 0, pie = m.pie ?? 0;
    let i = 0;
    while (i < n) {
      const primera = i === 0;
      // cuántas filas entran en lo que queda de la página (si es el final de la tabla, también tiene que entrar el pie)
      let cuantas = 0, usado = fijo;
      while (i + cuantas < n && usado + filas[i + cuantas] <= resto) { usado += filas[i + cuantas]; cuantas++; }
      if (i + cuantas === n && usado + pie > resto) cuantas = Math.max(0, cuantas - 1);
      const faltan = n - i;
      if (cuantas < Math.min(MIN_FILAS, faltan) && !vacia()) { nueva(); continue; }
      if (cuantas < faltan && faltan - cuantas < MIN_FILAS) cuantas = Math.max(1, faltan - MIN_FILAS);   // que la última hoja no quede con una o dos filas sueltas
      cuantas = Math.max(1, cuantas);
      const hasta = i + cuantas;
      paginas[paginas.length - 1].push({ id: b.id, tabla: { desde: i, hasta, conTitulo: primera, conPie: hasta === n, bloque: b } });
      resto -= fijo + filas.slice(i, hasta).reduce((a, x) => a + x, 0) + (hasta === n ? pie : 0);
      i = hasta;
      if (i < n) nueva();
    }
  }
  return { paginas: paginas.filter(p => p.length), llenado: (cap - resto) / cap };
}

/** Prueba el bloque `movible` (la tabla de detalle) en cada posición y se queda con la que da menos hojas y, a igual cantidad, la última hoja más llena:
    así no queda una hoja final con unas pocas filas o un solo gráfico. Ante empate, prefiere el orden natural (la tabla al final). */
export function mejorReparto(alturas: Map<string, { total: number; filas?: number[]; fijo?: number; pie?: number }>, bloques: Bloque[], capacidad: number, movible?: string) {
  const k = movible ? bloques.findIndex(b => b.id === movible) : -1;
  if (k < 0) return repartir(alturas, bloques, capacidad).paginas;
  const resto = bloques.filter((_, i) => i !== k), tabla = bloques[k];
  let mejor: { paginas: Trozo[][]; llenado: number } | null = null;
  for (let pos = resto.length; pos >= 2; pos--) {   // desde el final hasta justo después del título y los indicadores
    const orden = [...resto.slice(0, pos), tabla, ...resto.slice(pos)];
    const r = repartir(alturas, orden, capacidad);
    if (!mejor || r.paginas.length < mejor.paginas.length || (r.paginas.length === mejor.paginas.length && r.llenado > mejor.llenado + 0.02)) mejor = r;
  }
  return mejor!.paginas;
}

function Tabla({ b, desde, hasta, conTitulo, conPie }: { b: Extract<Bloque, { tabla: unknown }>; desde: number; hasta: number; conTitulo: boolean; conPie: boolean }) {
  const t = b.tabla;
  return (
    <div>
      <div data-t>{conTitulo ? t.titulo : t.continuacion}</div>
      <div className="tabla-detalle"><table>
        <thead>{t.cabecera}</thead>
        <tbody>{t.filas.slice(desde, hasta)}</tbody>
        {conPie && t.pie}
      </table></div>
    </div>
  );
}

export default function HojasFlujo({ bloques, actualizado, detalle, movible }: { bloques: Bloque[]; actualizado: string; detalle: string; movible?: string }) {
  const [paginas, setPaginas] = useState<Trozo[][] | null>(null);
  const medRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const raiz = medRef.current;
    if (!raiz) return;
    const alto = (el: Element | null) => {
      if (!el) return 0;
      const e = el as HTMLElement, cs = getComputedStyle(e);
      return e.getBoundingClientRect().height + (parseFloat(cs.marginTop) || 0) + (parseFloat(cs.marginBottom) || 0);
    };
    const alturas = new Map<string, { total: number; filas?: number[]; fijo?: number; pie?: number }>();
    raiz.querySelectorAll<HTMLElement>("[data-b]").forEach(el => {
      const id = el.dataset.b!, total = alto(el);
      const filas = [...el.querySelectorAll("tbody tr")].map(tr => alto(tr));
      if (el.querySelector("table")) {
        const pie = alto(el.querySelector("tfoot"));
        alturas.set(id, { total, filas, pie, fijo: total - filas.reduce((a, x) => a + x, 0) - pie });
      } else alturas.set(id, { total });
    });
    // Alto útil de una hoja: A4 menos cabecera, pie, relleno y bordes de la tarjeta
    const hoja = raiz.querySelector<HTMLElement>("[data-hoja]")!;
    const cab = alto(hoja.querySelector(".hoja-cab")), pie = alto(hoja.querySelector(".hoja-pie"));
    const tarjeta = hoja.querySelector<HTMLElement>(".card")!, cst = getComputedStyle(tarjeta), hst = getComputedStyle(hoja);
    const quimera = (parseFloat(cst.paddingTop) || 0) + (parseFloat(cst.paddingBottom) || 0) + (parseFloat(cst.borderTopWidth) || 0) + (parseFloat(cst.borderBottomWidth) || 0);
    const mm = (v: number) => (v * 96) / 25.4;
    const capacidad = mm(296) - cab - pie - (parseFloat(hst.paddingBottom) || 0) - quimera;
    setPaginas(mejorReparto(alturas, bloques, capacidad, movible));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {paginas === null && typeof document !== "undefined" && createPortal(
        <div className="medicion-hojas" ref={medRef} aria-hidden="true">
          <div className="hoja hoja-flujo hoja-panorama" data-hoja>
            <CabeceraHojaCmc actualizado={actualizado} detalle={detalle} />
            <section className="card acto-ficha">
              {bloques.map(b => (
                <div key={b.id} data-b={b.id} style={{ display: "flow-root" }}>
                  {"tabla" in b ? <Tabla b={b} desde={0} hasta={b.tabla.filas.length} conTitulo conPie /> : b.nodo}
                </div>
              ))}
            </section>
            <PieHoja />
          </div>
        </div>, document.body)}
      {paginas?.map((p, i) => (
        <div className="hoja hoja-flujo hoja-panorama" key={i}>
          <CabeceraHojaCmc actualizado={actualizado} detalle={detalle} />
          <section className="card acto-ficha">
            {p.map((t, j) => (
              <Fragment key={`${t.id}-${j}`}>
                {t.tabla ? <Tabla b={t.tabla.bloque} desde={t.tabla.desde} hasta={t.tabla.hasta} conTitulo={t.tabla.conTitulo} conPie={t.tabla.conPie} /> : t.nodo}
              </Fragment>
            ))}
          </section>
          <PieHoja />
        </div>
      ))}
    </>
  );
}
