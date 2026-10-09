"use client";
import { useEffect, useMemo, useState, type Ref } from "react";
import { fmtF, miles, nombreLinea, peso } from "@/lib/formato";
import { SIN_LINEA, antiguedad, hoyArgentina, type Ficha } from "@/lib/acto";
import type { ResumenEstados } from "@/lib/estadosAgregados";
import ResumenEstadosVista from "./ResumenEstadosVista";

/* Ficha de zona: cantidad, monto, líneas y antigüedad de la aprobación de una zona
   (barrio, localidad o departamento). Solo muestra agregados. */

const pct = (parte: number, todo: number) => (todo ? ((parte / todo) * 100).toFixed(1).replace(".", ",") + " %" : "—");
const anchoBarra = (parte: number, todo: number) => `${todo ? Math.max(2, (parte / todo) * 100) : 0}%`;
export const plural = (n: number, uno: string, varios: string) => `${miles(n)} ${n === 1 ? uno : varios}`;
const textoLinea = (l: string) => (l === SIN_LINEA ? "Sin línea informada" : nombreLinea(l));

export type ModoFicha = "pendientes" | "completos" | "ambos";

export default function FichaZona({ ficha, titulo, sub, notas = [], actualizado, titleRef, id = "ficha-zona-titulo", completa, fechaCompleta, modoFijo }: {
  ficha: Ficha;
  /** Resumen de todos los estados de la zona (departamentos y localidades). Con él aparece el botón «Datos completos». */
  completa?: ResumenEstados | null;
  fechaCompleta?: string;
  /** Fuerza lo que se muestra (por ejemplo "ambos" en las fichas exportadas) y oculta el botón. */
  modoFijo?: ModoFicha;
  titulo: string;
  sub: string;
  notas?: (string | null | undefined | false)[];
  actualizado: string;
  titleRef?: Ref<HTMLHeadingElement>;
  id?: string;
}) {
  const [hoy, setHoy] = useState<string | null>(null);   // se calcula en el navegador: la página es estática
  useEffect(() => { setHoy(hoyArgentina()); }, []);
  const ant = useMemo(() => (hoy ? antiguedad(ficha.fechas, hoy) : null), [ficha, hoy]);
  const [vista, setVista] = useState<"pendientes" | "completos">("pendientes");
  const modo: ModoFicha = completa ? modoFijo ?? vista : "pendientes";
  const verPend = modo !== "completos", verComp = !!completa && modo !== "pendientes";
  const primera = ficha.fechas[0]?.f, ultima = ficha.fechas[ficha.fechas.length - 1]?.f;

  return (
    <section className="card acto-ficha" aria-labelledby={id}>
      <header>
        <div>
          <p className="zona-etiqueta">Ficha de zona</p>
          <h2 id={id} ref={titleRef} tabIndex={-1}>{titulo}</h2>
          <p className="sub">{sub}</p>
        </div>
        {completa && !modoFijo && (
          <div className="seg" role="group" aria-label="Qué mostrar de la zona">
            <button type="button" aria-pressed={vista === "pendientes"} onClick={() => setVista("pendientes")}>Pendientes de entrega</button>
            <button type="button" aria-pressed={vista === "completos"} onClick={() => setVista("completos")}>Datos completos</button>
          </div>
        )}
      </header>

      {!verPend ? null : ficha.n === 0 ? (
        <p className="nota">Esta zona no tiene créditos pendientes en la base actual.</p>
      ) : (
        <>
          <div className="kpis kpis-4">
            <div className="kpi dest"><span>Créditos pendientes</span><b>{miles(ficha.n)}</b></div>
            <div className="kpi"><span>Monto total</span><b>{peso(ficha.m)}</b></div>
            <div className="kpi"><span>Monto promedio</span><b>{peso(ficha.m / ficha.n)}</b></div>
            <div className="kpi"><span>Espera promedio</span>
              <b className="chico">{ant ? plural(ant.diasPromedio, "día", "días") : "—"}</b>
              <small>{ant ? `${pct(ant.tramos[3].n, ficha.n)} con más de 180 días` : "\u00a0"}</small>
            </div>
          </div>

          <h3 className="acto-sub">Por línea</h3>
          <div className="tabla-detalle">
            <table>
              <caption className="sr-only">Créditos y monto por línea</caption>
              <thead><tr><th>Línea</th><th className="th-num">Créditos</th><th className="th-num">Monto</th><th className="th-num col-pct">% del monto</th><th aria-hidden="true" /></tr></thead>
              <tbody>
                {ficha.lineas.map(l => (
                  <tr key={l.linea}>
                    <td>{textoLinea(l.linea)}</td>
                    <td className="td-num">{miles(l.n)}</td>
                    <td className="td-num">{peso(l.m)}</td>
                    <td className="td-num col-pct">{pct(l.m, ficha.m)}</td>
                    <td className="td-barra"><span className="acto-bar" aria-hidden="true"><i style={{ width: anchoBarra(l.m, ficha.m) }} /></span></td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><td><b>Total</b></td><td className="td-num"><b>{miles(ficha.n)}</b></td><td className="td-num"><b>{peso(ficha.m)}</b></td><td className="td-num col-pct"><b>100 %</b></td><td /></tr></tfoot>
            </table>
          </div>

          <h3 className="acto-sub">Antigüedad de la aprobación</h3>
          <p className="nota acto-rango">
            Aprobados entre el {primera ? fmtF(primera) : "—"} y el {ultima ? fmtF(ultima) : "—"}
            {ant ? `. Promedio: ${plural(ant.diasPromedio, "día", "días")} desde la aprobación.` : "."}
          </p>
          {ant && (
            <div className="tabla-detalle">
              <table>
                <caption className="sr-only">Créditos por tiempo desde la aprobación</caption>
                <thead><tr><th>Desde la aprobación</th><th className="th-num">Créditos</th><th className="th-num">Monto</th><th className="th-num col-pct">% de créditos</th><th aria-hidden="true" /></tr></thead>
                <tbody>
                  {ant.tramos.map(t => (
                    <tr key={t.id}>
                      <td>{t.etiqueta}</td>
                      <td className="td-num">{miles(t.n)}</td>
                      <td className="td-num">{peso(t.m)}</td>
                      <td className="td-num col-pct">{pct(t.n, ficha.n)}</td>
                      <td className="td-barra"><span className="acto-bar" aria-hidden="true"><i style={{ width: anchoBarra(t.n, ficha.n) }} /></span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      {verComp && (
        <>
          {verPend && <h3 className="acto-sub acto-sub-grande">Todos los estados</h3>}
          <ResumenEstadosVista resumen={completa!} fechaDatos={fechaCompleta} />
        </>
      )}
      {notas.filter(Boolean).map((n, i) => <p key={i} className="nota">{n}</p>)}
      {verPend && <p className="nota">La ficha muestra todos los créditos pendientes, sin filtro de fecha. Es una foto de la base al {fmtF(actualizado)}: los que se entregan desaparecen en la próxima actualización.</p>}
    </section>
  );
}
