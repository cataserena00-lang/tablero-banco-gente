"use client";
import type { Antiguedad } from "@/lib/acto";
import type { ResumenEstados } from "@/lib/estadosAgregados";
import { fmtF, miles, nombreDep, nombreLinea, peso } from "@/lib/formato";
import { CabeceraHoja, PieHoja } from "./Marca";
import ResumenEstadosVista from "./ResumenEstadosVista";

/* Hojas impresas del resumen general (panorama): cuatro páginas A4 con cabecera y pie de marca, pensadas para "Guardar como PDF"
   desde el diálogo de impresión del navegador (el mismo mecanismo que las fichas de zona).
     1. Pendientes de entrega: indicadores, evolución por mes de aprobación, líneas y espera de entrega.
     2. Ranking de departamentos (con el estado que pinta el mapa).
     3. Todas las solicitudes por estado y por línea.
     4. Evolución mensual de todas las solicitudes y detalle de cada estado.
   Reflejan los filtros activos en pantalla (fechas, mes, estado del mapa). Solo agregados: lo ven los dos perfiles. */

type Par = { n: number; m: number };
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const millones = (n: number) => `$ ${(n / 1e6).toLocaleString("es-AR", { maximumFractionDigits: 1 })} M`;   // montos en las tablas angostas de la hoja 1
const pct = (parte: number, todo: number) => (todo ? ((parte / todo) * 100).toFixed(1).replace(".", ",") + " %" : "—");
const anchoBarra = (parte: number, todo: number) => `${todo ? Math.max(2, (parte / todo) * 100) : 0}%`;

export interface DatosHojasPanorama {
  actualizado: string;                    // fecha ISO de la base de pendientes
  filtros: string[];                      // filtros activos, en texto (los mismos chips de la pantalla)
  desde: string; hasta: string;           // rango de fechas de aprobación aplicado a los pendientes
  tot: Par;                               // pendientes con el filtro de fechas
  espera: Antiguedad | null;
  barras: [string, Par][];                // pendientes por mes de aprobación
  metG: "n" | "m";                        // métrica con la que se ve el gráfico mensual en pantalla
  pendPorLinea: [string, Par][];
  ranking: [string, Par][];               // departamentos, en el orden de la pantalla
  sinDatos: Par;                          // sin departamento asignado
  verEstado: boolean;                     // el mapa muestra un estado de la base de solicitudes (no los pendientes)
  conMonto: boolean;                      // el monto de lo que se muestra es dinero (no solo lo solicitado)
  metRank: "n" | "m";                     // métrica por la que se ordena el ranking
  nombreEstado: string;                   // estado que pinta el mapa
  resumenPais: ResumenEstados | null;     // todas las solicitudes, por estado
  fechaEstados?: string;                  // fecha de la base de solicitudes
}

/** Columnas por mes de aprobación, fijas (sin tooltip ni clics) para la hoja impresa. */
function GraficoMensualFijo({ barras, met }: { barras: [string, Par][]; met: "n" | "m" }) {
  const W = 720, H = 200, pl = 66, pr = 8, pt = 12, pb = 28;
  const max = Math.max(1, ...barras.map(b => b[1][met]));
  const pasos = 4, bw = (W - pl - pr) / Math.max(1, barras.length), paso = Math.max(1, Math.ceil(52 / bw));
  const tick = (v: number) => met === "m"
    ? (v >= 1e6 ? "$ " + miles(v / 1e6) + " M" : v >= 1e3 ? "$ " + miles(v / 1e3) + " mil" : peso(v))
    : miles(v);
  return (
    <div className="viz-columnas">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Gráfico de columnas: créditos pendientes por mes de aprobación">
        {Array.from({ length: pasos + 1 }, (_, i) => {
          const y = pt + (H - pt - pb) * (1 - i / pasos);
          return <g key={i}><line className="guia" x1={pl} x2={W - pr} y1={y} y2={y} />
            <text className="eje" x={pl - 8} y={y + 4} textAnchor="end">{tick((max * i) / pasos)}</text></g>;
        })}
        {barras.map(([k, v], i) => {
          const h = (H - pt - pb) * (v[met] / max);
          return (
            <g key={k}>
              <rect className="barra" x={pl + i * bw + bw * 0.18} y={H - pb - h} width={bw * 0.64} height={Math.max(h, v[met] ? 1 : 0)} rx={2} />
              {i % paso === 0 && <text className="eje" x={pl + i * bw + bw / 2} y={H - 10} textAnchor="middle">{MESES[+k.slice(5) - 1]} {k.slice(2, 4)}</text>}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default function HojasPanorama(d: DatosHojasPanorama) {
  const act = fmtF(d.actualizado);
  const unidad = d.verEstado ? "Solicitudes" : "Créditos";
  const totalRank = d.ranking.reduce((a, [, v]) => ({ n: a.n + v.n, m: a.m + v.m }), { n: d.sinDatos.n, m: d.sinDatos.m });
  const base = totalRank[d.metRank];
  const hayFiltros = d.filtros.length > 0;

  return (
    <>
      {/* 1. Pendientes de entrega */}
      <div className="hoja hoja-panorama">
        <CabeceraHoja actualizado={act} />
        <section className="card acto-ficha" aria-label="Pendientes de entrega">
          <header><div>
            <p className="zona-etiqueta">Resumen general</p>
            <h2>Créditos pendientes de entrega</h2>
            <p className="sub">Aprobados con fecha entre el {fmtF(d.desde)} y el {fmtF(d.hasta)}{hayFiltros ? ` · Filtros: ${d.filtros.join(" · ")}` : " · Sin otros filtros"}</p>
          </div></header>
          <div className="kpis kpis-4">
            <div className="kpi"><span>Créditos pendientes</span><b>{miles(d.tot.n)}</b><small>aprobados, sin entregar</small></div>
            <div className="kpi dest"><span>Monto total a entregar</span><b>{peso(d.tot.m)}</b><small>suma de montos prestables</small></div>
            <div className="kpi"><span>Monto promedio</span><b>{d.tot.n ? peso(d.tot.m / d.tot.n) : "—"}</b><small>por crédito</small></div>
            <div className="kpi"><span>Espera de entrega</span>
              <b className="chico">{d.espera && d.tot.m ? `${((d.espera.tramos[3].m / d.tot.m) * 100).toFixed(0)} % del monto` : "—"}</b>
              <small>{d.espera ? `lleva más de 180 días · promedio ${miles(d.espera.diasPromedio)} ${d.espera.diasPromedio === 1 ? "día" : "días"}` : " "}</small></div>
          </div>

          <h3 className="acto-sub">Créditos pendientes por mes de aprobación</h3>
          <p className="nota acto-rango">{d.barras.length} {d.barras.length === 1 ? "mes" : "meses"} · {d.metG === "m" ? "monto a entregar" : "cantidad de créditos"}</p>
          {d.barras.length > 0 ? <GraficoMensualFijo barras={d.barras} met={d.metG} /> : <p className="nota">No hay créditos pendientes en el período.</p>}

          <div className="hoja-dos-col">
            <div>
              <h3 className="acto-sub">Pendientes por línea</h3>
              <div className="tabla-detalle"><table>
                <caption className="sr-only">Créditos y monto pendientes por línea</caption>
                <thead><tr><th>Línea</th><th className="th-num">Créditos</th><th className="th-num">Monto</th><th className="th-num">% monto</th></tr></thead>
                <tbody>{d.pendPorLinea.map(([l, v]) => (
                  <tr key={l}><td>{nombreLinea(l)}</td><td className="td-num">{miles(v.n)}</td><td className="td-num">{millones(v.m)}</td><td className="td-num">{pct(v.m, d.tot.m)}</td></tr>
                ))}</tbody>
                <tfoot><tr><td><b>Total</b></td><td className="td-num"><b>{miles(d.tot.n)}</b></td><td className="td-num"><b>{millones(d.tot.m)}</b></td><td className="td-num"><b>100 %</b></td></tr></tfoot>
              </table></div>
            </div>
            {d.espera && (
              <div>
                <h3 className="acto-sub">Espera de entrega</h3>
                <div className="tabla-detalle"><table>
                  <caption className="sr-only">Créditos pendientes por tiempo desde la aprobación</caption>
                  <thead><tr><th>Desde la aprobación</th><th className="th-num">Créditos</th><th className="th-num">Monto</th><th className="th-num">% créd.</th></tr></thead>
                  <tbody>{d.espera.tramos.map(t => (
                    <tr key={t.id}><td>{t.etiqueta}</td><td className="td-num">{miles(t.n)}</td><td className="td-num">{millones(t.m)}</td><td className="td-num">{pct(t.n, d.tot.n)}</td></tr>
                  ))}</tbody>
                </table></div>
              </div>
            )}
          </div>
          <p className="nota">Montos de las dos tablas en millones de pesos (M). Es una foto de la base al {act}: los créditos que se entregan desaparecen en la próxima actualización.</p>
        </section>
        <PieHoja />
      </div>

      {/* 2. Ranking de departamentos */}
      <div className="hoja hoja-panorama">
        <CabeceraHoja actualizado={act} />
        <section className="card acto-ficha" aria-label="Ranking de departamentos">
          <header><div>
            <p className="zona-etiqueta">Resumen general</p>
            <h2>Ranking de departamentos</h2>
            <p className="sub">{d.nombreEstado} · ordenado por {d.metRank === "m" ? "monto" : d.verEstado ? "cantidad de solicitudes" : "cantidad de créditos"}
              {d.verEstado ? "" : ` · aprobados entre el ${fmtF(d.desde)} y el ${fmtF(d.hasta)}`}</p>
          </div></header>
          <div className="tabla-detalle tabla-ranking"><table>
            <caption className="sr-only">Ranking de departamentos</caption>
            <thead><tr><th className="th-num">N.º</th><th>Departamento</th><th className="th-num">{unidad}</th>{d.conMonto && <th className="th-num">Monto</th>}<th className="th-num">% ({d.metRank === "m" ? "monto" : "cantidad"})</th><th aria-hidden="true" /></tr></thead>
            <tbody>
              {d.ranking.map(([k, v], i) => (
                <tr key={k}><td className="td-num">{i + 1}</td><td>{nombreDep(k)}</td><td className="td-num">{miles(v.n)}</td>{d.conMonto && <td className="td-num">{peso(v.m)}</td>}
                  <td className="td-num">{pct(v[d.metRank], base)}</td>
                  <td className="td-barra"><span className="acto-bar" aria-hidden="true"><i style={{ width: anchoBarra(v[d.metRank], d.ranking[0]?.[1][d.metRank] ?? 0) }} /></span></td></tr>
              ))}
              {d.sinDatos.n > 0 && (
                <tr><td /><td>Sin departamento asignado</td><td className="td-num">{miles(d.sinDatos.n)}</td>{d.conMonto && <td className="td-num">{peso(d.sinDatos.m)}</td>}<td className="td-num">{pct(d.sinDatos[d.metRank], base)}</td><td /></tr>
              )}
            </tbody>
            <tfoot><tr><td /><td><b>Total</b></td><td className="td-num"><b>{miles(totalRank.n)}</b></td>{d.conMonto && <td className="td-num"><b>{peso(totalRank.m)}</b></td>}<td className="td-num"><b>100 %</b></td><td /></tr></tfoot>
          </table></div>
          {d.verEstado && !d.conMonto && <p className="nota">En este estado el monto es solo lo solicitado, por eso no se muestra.</p>}
        </section>
        <PieHoja />
      </div>

      {/* 3 y 4. Todas las solicitudes, por estado */}
      {d.resumenPais && (
        <>
          <div className="hoja hoja-panorama">
            <CabeceraHoja actualizado={act} />
            <section className="card acto-ficha" aria-label="Todas las solicitudes, por estado">
              <header><div>
                <p className="zona-etiqueta">Resumen general</p>
                <h2>Todas las solicitudes, por estado</h2>
                <p className="sub">{miles(d.resumenPais.n)} solicitudes de crédito desde el inicio del programa · incluye lo ya pagado y lo cerrado sin desembolso</p>
              </div></header>
              <ResumenEstadosVista resumen={d.resumenPais} fechaDatos={d.fechaEstados} tituloMeses="Solicitudes por mes de todo el programa" interactivo={false} parte="resumen" />
            </section>
            <PieHoja />
          </div>
          <div className="hoja hoja-panorama">
            <CabeceraHoja actualizado={act} />
            <section className="card acto-ficha" aria-label="Evolución mensual y detalle de cada estado">
              <header><div>
                <p className="zona-etiqueta">Resumen general</p>
                <h2>Evolución mensual y detalle por estado</h2>
                <p className="sub">Solicitudes de todo el programa, según el año y el mes de la solicitud</p>
              </div></header>
              <ResumenEstadosVista resumen={d.resumenPais} fechaDatos={d.fechaEstados} tituloMeses="Solicitudes por mes de todo el programa" interactivo={false} parte="evolucion" />
            </section>
            <PieHoja />
          </div>
        </>
      )}
    </>
  );
}
