"use client";
import { useEffect, useMemo, useState } from "react";
import { miles, peso } from "@/lib/formato";
import { CATEGORIAS } from "@/lib/estados";
import { CON_MONTO, PAGADOS, etiquetasSerie, vistaResumen, type ResumenEstados } from "@/lib/estadosAgregados";
import { BarrasH, BarraPartes, ColumnasApiladas, colorSerie } from "./graficos";

/* Resumen de todos los estados de una zona (o de todo el programa): cuántas solicitudes hay en cada categoría, el detalle
   por estado, la línea y la evolución mensual. Los gráficos se filtran entre sí: tocar una línea cambia las barras de estado
   y tocar un estado cambia las de línea y los meses. Solo agregados: lo ven los dos perfiles. */

const colorCat = (cat: string) => colorSerie(etiquetasSerie.indexOf(cat));
const colorLinea = (linea: string, i: number) => (linea === "Otras líneas" ? "#9aa3b2" : colorSerie(i));
const ATAJOS = [["12", "Últimos 12 meses"], ["24", "Últimos 24 meses"], ["todo", "Todo el período"]] as const;
const etiquetaMes = (k: string) => `${k.slice(5, 7)}/${k.slice(0, 4)}`;

export type ParteResumen = "todo" | "resumen" | "evolucion";

export default function ResumenEstadosVista({ resumen, fechaDatos, tituloMeses = "Solicitudes por mes", interactivo = true, parte = "todo" }: {
  resumen: ResumenEstados; fechaDatos?: string; tituloMeses?: string;
  /** En las hojas impresas se reparte en dos páginas: "resumen" (indicadores, estados y líneas) y "evolucion" (meses y detalle por estado). */
  parte?: ParteResumen;
  /** En las hojas impresas no hay clics: se muestra todo sin filtros. */
  interactivo?: boolean;
}) {
  const [selCat, setSelCat] = useState<string | null>(null);
  const [selLinea, setSelLinea] = useState<string | null>(null);
  const [atajo, setAtajo] = useState<string>("24");
  const [desdeMes, setDesdeMes] = useState("");
  const [hastaMes, setHastaMes] = useState("");
  useEffect(() => { setSelCat(null); setSelLinea(null); setAtajo("24"); }, [resumen]);

  const vista = useMemo(() => vistaResumen(resumen, { categoria: selCat, linea: selLinea }), [resumen, selCat, selLinea]);
  const porCat = useMemo(() => new Map(vista.categorias.map(c => [c.categoria, c])), [vista]);
  // KPIs con los dos filtros aplicados
  const kpi = useMemo(() => {
    const suma = (cats: string[]) => resumen.celdas
      .filter(c => (!selLinea || c.linea === selLinea) && (!selCat || c.categoria === selCat) && cats.includes(c.categoria))
      .reduce((a, c) => ({ n: a.n + c.n, m: a.m + c.m }), { n: 0, m: 0 });
    return { pagadas: suma(PAGADOS), pend: suma(["Aprobados pendientes de pago"]), cerradas: suma(["Cerrados sin desembolso"]) };
  }, [resumen, selCat, selLinea]);

  // Rango de meses del gráfico mensual
  const meses = vista.meses;
  const primero = meses?.[0]?.mes ?? "", ultimo = meses?.[meses.length - 1]?.mes ?? "";
  const { desde, hasta } = useMemo(() => {
    if (!meses?.length) return { desde: "", hasta: "" };
    if (atajo === "personal") return { desde: desdeMes || primero, hasta: hastaMes || ultimo };
    const k = atajo === "todo" ? meses.length : Number(atajo);
    return { desde: meses[Math.max(0, meses.length - k)].mes, hasta: ultimo };
  }, [meses, atajo, desdeMes, hastaMes, primero, ultimo]);
  const visibles = useMemo(() => meses?.filter(m => m.mes >= desde && m.mes <= hasta) ?? null, [meses, desde, hasta]);

  if (!resumen.n) return <p className="nota">No hay solicitudes registradas para esta zona en la base de personas.</p>;

  const verResumen = parte !== "evolucion", verEvolucion = parte !== "resumen";
  const hayFiltro = !!(selCat || selLinea);
  const lineas = vista.lineas;
  const detalle = (
    <div className="viz-detalle">
      {vista.categorias.filter(c => c.estados.length > 1 || c.estados[0]?.estado.toUpperCase() !== c.categoria.toUpperCase()).map(c => {
        const cabecera = <><i style={{ background: colorCat(c.categoria) }} aria-hidden="true" />{c.categoria}<span>{miles(c.n)}{CON_MONTO.has(c.categoria) ? ` · ${peso(c.m)}` : ""}</span></>;
        const lista = <ul>{c.estados.map(e => <li key={e.estado}><span>{e.estado}</span><b>{miles(e.n)}</b>{CON_MONTO.has(c.categoria) && <small>{peso(e.m)}</small>}</li>)}</ul>;
        return interactivo
          ? <details key={c.categoria}><summary>{cabecera}</summary>{lista}</details>
          : <section key={c.categoria} className="viz-detalle-fijo"><h4>{cabecera}</h4>{lista}</section>;   // impreso: todo desplegado
      })}
    </div>
  );
  const quitar = () => { setSelCat(null); setSelLinea(null); };

  return (
    <>
      {interactivo && hayFiltro && (
        <div className="viz-filtros" aria-live="polite">
          <span>Mostrando:</span>
          {selLinea && <span className="chip">Línea: {selLinea}<button type="button" aria-label="Quitar filtro de línea" onClick={() => setSelLinea(null)}>×</button></span>}
          {selCat && <span className="chip">Estado: {selCat}<button type="button" aria-label="Quitar filtro de estado" onClick={() => setSelCat(null)}>×</button></span>}
          <button type="button" className="limpiar" onClick={quitar}>Quitar filtros</button>
        </div>
      )}

      {verResumen && <>
      <div className="kpis kpis-4">
        <div className="kpi"><span>Solicitudes</span><b>{miles(vista.n)}</b><small>{hayFiltro ? "con los filtros elegidos" : "todos los estados"}</small></div>
        <div className="kpi dest"><span>Pagadas</span><b>{miles(kpi.pagadas.n)}</b><small>{peso(kpi.pagadas.m)} · al día, con mora o finalizadas</small></div>
        <div className="kpi"><span>Aprobadas, pendientes de pago</span><b>{miles(kpi.pend.n)}</b><small>{peso(kpi.pend.m)}</small></div>
        <div className="kpi"><span>Cerradas sin desembolso</span><b>{miles(kpi.cerradas.n)}</b><small>rechazadas, desistidas o dadas de baja</small></div>
      </div>

      <h3 className="acto-sub">Solicitudes por estado{selLinea ? ` · ${selLinea}` : ""}</h3>
      {interactivo && !hayFiltro && <p className="nota acto-rango">Tocá un estado o una línea para filtrar los otros gráficos.</p>}
      <BarrasH total={vista.categorias.reduce((a, c) => a + c.n, 0)} unidad="solicitudes"
        seleccion={selCat} onSelect={interactivo ? setSelCat : undefined}
        items={[...CATEGORIAS, "Sin clasificar"].filter(c => porCat.has(c)).map(c => {
          const f = porCat.get(c)!;
          return { clave: c, etiqueta: c, valor: f.n, color: colorCat(c), detalle: CON_MONTO.has(c) ? peso(f.m) : undefined };
        })} />
      {interactivo && <details className="viz-todo"><summary>Ver el detalle de cada estado</summary>{detalle}</details>}

      {lineas.length > 0 && (
        <>
          <h3 className="acto-sub">Solicitudes por línea{selCat ? ` · ${selCat}` : ""}</h3>
          <BarraPartes unidad="solicitudes" seleccion={selLinea} onSelect={interactivo ? setSelLinea : undefined}
            items={lineas.map((l, i) => ({ clave: l.linea, etiqueta: l.linea, valor: l.n, color: colorLinea(l.linea, i) }))} />
        </>
      )}
      </>}

      {verEvolucion && meses && meses.length > 1 && visibles && (
        <>
          <h3 className="acto-sub">{tituloMeses}{hayFiltro ? " · con los filtros elegidos" : ""}</h3>
          {interactivo && (
            <div className="viz-rango">
              <div className="seg" role="group" aria-label="Período del gráfico">
                {ATAJOS.map(([k, l]) => <button key={k} type="button" aria-pressed={atajo === k} onClick={() => setAtajo(k)}>{l}</button>)}
              </div>
              <div><label htmlFor="viz-desde">Desde</label>
                <input id="viz-desde" type="month" min={primero} max={ultimo} value={desde} onChange={e => { if (e.target.value) { setDesdeMes(e.target.value); setHastaMes(hasta); setAtajo("personal"); } }} /></div>
              <div><label htmlFor="viz-hasta">Hasta</label>
                <input id="viz-hasta" type="month" min={primero} max={ultimo} value={hasta} onChange={e => { if (e.target.value) { setHastaMes(e.target.value); setDesdeMes(desde); setAtajo("personal"); } }} /></div>
            </div>
          )}
          <p className="nota acto-rango">Según el año y el mes de la solicitud · {etiquetaMes(desde)} a {etiquetaMes(hasta)} ({visibles.length} {visibles.length === 1 ? "mes" : "meses"}).</p>
          {visibles.length > 0
            ? <ColumnasApiladas meses={visibles} titulo={tituloMeses}
                series={etiquetasSerie.map((c, j) => ({ clave: c, etiqueta: c, color: colorSerie(j), idx: j })).filter(s => visibles.some(m => m.v[s.idx] > 0))} />
            : <p className="nota">No hay solicitudes en ese período.</p>}
        </>
      )}
      {verEvolucion && !interactivo && <><h3 className="acto-sub">Detalle de cada estado</h3>{detalle}</>}
      {vista.mesesSinLinea && <p className="nota">La evolución mensual todavía no distingue la línea; se actualiza en la próxima carga de datos.</p>}
      <p className="nota">Datos de la base de solicitudes{fechaDatos ? ` al ${fechaDatos.slice(8, 10)}/${fechaDatos.slice(5, 7)}/${fechaDatos.slice(0, 4)}` : ""}. Las aprobadas pendientes de pago pueden no coincidir exactamente con los pendientes de entrega, que salen de otra base.</p>
    </>
  );
}
