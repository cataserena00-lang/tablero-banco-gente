"use client";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BarraPartes, BarrasH, ColumnasApiladas, colorSerie } from "../graficos";
import { LogoCmc } from "../Marca";
import { fmtF, miles, nombreDep } from "@/lib/formato";
import {
  C, COLOR_ESTADO, GRUPOS_PERFIL, SIN_FILTRO, TITULO_ESTADO, TITULO_SEXO, calcular, contexto, mesTexto, nEstado, normaliza, pct, type DatosCmc, type Filtro,
} from "@/lib/cmc";
import type { GeoData } from "../Tablero";
import HojasResumenCmc, { type Nivel } from "./HojasResumenCmc";
import MenuExportarCmc from "./MenuExportarCmc";
import { useImprimir } from "./useImprimir";

/* Tablero de Córdoba me capacita, con la misma estructura que el de Banco de la Gente:
   resumen general → clic en un departamento: su resumen y sus localidades → clic en una localidad: su resumen.
   Todo son datos agregados (cursos con el perfil sumado de sus inscriptos); lo nominal está en las páginas Participantes y Capacitadores. */

const ESC = ["#E6EEF6", "#9DB9D6", "#4F7FB0", "#0B4680", "#06284B"];
function colorMapa(v: number, max: number) {
  if (!v) return null;
  const t = Math.min(.999, Math.sqrt(v / max)) * (ESC.length - 1), i = Math.floor(t), fr = t - i;
  const hex = (c: string) => [1, 3, 5].map(j => parseInt(c.slice(j, j + 2), 16));
  const a = hex(ESC[i]), b = hex(ESC[Math.min(i + 1, ESC.length - 1)]);
  return "rgb(" + a.map((x, j) => Math.round(x + (b[j] - x) * fr)).join(",") + ")";
}
const MAX_FILAS = 100;

export default function TableroCmc({ datos: d, geo, verPersonas = false }: { datos: DatosCmc; geo: GeoData | null; verPersonas?: boolean }) {
  const [f, setF] = useState<Filtro>(SIN_FILTRO);
  const [metMapa, setMetMapa] = useState<"insc" | "cursos">("insc");
  const tituloRef = useRef<HTMLHeadingElement>(null);
  const set = (p: Partial<Filtro>) => { setF(x => ({ ...x, ...p })); setTimeout(() => tituloRef.current?.focus(), 0); };
  const cx = useMemo(() => contexto(d), [d]);
  const r = useMemo(() => calcular(d, f, cx), [d, f, cx]);
  const nivel: Nivel = f.zona >= 0 ? "loc" : f.dep >= 0 ? "dep" : "general";
  const depSel = f.dep >= 0 ? d.dep[f.dep] : null;
  const zonaSel = f.zona >= 0 ? d.zonas[f.zona] : null;
  const off = cx.off;
  const iEgr = off.estado.ini + off.estado.cats.indexOf("EGRESADO"), iBaja = off.estado.ini + off.estado.cats.indexOf("BAJA");

  // Localidades del departamento, con egresados y bajas
  const localidades = useMemo(() => {
    if (nivel !== "dep") return [];
    const m = new Map<number, { cursos: number; insc: number; egr: number; baja: number }>();
    for (const i of r.ag.indices) {
      const z = d.cursos[i][C.zona], x = m.get(z) ?? { cursos: 0, insc: 0, egr: 0, baja: 0 };
      x.cursos++; x.insc += d.perfil[i][0]; x.egr += d.perfil[i][iEgr]; x.baja += d.perfil[i][iBaja]; m.set(z, x);
    }
    return [...m.entries()].map(([z, x]) => ({ z, nombre: d.zonas[z][1], ...x })).sort((a, b) => b.insc - a.insc);
  }, [nivel, r, d, iEgr, iBaja]);

  const valDep = (g: { cursos: number; insc: number }) => (metMapa === "insc" ? g.insc : g.cursos);
  const maxDep = Math.max(1, ...r.porDep.map(valDep));
  const rankDeps = d.dep.map((n, i) => ({ n, i, ...r.porDep[i] })).filter(x => valDep(x) > 0).sort((a, b) => valDep(b) - valDep(a));
  // Filtros propios de la tabla de cursos (no cambian los indicadores ni los gráficos): institución, curso y sector, con desplegables
  // que solo ofrecen lo que hay en la vista y se acotan entre sí, y un buscador de texto.
  const [tf, setTf] = useState({ inst: -1, curso: -1, sector: -1, texto: "" });
  const tfActivos = tf.inst >= 0 || tf.curso >= 0 || tf.sector >= 0 || tf.texto.trim() !== "";
  const textoNorm = normaliza(tf.texto.trim());
  const cumple = (i: number, saltar?: "inst" | "curso" | "sector") => {
    const c = d.cursos[i];
    return (saltar === "inst" || tf.inst < 0 || c[C.inst] === tf.inst) && (saltar === "curso" || tf.curso < 0 || c[C.curso] === tf.curso)
      && (saltar === "sector" || tf.sector < 0 || c[C.sector] === tf.sector)
      && (!textoNorm || cx.nombresNorm[c[C.curso]].includes(textoNorm) || cx.instNorm[c[C.inst]].includes(textoNorm));
  };
  const opciones = useMemo(() => {
    const ordenar = (ids: Set<number>, lista: string[]) => [...ids].map(i => ({ i, t: lista[i] })).sort((a, b) => a.t.localeCompare(b.t, "es"));
    const pick = (saltar: "inst" | "curso" | "sector", campo: number, lista: string[]) =>
      ordenar(new Set(r.ag.indices.filter(i => cumple(i, saltar)).map(i => d.cursos[i][campo])), lista);
    return { inst: pick("inst", C.inst, d.inst), curso: pick("curso", C.curso, d.cursos_nombres), sector: pick("sector", C.sector, d.sectores) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r, tf, d, cx]);
  const filas = useMemo(() => r.ag.indices.filter(i => cumple(i)).sort((a, b) => d.perfil[b][0] - d.perfil[a][0]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [r, tf, d, cx]);

  const titulo = nivel === "general" ? "Resumen general" : nivel === "dep" ? `Departamento ${nombreDep(depSel!)}` : `Localidad ${nombreDep(zonaSel![1])}`;
  const ambito = nivel === "general" ? "Todo Córdoba" : nivel === "dep" ? `Departamento ${nombreDep(depSel!)}` : `${nombreDep(zonaSel![1])}, ${nombreDep(depSel!)}`;
  const filtrosTexto: string[] = [];
  if (f.etapa >= 0) filtrosTexto.push(`Etapa: ${d.etapas[f.etapa]}`);
  if (f.sector >= 0) filtrosTexto.push(`Sector: ${d.sectores[f.sector]}`);
  if (f.tipo >= 0) filtrosTexto.push(`Institución: ${d.tipos[f.tipo]}`);
  if (f.modalidad >= 0) filtrosTexto.push(`Modalidad: ${d.modalidades[f.modalidad]}`);
  if (f.desde >= 0) filtrosTexto.push(`Desde: ${mesTexto(d.meses[f.desde])}`);
  if (f.hasta >= 0) filtrosTexto.push(`Hasta: ${mesTexto(d.meses[f.hasta])}`);
  const { imprimiendo, imprimir } = useImprimir(`resumen-${nivel === "general" ? "cordoba" : (zonaSel ? zonaSel[1] : depSel!).toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/[^a-z0-9]+/g, "-")}-cba-me-capacita`, [ambito]);

  const sel = (nombre: string, valor: number, lista: string[], onChange: (i: number) => void, todos: string) => (
    <div className="filtro-sel">
      <label>{nombre}
        <select value={valor} onChange={e => onChange(+e.target.value)}>
          <option value={-1}>{todos}</option>
          {lista.map((x, i) => <option key={x} value={i}>{x}</option>)}
        </select>
      </label>
    </div>
  );
  const hayFiltros = filtrosTexto.length > 0;
  const Sep = () => <span className="bc-sep">›</span>;

  return (
    <>
      <div className="franja" />
      <header className="top"><div className="wrap">
        <LogoCmc />
        <div className="titulo"><h1>Córdoba me capacita</h1><p>Cursos, inscripciones y participantes desde {d.desde.slice(0, 4)}</p></div>
        <div className="actualiz">Datos actualizados el<b>{fmtF(d.actualizado)}</b></div>
        <form method="post" action="/api/logout" className="salir-form"><button className="salir" type="submit">Salir</button></form>
      </div></header>

      <main className="dash"><div className="wrap">
        {nivel !== "general" && (
          <button type="button" className="volver" onClick={() => (nivel === "loc" ? set({ zona: -1 }) : set({ dep: -1, zona: -1 }))}>
            <span aria-hidden="true">←</span> {nivel === "loc" ? `Volver a ${nombreDep(depSel!)}` : "Volver al resumen general"}
          </button>
        )}
        <section className="filtros" aria-label="Filtros">
          {sel("Etapa", f.etapa, d.etapas, i => set({ etapa: i }), "Todas")}
          {sel("Sector productivo", f.sector, d.sectores, i => set({ sector: i }), "Todos")}
          {sel("Tipo de institución", f.tipo, d.tipos, i => set({ tipo: i }), "Todos")}
          {sel("Modalidad", f.modalidad, d.modalidades, i => set({ modalidad: i }), "Todas")}
          {sel("Inicio desde", f.desde, d.meses.map(mesTexto), i => set({ desde: i, hasta: f.hasta >= 0 && f.hasta < i ? i : f.hasta }), "Primer mes")}
          {sel("Inicio hasta", f.hasta, d.meses.map(mesTexto), i => set({ hasta: i, desde: f.desde > i ? i : f.desde }), "Último mes")}
          <button className="limpiar" type="button" style={{ visibility: hayFiltros ? "visible" : "hidden" }} onClick={() => setF(x => ({ ...SIN_FILTRO, dep: x.dep, zona: x.zona }))}>Limpiar filtros</button>
        </section>
        {filtrosTexto.length > 0 && (
          <div className="chips" aria-live="polite">{filtrosTexto.map(t => <span key={t} className="chip">{t}</span>)}</div>
        )}

        {nivel !== "general" && (
          <nav className="breadcrumb" aria-label="Navegación">
            <button type="button" onClick={() => set({ dep: -1, zona: -1 })}>Córdoba</button><Sep />
            {nivel === "loc" ? <><button type="button" onClick={() => set({ zona: -1 })}>{nombreDep(depSel!)}</button><Sep /><span className="bc-current">{nombreDep(zonaSel![1])}</span></>
              : <span className="bc-current">{nombreDep(depSel!)}</span>}
          </nav>
        )}

        <div className="vista-titulo-fila">
          <h2 className="vista-titulo" ref={tituloRef} tabIndex={-1}>{titulo}</h2>
          <MenuExportarCmc alcance={{ dep: depSel, loc: zonaSel ? zonaSel[1] : null }} verPersonas={verPersonas} onPdf={imprimir} preparando={imprimiendo} />
        </div>

        <section className="kpis kpis-4" aria-label="Indicadores" style={{ marginTop: 14 }}>
          <div className="kpi"><span>Cursos</span><b>{miles(r.ag.cursos)}</b><small>dictados desde {d.desde.slice(0, 4)}</small></div>
          <div className="kpi"><span>Inscripciones</span><b>{miles(r.insc)}</b>
            <small>{r.unicos ? `${miles(r.unicos.personas)} personas distintas` : "personas distintas: se calcula sin filtros de sector, tipo, modalidad ni período"}</small></div>
          <div className="kpi"><span>Egresados</span><b>{miles(nEstado(r, "EGRESADO"))}</b><small>{pct(nEstado(r, "EGRESADO"), r.insc)} de las inscripciones</small></div>
          <div className="kpi"><span>Bajas</span><b>{miles(nEstado(r, "BAJA"))}</b><small>{pct(nEstado(r, "BAJA"), r.insc)} de las inscripciones{r.unicos ? ` · ${miles(r.unicos.capacitadores)} capacitadores` : ""}</small></div>
        </section>

        {nivel === "general" && (
          <div className="grid grid-mapa" style={{ marginTop: 20 }}>
            {geo && (
              <section className="card">
                <header>
                  <div><h2>Departamentos de Córdoba</h2><p className="sub">Los datos son de dónde se dicta el curso · clic en un departamento para ver su resumen</p></div>
                  <div className="seg" role="group" aria-label="Métrica del mapa">
                    <button type="button" aria-pressed={metMapa === "insc"} onClick={() => setMetMapa("insc")}>Inscripciones</button>
                    <button type="button" aria-pressed={metMapa === "cursos"} onClick={() => setMetMapa("cursos")}>Cursos</button>
                  </div>
                </header>
                <div className="chartbox" style={{ position: "relative" }}>
                  <svg className="mapa" viewBox={`0 0 ${geo.w} ${geo.h}`} role="img" aria-label="Mapa de departamentos de Córdoba">
                    {geo.deptos.map(g => {
                      const i = d.dep.indexOf(g.nombre), x = i >= 0 ? r.porDep[i] : null, v = x ? valDep(x) : 0, col = colorMapa(v, maxDep);
                      return <path key={g.nombre} className={`dep${col ? "" : " vacio"}`} d={g.d} fill={col || "#E5E7EB"}
                        tabIndex={col ? 0 : -1} role={col ? "button" : undefined}
                        aria-label={col ? `${nombreDep(g.nombre)}: ${miles(x!.insc)} inscripciones en ${miles(x!.cursos)} cursos` : undefined}
                        onClick={() => { if (col) set({ dep: i, zona: -1 }); }}
                        onKeyDown={e => { if (col && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); set({ dep: i, zona: -1 }); } }}>
                        <title>{`${nombreDep(g.nombre)}: ${x ? `${miles(x.insc)} inscripciones · ${miles(x.cursos)} cursos` : "sin cursos"}`}</title>
                      </path>;
                    })}
                  </svg>
                </div>
                <div className="leyenda"><span>0</span><div className="escala" style={{ background: `linear-gradient(90deg,${ESC.join(",")})` }} /><span>{miles(maxDep)}</span>
                  <span style={{ marginLeft: 8 }}><i style={{ display: "inline-block", width: 12, height: 12, background: "#E5E7EB", borderRadius: 3, verticalAlign: -2 }} /> Sin cursos</span></div>
              </section>
            )}
            <section className={`card${geo ? " rank-ajustado" : ""}`}>
              <header><div><h2>Ranking de departamentos</h2><p className="sub">{rankDeps.length} departamentos por {metMapa === "insc" ? "inscripciones" : "cursos"} · clic para ver detalle</p></div></header>
              <ol className="rank">
                {rankDeps.map(x => { const max = valDep(rankDeps[0]) || 1; return (
                  <li key={x.n} onClick={() => set({ dep: x.i, zona: -1 })} style={{ cursor: "pointer" }} role="button" tabIndex={0} onKeyDown={e => { if (e.key === "Enter") set({ dep: x.i, zona: -1 }); }}>
                    <span title={nombreDep(x.n)}>{nombreDep(x.n)}</span><div className="bar"><i style={{ width: `${valDep(x) / max * 100}%` }} /></div><span>{miles(valDep(x))}</span>
                  </li>); })}
              </ol>
            </section>
          </div>
        )}

        {nivel === "dep" && (
          <section className="card" style={{ marginTop: 20 }}>
            <header><div><h2>Localidades de {nombreDep(depSel!)}</h2><p className="sub">{localidades.length} localidades · ordenadas por inscripciones · elegí una para ver su resumen</p></div></header>
            <div className="tabla-detalle">
              <table>
                <thead><tr><th className="th-loc">Localidad</th><th className="th-num">Cursos</th><th className="th-num">Inscripciones</th><th className="th-num">Egresados</th><th className="th-num">Bajas</th></tr></thead>
                <tbody>
                  {localidades.map(l => (
                    <tr key={l.z}>
                      <td className="td-loc"><button type="button" className="enlace-zona" onClick={() => set({ zona: l.z })}>{nombreDep(l.nombre)}</button></td>
                      <td className="td-num">{miles(l.cursos)}</td><td className="td-num">{miles(l.insc)}</td><td className="td-num">{miles(l.egr)}</td><td className="td-num">{miles(l.baja)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr><td className="td-loc"><b>Total</b></td><td className="td-num"><b>{miles(r.ag.cursos)}</b></td><td className="td-num"><b>{miles(r.insc)}</b></td>
                  <td className="td-num"><b>{miles(nEstado(r, "EGRESADO"))}</b></td><td className="td-num"><b>{miles(nEstado(r, "BAJA"))}</b></td></tr></tfoot>
              </table>
            </div>
          </section>
        )}

        <div className="grid grid-2" style={{ marginTop: 20 }}>
          <section className="card">
            <header><div><h2>Inscripciones por estado</h2><p className="sub">Situación actual de cada inscripción</p></div></header>
            <BarraPartes unidad="inscripciones" etiquetas items={r.estados.map(e => ({ clave: e.c, etiqueta: TITULO_ESTADO[e.c] ?? e.c, valor: e.v, color: COLOR_ESTADO[e.c] ?? "#9aa3b2" }))} />
          </section>
          <section className="card">
            <header><div><h2>Cursos por sector productivo</h2><p className="sub">Clic en un sector para filtrar todo el tablero</p></div></header>
            <BarrasH unidad="cursos" seleccion={f.sector >= 0 ? d.sectores[f.sector] : null} onSelect={k => set({ sector: k ? d.sectores.indexOf(k) : -1 })}
              items={r.porSector.map((g, i) => ({ clave: d.sectores[i], etiqueta: d.sectores[i], valor: g.cursos, color: colorSerie(i), detalle: `${miles(g.insc)} inscripciones` }))
                .filter(x => x.valor > 0).sort((a, b) => b.valor - a.valor).slice(0, 12)} />
          </section>
        </div>

        {r.meses.length > 1 && (
          <section className="card" style={{ marginTop: 20 }}>
            <header><div><h2>Inscripciones por mes de inicio del curso</h2><p className="sub">Apiladas por estado actual</p></div></header>
            <ColumnasApiladas titulo="Inscripciones por mes de inicio" unidad="inscripciones" meses={r.meses}
              series={off.estado.cats.map((c, i) => ({ clave: c, etiqueta: TITULO_ESTADO[c] ?? c, color: COLOR_ESTADO[c] ?? "#9aa3b2", idx: i }))} />
          </section>
        )}

        <div className="grid grid-2" style={{ marginTop: 20 }}>
          {GRUPOS_PERFIL.map(([k, t], gi) => (
            <section className="card" key={k}>
              <header><div><h2>{t}</h2><p className="sub">{miles(r.insc)} inscripciones</p></div></header>
              <BarrasH unidad="inscripciones" total={r.insc} items={r.grupos[k].map((x, i) => ({
                clave: x.c, etiqueta: k === "sexo" ? TITULO_SEXO[x.c] ?? x.c : x.c, valor: x.v, color: k === "sexo" ? ["#1baf7a", "#2a78d6", "#9aa3b2"][i] : colorSerie(i + gi) }))} />
            </section>
          ))}
        </div>

        <section className="card" style={{ marginTop: 20 }} aria-label="Cursos">
          <header>
            <div><h2>Cursos</h2><p className="sub">{miles(filas.length)} {filas.length === 1 ? "curso" : "cursos"} en {nivel === "general" ? "todo Córdoba" : ambito}{tfActivos ? ` (de ${miles(r.ag.cursos)})` : ""}{filas.length > MAX_FILAS ? ` · se muestran los ${MAX_FILAS} con más inscripciones` : ""}</p></div>
          </header>
          <div className="filtros filtros-tabla" aria-label="Filtros de la tabla de cursos">
            {([["Institución", "inst", opciones.inst, "Todas las instituciones"], ["Curso", "curso", opciones.curso, "Todos los cursos"], ["Sector productivo", "sector", opciones.sector, "Todos los sectores"]] as const).map(([titulo, k, lista, todos]) => (
              <div className="filtro-sel" key={k}>
                <label>{titulo}
                  <select value={tf[k]} onChange={e => setTf(x => ({ ...x, [k]: +e.target.value }))}>
                    <option value={-1}>{todos}</option>
                    {lista.map(o => <option key={o.i} value={o.i}>{o.t}</option>)}
                  </select>
                </label>
              </div>
            ))}
            <div className="filtro-sel"><label>Buscar
              <input type="search" placeholder="Curso o institución" value={tf.texto} onChange={e => setTf(x => ({ ...x, texto: e.target.value }))} aria-label="Buscar curso o institución" /></label></div>
            <button className="limpiar" type="button" style={{ visibility: tfActivos ? "visible" : "hidden" }} onClick={() => setTf({ inst: -1, curso: -1, sector: -1, texto: "" })}>Limpiar filtros de la tabla</button>
          </div>
          <div className="tabla-detalle">
            <table className="cmc-tabla-cursos">
              <thead><tr><th className="th-loc">Curso</th><th>Institución</th><th>Localidad</th><th>Inicio</th><th className="th-num">Inscriptos</th><th className="th-num">Egresados</th><th className="th-num">Bajas</th>{verPersonas && <th>Participantes</th>}</tr></thead>
              <tbody>
                {!filas.length && <tr><td colSpan={verPersonas ? 8 : 7}>No hay cursos con esos filtros.</td></tr>}
                {filas.slice(0, MAX_FILAS).map(i => { const c = d.cursos[i], z = d.zonas[c[C.zona]], v = d.perfil[i]; return (
                  <tr key={c[C.id]}>
                    <td className="td-loc td-curso">{d.cursos_nombres[c[C.curso]]}</td>
                    <td>{d.inst[c[C.inst]]}</td>
                    <td>{nombreDep(z[1])}<br /><small>{nombreDep(d.dep[z[0]])}</small></td>
                    <td>{c[C.mes] >= 0 ? mesTexto(d.meses[c[C.mes]]) : "—"}</td>
                    <td className="td-num">{miles(v[0])}</td><td className="td-num">{miles(v[iEgr])}</td><td className="td-num">{miles(v[iBaja])}</td>
                    {verPersonas && <td><Link className="enlace-zona" href={`/cba-me-capacita/participantes?curso=${c[C.id]}`}>Ver lista</Link></td>}
                  </tr>); })}
              </tbody>
            </table>
          </div>
        </section>
      </div></main>

      {imprimiendo && typeof document !== "undefined" && createPortal(
        <div className="hojas-impresion">
          <style>{"@page{size:A4 portrait;margin:0}"}</style>
          <HojasResumenCmc d={d} r={r} cx={cx} nivel={nivel} titulo={titulo} ambito={ambito} filtros={filtrosTexto} depSel={f.dep} />
        </div>, document.body)}
    </>
  );
}
