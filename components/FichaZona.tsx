"use client";
import { useEffect, useMemo, useState, type Ref } from "react";
import { createPortal } from "react-dom";
import { fmtF, miles, nombreLinea, peso } from "@/lib/formato";
import { SIN_LINEA, antiguedad, hoyArgentina, type Ficha } from "@/lib/acto";
import type { ResumenEstados } from "@/lib/estadosAgregados";
import ResumenEstadosVista from "./ResumenEstadosVista";
import { CabeceraHoja, PieHoja } from "./Marca";
import { avisarExportable } from "@/lib/clienteActividad";

/* Ficha de zona: cantidad, monto, líneas y antigüedad de la aprobación de una zona
   (barrio, localidad o departamento). Solo muestra agregados. */

const pct = (parte: number, todo: number) => (todo ? ((parte / todo) * 100).toFixed(1).replace(".", ",") + " %" : "—");
const anchoBarra = (parte: number, todo: number) => `${todo ? Math.max(2, (parte / todo) * 100) : 0}%`;
export const plural = (n: number, uno: string, varios: string) => `${miles(n)} ${n === 1 ? uno : varios}`;
const textoLinea = (l: string) => (l === SIN_LINEA ? "Sin línea informada" : nombreLinea(l));

export type ModoFicha = "pendientes" | "completos" | "ambos";

/** Zona cuyo listado de créditos pendientes se puede bajar a Excel (solo perfil completo y admin). `barrio` solo en Capital:
    "" es «sin barrio informado». Sale de la base de pendientes, que sí trae el barrio. */
export interface ExcelZona { dep: string; loc?: string; barrio?: string; circuito?: string }
const paramsZona = (z: ExcelZona) => {
  const p = new URLSearchParams({ zdep: z.dep });
  if (z.loc !== undefined) p.set("zloc", z.loc);
  if (z.barrio !== undefined) p.set("barrio", z.barrio);
  if (z.circuito !== undefined) p.set("circuito", z.circuito);
  return p;
};
const slug = (t: string) => t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export default function FichaZona({ ficha, titulo, sub, notas = [], actualizado, titleRef, id = "ficha-zona-titulo", completa, fechaCompleta, modoFijo, parteCompleta, excel, soloExportar }: {
  ficha: Ficha;
  /** Resumen de todos los estados de la zona (departamentos y localidades). Con él aparece el botón «Datos completos». */
  completa?: ResumenEstados | null;
  fechaCompleta?: string;
  /** Si se pasa, el menú de exportación ofrece el listado de créditos pendientes de la zona en Excel. */
  excel?: ExcelZona | null;
  /** Solo el botón de exportación, sin la tarjeta de la ficha (por ejemplo, para exportar un circuito desde el listado). */
  soloExportar?: boolean;
  /** En las hojas impresas, qué parte de los datos completos va en esta página. */
  parteCompleta?: "resumen" | "evolucion";
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
  // Exportar desde la ficha: se arman las hojas, se abre el diálogo de impresión ("Guardar como PDF") y se limpian
  const [menu, setMenu] = useState(false);
  const [imprimir, setImprimir] = useState<ContenidoExport | null>(null);
  // Excel de pendientes de la zona: cuántos créditos son (se pide al abrir el menú) y estado de la descarga
  const [cuenta, setCuenta] = useState<number | null | "error">(null);
  const [trabajando, setTrabajando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const claveExcel = excel ? paramsZona(excel).toString() : "";
  useEffect(() => { setCuenta(null); setAviso(null); }, [claveExcel]);
  useEffect(() => {
    if (!menu || !excel || cuenta !== null) return;
    const ctl = new AbortController();
    fetch(`/api/pendientes/contar?${claveExcel}`, { signal: ctl.signal })
      .then(r => r.ok ? r.json() : Promise.reject(r.status)).then((d: { total: number }) => setCuenta(d.total))
      .catch(e => { if (e?.name !== "AbortError") setCuenta("error"); });
    return () => ctl.abort();
  }, [menu, excel, cuenta, claveExcel]);
  const descargarExcel = async () => {
    if (!excel) return;
    setMenu(false); setTrabajando(true); setAviso(null);
    try {
      const r = await fetch(`/api/pendientes/exportar?${claveExcel}`);
      if (!r.ok) throw r.status;
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement("a");
      a.href = url; a.download = `pendientes-${slug(titulo)}-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (e) {
      setAviso(e === 403 ? "No tenés permiso para exportar este listado." : e === 404 ? "Esta zona no tiene créditos pendientes en la base."
        : e === 413 ? "La zona tiene demasiados créditos para un solo Excel." : e === 503 ? "El listado de pendientes todavía no está disponible: se carga con la próxima actualización de datos."
        : "No se pudo generar el Excel. Probá de nuevo.");
    }
    setTrabajando(false);
  };
  useEffect(() => {
    if (!imprimir) return;
    avisarExportable({ tipo: "ficha", zonas: [titulo], contenido: imprimir });
    const tituloAntes = document.title;
    document.title = `ficha-${slug(titulo)}-${new Date().toISOString().slice(0, 10)}`;
    document.body.classList.add("imprimiendo-ficha");
    const fin = () => { document.title = tituloAntes; document.body.classList.remove("imprimiendo-ficha"); setImprimir(null); };
    window.addEventListener("afterprint", fin, { once: true });
    const t = setTimeout(() => window.print(), 400);
    return () => { clearTimeout(t); window.removeEventListener("afterprint", fin); document.title = tituloAntes; document.body.classList.remove("imprimiendo-ficha"); };
  }, [imprimir, titulo]);
  const primera = ficha.fechas[0]?.f, ultima = ficha.fechas[ficha.fechas.length - 1]?.f;

  const exportUI = (
          <div className="ficha-export">
            {completa || excel ? (
              <>
                <button type="button" className="acto-link" aria-haspopup="menu" aria-expanded={menu} disabled={trabajando} onClick={() => setMenu(m => !m)}>
                  {trabajando ? "Preparando…" : "Exportar ▾"}</button>
                {menu && (
                  <div className="ficha-export-menu" role="menu">
                    <button type="button" role="menuitem" onClick={() => { setMenu(false); setImprimir("pendientes"); }}>Informe de pendientes de entrega (PDF)</button>
                    {completa && <button type="button" role="menuitem" onClick={() => { setMenu(false); setImprimir("completa"); }}>Ficha completa: pendientes + todos los estados (PDF)</button>}
                    {excel && (
                      <>
                        <button type="button" role="menuitem" disabled={typeof cuenta !== "number" || cuenta === 0} onClick={descargarExcel}>
                          Base de pendientes de la zona (Excel){typeof cuenta === "number" ? ` · ${miles(cuenta)}` : ""}</button>
                        {cuenta === null && <p className="nota">Contando los créditos de la zona…</p>}
                        {cuenta === "error" && <p className="nota">El listado de pendientes todavía no está disponible: se carga con la próxima actualización de datos.</p>}
                        {cuenta === 0 && <p className="nota">Esta zona no tiene créditos pendientes en la base.</p>}
                      </>
                    )}
                  </div>
                )}
              </>
            ) : <button type="button" className="acto-link" onClick={() => setImprimir("pendientes")}>Exportar PDF</button>}
          </div>
  );
  const portalImpresion = (
    <>
      {imprimir && typeof document !== "undefined" && createPortal(
        <div className="hojas-impresion">
          <style>{"@page{size:A4 portrait;margin:0}"}</style>
          <HojasFicha ficha={ficha} titulo={titulo} sub={sub} notas={notas} actualizado={actualizado} completa={completa}
            fechaCompleta={fechaCompleta} contenido={imprimir} id={`impr-${id}`} />
        </div>, document.body)}
    </>
  );
  if (soloExportar) {
    return (
      <div className="ficha-export-solo">
        {exportUI}
        {aviso && <p className="nota" role="alert">{aviso}</p>}
        {portalImpresion}
      </div>
    );
  }
  return (
    <section className="card acto-ficha" aria-labelledby={id}>
      <header>
        <div>
          <p className="zona-etiqueta">Ficha de zona</p>
          <h2 id={id} ref={titleRef} tabIndex={-1}>{titulo}</h2>
          <p className="sub">{sub}</p>
        </div>
        {!modoFijo && exportUI}
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
          <ResumenEstadosVista resumen={completa!} fechaDatos={fechaCompleta} interactivo={!modoFijo} parte={parteCompleta} />
        </>
      )}
      {notas.filter(Boolean).map((n, i) => <p key={i} className="nota">{n}</p>)}
      {!soloExportar && <>{aviso && <p className="nota" role="alert">{aviso}</p>}</>}
      {!soloExportar && portalImpresion}
      {verPend && <p className="nota">La ficha muestra todos los créditos pendientes, sin filtro de fecha. Es una foto de la base al {fmtF(actualizado)}: los que se entregan desaparecen en la próxima actualización.</p>}
    </section>
  );
}

export type ContenidoExport = "pendientes" | "completa";

/** Hojas impresas de una zona: una con los pendientes y, si se pidió la ficha completa, otra con todos los estados.
    Cada hoja es una página A4 con su cabecera y su pie, y el contenido centrado entre los dos. */
export function HojasFicha({ ficha, titulo, sub, notas, actualizado, completa, fechaCompleta, contenido, id }: {
  ficha: Ficha; titulo: string; sub: string; notas?: (string | null | undefined | false)[]; actualizado: string;
  completa?: ResumenEstados | null; fechaCompleta?: string; contenido: ContenidoExport; id: string;
}) {
  const conEstados = contenido === "completa" && !!completa;
  return (
    <>
      <div className="hoja">
        <CabeceraHoja actualizado={fmtF(actualizado)} />
        <FichaZona ficha={ficha} titulo={titulo} sub={sub} notas={notas} actualizado={actualizado} id={id}
          completa={conEstados ? completa : null} fechaCompleta={fechaCompleta} modoFijo={conEstados ? "pendientes" : undefined} />
        <PieHoja />
      </div>
      {conEstados && (
        <div className="hoja">
          <CabeceraHoja actualizado={fmtF(actualizado)} />
          <FichaZona ficha={ficha} titulo={titulo} sub={sub} actualizado={actualizado} id={`${id}-estados`}
            completa={completa} fechaCompleta={fechaCompleta} modoFijo="completos" parteCompleta="resumen" />
          <PieHoja />
        </div>
      )}
      {conEstados && (
        <div className="hoja">
          <CabeceraHoja actualizado={fmtF(actualizado)} />
          <FichaZona ficha={ficha} titulo={titulo} sub={sub} notas={notas} actualizado={actualizado} id={`${id}-evolucion`}
            completa={completa} fechaCompleta={fechaCompleta} modoFijo="completos" parteCompleta="evolucion" />
          <PieHoja />
        </div>
      )}
    </>
  );
}
