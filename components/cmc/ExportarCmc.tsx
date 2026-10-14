"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { LogoCmc } from "../Marca";
import { fmtF, miles, nombreDep } from "@/lib/formato";
import { SIN_FILTRO, calcular, contexto, nEstado, pct, type DatosCmc } from "@/lib/cmc";
import { descargarExcelCmc, parametros } from "@/lib/clienteCmc";
import HojasResumenCmc from "./HojasResumenCmc";
import { useImprimir } from "./useImprimir";

/* Exportar de Córdoba me capacita, como «Exportar fichas» de Banco de la Gente: se tildan departamentos y/o localidades (con buscador) y se baja
   un resumen en PDF por zona (más un resumen conjunto si hay más de una). Solo el perfil completo y admin baja, además, las bases de participantes
   y de capacitadores (Excel) de las zonas elegidas, o la de capacitadores de todo Córdoba. */

const MAX_ZONAS_PDF = 20, MAX_ZONAS = 60, MAX_LISTA = 100;
const plano = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
type Tipo = "dep" | "loc";
interface Zona { clave: string; tipo: Tipo; dep: number; zona?: number; nombre: string; cursos: number; insc: number }

export default function ExportarCmc({ datos: d, verPersonas }: { datos: DatosCmc; verPersonas: boolean }) {
  const [modo, setModo] = useState<"todo" | "zonas">("zonas");
  const [tipo, setTipo] = useState<Tipo>("dep");
  const [busq, setBusq] = useState(""), [depFiltro, setDepFiltro] = useState(-1);
  const [sel, setSel] = useState<Map<string, Zona>>(new Map());
  const [bajando, setBajando] = useState<string | null>(null), [aviso, setAviso] = useState<string | null>(null);
  const cx = useMemo(() => contexto(d), [d]);
  const general = useMemo(() => calcular(d, SIN_FILTRO, cx), [d, cx]);

  const zonas = useMemo(() => {
    const deps: Zona[] = d.dep.map((n, i) => ({ clave: `d${i}`, tipo: "dep" as const, dep: i, nombre: n, ...general.porDep[i] })).filter(z => z.cursos > 0);
    const locs: Zona[] = d.zonas.map((z, i) => ({ clave: `l${i}`, tipo: "loc" as const, dep: z[0], zona: i, nombre: z[1], ...general.porZona[i] })).filter(z => z.cursos > 0);
    const orden = (a: Zona, b: Zona) => nombreDep(a.nombre).localeCompare(nombreDep(b.nombre), "es");
    return { deps: deps.sort(orden), locs: locs.sort(orden) };
  }, [d, general]);
  const depsOrden = zonas.deps;
  const q = plano(busq.trim());
  const candidatos = useMemo(() => (tipo === "dep" ? zonas.deps : zonas.locs).filter(z => (tipo !== "loc" || depFiltro < 0 || z.dep === depFiltro) && (!q || plano(nombreDep(z.nombre)).includes(q))), [tipo, zonas, depFiltro, q]);
  const visibles = candidatos.slice(0, MAX_LISTA);
  const nombreZona = (z: Zona) => (z.tipo === "loc" ? `${nombreDep(z.nombre)} (${nombreDep(d.dep[z.dep])})` : nombreDep(z.nombre));

  const elegidas = useMemo(() => [...sel.values()], [sel]);
  // Una localidad dentro de un departamento elegido no se cuenta dos veces
  const efectivas = useMemo(() => elegidas.filter(z => z.tipo === "dep" || !sel.has(`d${z.dep}`)), [elegidas, sel]);
  const hayRepetidas = efectivas.length < elegidas.length;
  const zonaIds = useMemo(() => [...new Set(efectivas.flatMap(z => (z.tipo === "loc" ? [z.zona!] : d.zonas.map((x, i) => (x[0] === z.dep ? i : -1)).filter(i => i >= 0))))], [efectivas, d]);
  const conjunto = useMemo(() => calcular(d, { ...SIN_FILTRO, zonaIds }, cx), [d, zonaIds, cx]);
  const porZona = useMemo(() => elegidas.slice(0, MAX_ZONAS_PDF).map(z => ({ z, r: calcular(d, { ...SIN_FILTRO, dep: z.dep, zona: z.tipo === "loc" ? z.zona! : -1 }, cx) })), [elegidas, d, cx]);
  const excede = elegidas.length > MAX_ZONAS_PDF;

  const alternar = (z: Zona) => setSel(a => { const m = new Map(a); if (m.has(z.clave)) m.delete(z.clave); else m.set(z.clave, z); return m; });
  const tildarTodos = () => setSel(a => { const m = new Map(a); candidatos.forEach(z => m.set(z.clave, z)); return m; });
  const quitarTodos = () => setSel(new Map());

  const nombresArchivo = modo === "todo" ? "cordoba" : elegidas.length === 1 ? plano(elegidas[0].nombre).replace(/[^a-z0-9]+/g, "-") : `${elegidas.length}-zonas`;
  const { imprimiendo, imprimir } = useImprimir(`resumen-${nombresArchivo}-cba-me-capacita`, modo === "todo" ? ["Todo Córdoba"] : elegidas.map(nombreZona));
  const listoPdf = modo === "todo" || (elegidas.length > 0 && !excede);
  const alcanceExcel = modo === "todo" ? {} : { zonas: efectivas.map(z => ({ dep: d.dep[z.dep], loc: z.tipo === "loc" ? z.nombre : undefined })) };
  const bajar = async (t: "participantes" | "capacitadores") => { setBajando(t); setAviso(await descargarExcelCmc(t, alcanceExcel)); setBajando(null); };
  const unica = modo === "zonas" && efectivas.length === 1 ? { dep: d.dep[efectivas[0].dep], loc: efectivas[0].tipo === "loc" ? efectivas[0].nombre : null } : null;
  const q2 = unica ? parametros(unica).toString() : "";
  const sinZonas = modo === "zonas" && elegidas.length === 0;
  const demasiadas = modo === "zonas" && efectivas.length > MAX_ZONAS;
  const rConj = modo === "todo" ? general : conjunto;

  return (
    <>
      <div className="solo-pantalla">
        <div className="franja" />
        <header className="top"><div className="wrap">
          <LogoCmc />
          <div className="titulo"><h1>Córdoba me capacita</h1><p>Exportar · resumen en PDF y bases en Excel</p></div>
          <div className="actualiz">Datos actualizados el<b>{fmtF(d.actualizado)}</b></div>
          <form method="post" action="/api/logout" className="salir-form"><button className="salir" type="submit">Salir</button></form>
        </div></header>

        <main className="dash"><div className="wrap">
          <h2 className="vista-titulo">Exportar</h2>
          <p className="acto-intro">
            Elegí todo Córdoba o tildá los departamentos y localidades que querés incluir. Se genera un resumen por zona y, si elegiste más de una, un resumen conjunto.
            En el diálogo de impresión elegí «Guardar como PDF».{verPersonas ? " Además podés bajar en Excel las bases de participantes y de capacitadores de las zonas elegidas." : ""}
          </p>

          <section className="card acto-selector" aria-label="Elegir zonas">
            <div className="seg" role="group" aria-label="Alcance">
              <button type="button" aria-pressed={modo === "zonas"} onClick={() => { setModo("zonas"); setAviso(null); }}>Elegir zonas</button>
              <button type="button" aria-pressed={modo === "todo"} onClick={() => { setModo("todo"); setAviso(null); }}>Todo Córdoba</button>
            </div>
            {modo === "zonas" && (
              <>
                <div className="seg" role="group" aria-label="Tipo de zona" style={{ marginTop: 12 }}>
                  {([["dep", "Departamentos"], ["loc", "Localidades"]] as [Tipo, string][]).map(([k, t]) => (
                    <button key={k} type="button" aria-pressed={tipo === k} onClick={() => { setTipo(k); setBusq(""); setDepFiltro(-1); }}>{t}</button>
                  ))}
                </div>
                <div className="acto-buscar">
                  {tipo === "loc" && (
                    <div>
                      <label htmlFor="exp-dep">Departamento</label>
                      <select id="exp-dep" value={depFiltro} onChange={e => setDepFiltro(+e.target.value)}>
                        <option value={-1}>Todos los departamentos</option>
                        {depsOrden.map(x => <option key={x.clave} value={x.dep}>{nombreDep(x.nombre)}</option>)}
                      </select>
                    </div>
                  )}
                  <div>
                    <label htmlFor="exp-busq">{tipo === "dep" ? "Buscar departamento" : "Buscar localidad"}</label>
                    <input id="exp-busq" type="search" value={busq} autoComplete="off" onChange={e => setBusq(e.target.value)} />
                  </div>
                </div>
                <div className="exportar-cols">
                  <button type="button" className="limpiar" disabled={!candidatos.length} onClick={tildarTodos}>Tildar los {candidatos.length} resultados</button>
                  <button type="button" className="limpiar" disabled={!sel.size} onClick={quitarTodos}>Quitar todo lo elegido</button>
                </div>
                <p className="nota acto-cuenta" aria-live="polite">
                  {candidatos.length === 0 ? "No hay coincidencias." : `Mostrando ${visibles.length} de ${candidatos.length}.${candidatos.length > MAX_LISTA ? " Seguí escribiendo para acotar." : ""}`}
                </p>
                <ul className="exportar-zonas">
                  {visibles.map(z => (
                    <li key={z.clave}>
                      <label>
                        <input type="checkbox" checked={sel.has(z.clave)} onChange={() => alternar(z)} />
                        <span className="acto-zona">{nombreDep(z.nombre)}{z.tipo === "loc" && <small>{nombreDep(d.dep[z.dep])}</small>}</span>
                        <span className="acto-cifras">{miles(z.cursos)} cursos · {miles(z.insc)} inscripciones</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          <section className="card" aria-label="Qué se exporta" aria-live="polite">
            <h3 className="acto-sub">{modo === "todo" ? "Se exporta: todo Córdoba" : `Zonas elegidas: ${elegidas.length}`}</h3>
            {modo === "zonas" && (sinZonas ? <p className="nota">Todavía no elegiste ninguna zona.</p> : (
              <ul className="exportar-chips">
                {elegidas.map(z => <li key={z.clave}><button type="button" onClick={() => alternar(z)} aria-label={`Quitar ${nombreZona(z)}`}>{nombreZona(z)} ×</button></li>)}
              </ul>
            ))}
            {!sinZonas && (
              <>
                <div className="kpis" style={{ marginTop: 12 }}>
                  <div className="kpi"><span>Cursos</span><b>{miles(rConj.ag.cursos)}</b></div>
                  <div className="kpi"><span>Inscripciones</span><b>{miles(rConj.insc)}</b><small>{rConj.unicos ? `${miles(rConj.unicos.personas)} personas distintas` : ""}</small></div>
                  <div className="kpi"><span>Egresados</span><b>{miles(nEstado(rConj, "EGRESADO"))}</b><small>{pct(nEstado(rConj, "EGRESADO"), rConj.insc)}</small></div>
                  <div className="kpi"><span>Bajas</span><b>{miles(nEstado(rConj, "BAJA"))}</b><small>{pct(nEstado(rConj, "BAJA"), rConj.insc)}</small></div>
                  <div className="kpi"><span>Capacitadores</span><b>{rConj.capacitadores === null ? "—" : miles(rConj.capacitadores)}</b><small>distintos</small></div>
                </div>
                {hayRepetidas && <p className="nota">Las localidades que están dentro de un departamento elegido se cuentan una sola vez en el total y en los Excel.</p>}
              </>
            )}
            {excede && <p className="nota" role="alert">Elegiste más de {MAX_ZONAS_PDF} zonas: para el PDF quitá algunas (para el Excel podés elegir hasta {MAX_ZONAS}).</p>}
            {demasiadas && <p className="nota" role="alert">Elegiste más de {MAX_ZONAS} zonas. Quitá algunas para generar los archivos.</p>}

            <h3 className="acto-sub" style={{ marginTop: 18 }}>Descargá</h3>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
              <button type="button" className="volver" style={{ marginBottom: 0 }} disabled={!listoPdf || imprimiendo || demasiadas} onClick={imprimir}>
                {imprimiendo ? "Preparando…" : modo === "zonas" && elegidas.length > 1 ? `Resumen en PDF (${elegidas.length} zonas + conjunto)` : "Resumen en PDF"}</button>
              {verPersonas && (
                <>
                  <button type="button" className="acto-link" disabled={!!bajando || modo === "todo" || sinZonas || demasiadas} onClick={() => bajar("participantes")}
                    title={modo === "todo" ? "La base de participantes de todo Córdoba es demasiado grande para un Excel: elegí zonas" : undefined}>
                    {bajando === "participantes" ? "Preparando…" : "Base de participantes (Excel)"}</button>
                  <button type="button" className="acto-link" disabled={!!bajando || sinZonas || demasiadas} onClick={() => bajar("capacitadores")}>
                    {bajando === "capacitadores" ? "Preparando…" : "Base de capacitadores (Excel)"}</button>
                  {unica && (
                    <>
                      <Link className="enlace-zona" href={`/cba-me-capacita/participantes?${q2}`}>Ver participantes</Link>
                      <Link className="enlace-zona" href={`/cba-me-capacita/capacitadores?${q2}`}>Ver capacitadores</Link>
                    </>
                  )}
                </>
              )}
            </div>
            {aviso && <p className="err" role="alert">{aviso}</p>}
            {verPersonas
              ? <p className="cmc-nota">Las bases contienen datos personales: cada descarga queda registrada. La base de participantes de todo Córdoba no se puede bajar de una vez (96 mil filas): se baja por zonas o por curso. La de capacitadores sí.</p>
              : <p className="cmc-nota">Las bases de participantes y capacitadores (con datos personales) solo las descarga el perfil completo.</p>}
          </section>
        </div></main>
      </div>

      {imprimiendo && listoPdf && typeof document !== "undefined" && createPortal(
        <div className="hojas-impresion">
          <style>{"@page{size:A4 portrait;margin:0}"}</style>
          {modo === "todo" ? (
            <HojasResumenCmc d={d} r={general} cx={cx} nivel="general" titulo="Resumen general" ambito="Todo Córdoba" filtros={[]} depSel={-1} />
          ) : (
            <>
              {elegidas.length > 1 && (
                <HojasResumenCmc d={d} r={conjunto} cx={cx} nivel="zonas" titulo={`Resumen conjunto · ${elegidas.length} zonas`} ambito={`${elegidas.length} zonas elegidas`} filtros={[]} depSel={-1}
                  zonasTabla={porZona.filter(({ z }) => efectivas.includes(z)).map(({ z, r }) => ({ nombre: nombreZona(z), cursos: r.ag.cursos, insc: r.insc, egr: nEstado(r, "EGRESADO") }))}
                  nota={hayRepetidas ? `Las localidades que están dentro de un departamento elegido (${elegidas.filter(z => !efectivas.includes(z)).map(nombreZona).join(", ")}) se cuentan una sola vez, dentro del departamento. Cada una tiene además su propio resumen.` : undefined} />
              )}
              {porZona.map(({ z, r }) => (
                <HojasResumenCmc key={z.clave} d={d} r={r} cx={cx} nivel={z.tipo} depSel={z.dep} filtros={[]}
                  titulo={z.tipo === "dep" ? `Departamento ${nombreDep(z.nombre)}` : `Localidad ${nombreDep(z.nombre)}`}
                  ambito={z.tipo === "dep" ? `Departamento ${nombreDep(z.nombre)}` : `${nombreDep(z.nombre)}, ${nombreDep(d.dep[z.dep])}`} />
              ))}
            </>
          )}
        </div>, document.body)}
    </>
  );
}
