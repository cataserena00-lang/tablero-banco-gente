"use client";
import { useMemo } from "react";
import { miles, peso } from "@/lib/formato";
import { CATEGORIAS } from "@/lib/estados";
import { CON_MONTO, PAGADOS, etiquetasSerie, type ResumenEstados } from "@/lib/estadosAgregados";
import { BarrasH, BarraPartes, ColumnasApiladas, colorSerie } from "./graficos";

/* Resumen de todos los estados de una zona (o de todo el programa): cuántas solicitudes hay en cada categoría, el detalle
   por estado, la línea y la evolución mensual. Solo agregados: lo ven los dos perfiles. */

const colorCat = (cat: string) => colorSerie(etiquetasSerie.indexOf(cat));
const MESES_GRAFICO = 24;

export default function ResumenEstadosVista({ resumen, fechaDatos, tituloMeses = "Solicitudes por mes" }: {
  resumen: ResumenEstados; fechaDatos?: string; tituloMeses?: string;
}) {
  const porCat = useMemo(() => new Map(resumen.categorias.map(c => [c.categoria, c])), [resumen]);
  const pagados = useMemo(() => PAGADOS.reduce((a, c) => ({ n: a.n + (porCat.get(c)?.n ?? 0), m: a.m + (porCat.get(c)?.m ?? 0) }), { n: 0, m: 0 }), [porCat]);
  const pendPago = porCat.get("Aprobados pendientes de pago");
  const cerrados = porCat.get("Cerrados sin desembolso");
  const meses = useMemo(() => resumen.meses?.slice(-MESES_GRAFICO) ?? null, [resumen]);
  if (!resumen.n) return <p className="nota">No hay solicitudes registradas para esta zona en la base de personas.</p>;

  return (
    <>
      <div className="kpis kpis-4">
        <div className="kpi"><span>Solicitudes</span><b>{miles(resumen.n)}</b><small>todos los estados</small></div>
        <div className="kpi dest"><span>Pagadas</span><b>{miles(pagados.n)}</b><small>{peso(pagados.m)} · al día, con mora o finalizadas</small></div>
        <div className="kpi"><span>Aprobadas, pendientes de pago</span><b>{miles(pendPago?.n ?? 0)}</b><small>{peso(pendPago?.m ?? 0)}</small></div>
        <div className="kpi"><span>Cerradas sin desembolso</span><b>{miles(cerrados?.n ?? 0)}</b><small>rechazadas, desistidas o dadas de baja</small></div>
      </div>

      <h3 className="acto-sub">Solicitudes por estado</h3>
      <BarrasH total={resumen.n} unidad="solicitudes"
        items={CATEGORIAS.filter(c => porCat.has(c)).concat((porCat.has("Sin clasificar") ? ["Sin clasificar"] : []) as never[]).map(c => {
          const f = porCat.get(c)!;
          return { clave: c, etiqueta: c, valor: f.n, color: colorCat(c), detalle: CON_MONTO.has(c) ? peso(f.m) : undefined };
        })} />
      <details className="viz-todo">
        <summary>Ver el detalle de cada estado</summary>
        <div className="viz-detalle">
        {resumen.categorias.filter(c => c.estados.length > 1 || c.estados[0]?.estado.toUpperCase() !== c.categoria.toUpperCase()).map(c => (
          <details key={c.categoria}>
            <summary><i style={{ background: colorCat(c.categoria) }} aria-hidden="true" />{c.categoria}<span>{miles(c.n)}{CON_MONTO.has(c.categoria) ? ` · ${peso(c.m)}` : ""}</span></summary>
            <ul>
              {c.estados.map(e => <li key={e.estado}><span>{e.estado}</span><b>{miles(e.n)}</b>{CON_MONTO.has(c.categoria) && <small>{peso(e.m)}</small>}</li>)}
            </ul>
          </details>
        ))}
        </div>
      </details>

      {resumen.lineas.length > 0 && (
        <>
          <h3 className="acto-sub">Solicitudes por línea</h3>
          <BarraPartes unidad="solicitudes" items={resumen.lineas.map((l, i) => ({ clave: l.linea, etiqueta: l.linea, valor: l.n, color: l.linea === "Otras líneas" ? "#9aa3b2" : colorSerie(i) }))} />
        </>
      )}

      {meses && meses.length > 1 && (
        <>
          <h3 className="acto-sub">{tituloMeses}</h3>
          <p className="nota acto-rango">Según el año y el mes de la solicitud. Últimos {Math.min(MESES_GRAFICO, meses.length)} meses.</p>
          <ColumnasApiladas meses={meses} titulo={tituloMeses}
            series={etiquetasSerie.map((c, j) => ({ clave: c, etiqueta: c, color: colorSerie(j) })).filter((_, j) => meses.some(m => m.v[j] > 0))} />
        </>
      )}
      <p className="nota">Datos de la base de solicitudes{fechaDatos ? ` al ${fechaDatos.slice(8, 10)}/${fechaDatos.slice(5, 7)}/${fechaDatos.slice(0, 4)}` : ""}. Las aprobadas pendientes de pago pueden no coincidir exactamente con los pendientes de entrega, que salen de otra base.</p>
    </>
  );
}
