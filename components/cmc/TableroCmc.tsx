"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { BarraPartes, BarrasH, ColumnasApiladas, colorSerie } from "../graficos";
import { LogoCmc } from "../Marca";
import { fmtF, miles, nombreDep } from "@/lib/formato";
import { SIN_FILTRO, agregar, agrupar, mesTexto, normaliza, offsets, pct, unicosDe, C, type DatosCmc, type Filtro } from "@/lib/cmc";
import type { GeoData } from "../Tablero";
import PanelNominalCmc from "./PanelNominalCmc";

/* Tablero de Córdoba me capacita: cursos, inscripciones (ASECOR) y perfil de participantes, siempre agregados.
   Todo se calcula acá con los cursos que pasan los filtros; el perfil de cada curso viene sumado desde el pipeline. */

const ESC = ["#E6EEF6", "#9DB9D6", "#4F7FB0", "#0B4680", "#06284B"];
function colorMapa(v: number, max: number) {
  if (!v) return null;
  const t = Math.min(.999, Math.sqrt(v / max)) * (ESC.length - 1), i = Math.floor(t), fr = t - i;
  const hex = (c: string) => [1, 3, 5].map(j => parseInt(c.slice(j, j + 2), 16));
  const a = hex(ESC[i]), b = hex(ESC[Math.min(i + 1, ESC.length - 1)]);
  return "rgb(" + a.map((x, j) => Math.round(x + (b[j] - x) * fr)).join(",") + ")";
}
const COLOR_ESTADO: Record<string, string> = { INSCRIPTO: "#9aa3b2", CURSANDO: "#2a78d6", APROBADO: "#1baf7a", EGRESADO: "#008300", "NO APROBADO": "#eda100", BAJA: "#e34948" };
const TITULO: Record<string, string> = { INSCRIPTO: "Inscriptos", CURSANDO: "Cursando", APROBADO: "Aprobados", EGRESADO: "Egresados", "NO APROBADO": "No aprobados", BAJA: "Bajas" };
const MAX_FILAS = 100;

export default function TableroCmc({ datos: d, geo, verPersonas = false }: { datos: DatosCmc; geo: GeoData | null; verPersonas?: boolean }) {
  const [f, setF] = useState<Filtro>(SIN_FILTRO);
  const [metMapa, setMetMapa] = useState<"insc" | "cursos">("insc");
  const [cursoSel, setCursoSel] = useState<number | null>(null);   // id del curso elegido en la tabla (solo perfil completo)
  const panelRef = useRef<HTMLDivElement>(null);
  const set = (p: Partial<Filtro>) => setF(x => ({ ...x, ...p }));
  const off = useMemo(() => offsets(d), [d]);
  const nombresNorm = useMemo(() => d.cursos_nombres.map(normaliza), [d]);
  const instNorm = useMemo(() => d.inst.map(normaliza), [d]);

  const ag = useMemo(() => agregar(d, f, nombresNorm, instNorm), [d, f, nombresNorm, instNorm]);
  // Para el mapa y el ranking de departamentos no se aplica el filtro de zona (si no, solo se vería el elegido).
  const agMapa = useMemo(() => agregar(d, { ...f, dep: -1, zona: -1 }, nombresNorm, instNorm), [d, f, nombresNorm, instNorm]);
  const porDep = useMemo(() => agrupar(d, agMapa.indices, c => d.zonas[c[C.zona]][0], d.dep.length), [d, agMapa]);
  const porZona = useMemo(() => agrupar(d, ag.indices, c => c[C.zona], d.zonas.length), [d, ag]);
  const porSector = useMemo(() => agrupar(d, agregar(d, { ...f, sector: -1 }, nombresNorm, instNorm).indices, c => c[C.sector], d.sectores.length), [d, f, nombresNorm, instNorm]);
  const unicos = unicosDe(d, f);

  const p = ag.perfil, insc = p[0];
  const grupo = (n: string) => { const o = off[n]; return o.cats.map((c, i) => ({ c, v: p[o.ini + i] })); };
  const estados = grupo("estado");
  const nEstado = (e: string) => estados.find(x => x.c === e)?.v ?? 0;

  // Evolución por mes de inicio del curso, con las inscripciones apiladas por estado
  const serieMeses = useMemo(() => {
    const o = off.estado, mapa = new Map<number, number[]>();
    for (const i of ag.indices) {
      const m = d.cursos[i][C.mes]; if (m < 0) continue;
      const v = mapa.get(m) ?? new Array(o.cats.length).fill(0);
      for (let k = 0; k < o.cats.length; k++) v[k] += d.perfil[i][o.ini + k];
      mapa.set(m, v);
    }
    return [...mapa.entries()].sort((a, b) => a[0] - b[0]).map(([m, v]) => ({ mes: d.meses[m], v }));
  }, [d, off, ag]);

  const depSel = f.dep >= 0 ? d.dep[f.dep] : null;
  const zonaSel = f.zona >= 0 ? d.zonas[f.zona] : null;
  const maxDep = Math.max(1, ...porDep.map(g => (metMapa === "insc" ? g.insc : g.cursos)));
  const valDep = (g: { cursos: number; insc: number }) => (metMapa === "insc" ? g.insc : g.cursos);
  const rankDeps = d.dep.map((n, i) => ({ n, i, ...porDep[i] })).filter(x => valDep(x) > 0).sort((a, b) => valDep(b) - valDep(a));
  const rankZonas = d.zonas.map((z, i) => ({ i, loc: z[1], dep: z[0], ...porZona[i] })).filter(x => x.dep === f.dep && x.cursos > 0).sort((a, b) => b.insc - a.insc);

  const filas = useMemo(() => [...ag.indices].sort((a, b) => d.perfil[b][0] - d.perfil[a][0]), [ag, d]);
  const chips: { label: string; clear: () => void }[] = [];
  if (depSel) chips.push({ label: `Departamento: ${nombreDep(depSel)}`, clear: () => set({ dep: -1, zona: -1 }) });
  if (zonaSel) chips.push({ label: `Localidad: ${nombreDep(zonaSel[1])}`, clear: () => set({ zona: -1 }) });
  if (f.sector >= 0) chips.push({ label: `Sector: ${d.sectores[f.sector]}`, clear: () => set({ sector: -1 }) });
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
  const alcanceNominal = verPersonas && (cursoSel !== null || depSel)
    ? { curso: cursoSel, dep: depSel, loc: zonaSel ? zonaSel[1] : null, nombre: zonaSel ? `${nombreDep(zonaSel[1])}, ${nombreDep(depSel!)}` : depSel ? `Departamento ${nombreDep(depSel)}` : "" }
    : null;
  useEffect(() => { if (cursoSel !== null) panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, [cursoSel]);
  const hayFiltros = JSON.stringify(f) !== JSON.stringify(SIN_FILTRO);

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
        <section className="filtros" aria-label="Filtros">
          {sel("Etapa", f.etapa, d.etapas, i => set({ etapa: i }), "Todas")}
          {sel("Sector productivo", f.sector, d.sectores, i => set({ sector: i }), "Todos")}
          {sel("Tipo de institución", f.tipo, d.tipos, i => set({ tipo: i }), "Todos")}
          {sel("Modalidad", f.modalidad, d.modalidades, i => set({ modalidad: i }), "Todas")}
          {sel("Inicio desde", f.desde, d.meses.map(mesTexto), i => set({ desde: i, hasta: f.hasta >= 0 && f.hasta < i ? i : f.hasta }), "Primer mes")}
          {sel("Inicio hasta", f.hasta, d.meses.map(mesTexto), i => set({ hasta: i, desde: f.desde > i ? i : f.desde }), "Último mes")}
          <button className="limpiar" type="button" style={{ visibility: hayFiltros ? "visible" : "hidden" }} onClick={() => setF(SIN_FILTRO)}>Limpiar filtros</button>
        </section>
        {chips.length > 0 && (
          <div className="chips" aria-live="polite">
            {chips.map(c => <span key={c.label} className="chip">{c.label}<button type="button" aria-label={`Quitar filtro: ${c.label}`} onClick={c.clear}>×</button></span>)}
          </div>
        )}

        <section className="kpis kpis-4" aria-label="Indicadores" style={{ marginTop: 20 }}>
          <div className="kpi"><span>Cursos</span><b>{miles(ag.cursos)}</b><small>dictados desde {d.desde.slice(0, 4)}</small></div>
          <div className="kpi"><span>Inscripciones</span><b>{miles(insc)}</b>
            <small>{unicos ? `${miles(unicos.personas)} personas distintas` : "personas distintas: se calcula sin filtros de sector, tipo, modalidad ni período"}</small></div>
          <div className="kpi"><span>Egresados</span><b>{miles(nEstado("EGRESADO"))}</b><small>{pct(nEstado("EGRESADO"), insc)} de las inscripciones</small></div>
          <div className="kpi"><span>Bajas</span><b>{miles(nEstado("BAJA"))}</b><small>{pct(nEstado("BAJA"), insc)} de las inscripciones{unicos ? ` · ${miles(unicos.capacitadores)} capacitadores` : ""}</small></div>
        </section>

        <div className="grid grid-mapa" style={{ marginTop: 20 }}>
          {geo && (
            <section className="card">
              <header>
                <div><h2>Departamentos de Córdoba</h2><p className="sub">Los datos son de dónde se dicta el curso · clic en un departamento para ver sus localidades</p></div>
                <div className="seg" role="group" aria-label="Métrica del mapa">
                  <button type="button" aria-pressed={metMapa === "insc"} onClick={() => setMetMapa("insc")}>Inscripciones</button>
                  <button type="button" aria-pressed={metMapa === "cursos"} onClick={() => setMetMapa("cursos")}>Cursos</button>
                </div>
              </header>
              <div className="chartbox" style={{ position: "relative" }}>
                <svg className="mapa" viewBox={`0 0 ${geo.w} ${geo.h}`} role="img" aria-label="Mapa de departamentos de Córdoba">
                  {geo.deptos.map(g => {
                    const i = d.dep.indexOf(g.nombre), x = i >= 0 ? porDep[i] : null, v = x ? valDep(x) : 0, col = colorMapa(v, maxDep);
                    return <path key={g.nombre} className={`dep${col ? "" : " vacio"}${depSel === g.nombre ? " sel" : ""}`} d={g.d} fill={col || "#E5E7EB"}
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
            {depSel ? (
              <>
                <header><div><h2>Localidades de {nombreDep(depSel)}</h2><p className="sub">{rankZonas.length} localidades por inscripciones · clic para filtrar</p></div>
                  <button type="button" className="acto-link" onClick={() => set({ dep: -1, zona: -1 })}>Ver todos los departamentos</button></header>
                <ol className="rank">
                  {rankZonas.map(z => { const max = rankZonas[0]?.insc || 1; return (
                    <li key={z.i} onClick={() => set({ zona: f.zona === z.i ? -1 : z.i })} style={{ cursor: "pointer", fontWeight: f.zona === z.i ? 700 : undefined }} role="button" tabIndex={0}
                      onKeyDown={e => { if (e.key === "Enter") set({ zona: f.zona === z.i ? -1 : z.i }); }}>
                      <span title={nombreDep(z.loc)}>{nombreDep(z.loc)}</span><div className="bar"><i style={{ width: `${z.insc / max * 100}%` }} /></div><span>{miles(z.insc)}</span>
                    </li>); })}
                </ol>
              </>
            ) : (
              <>
                <header><div><h2>Ranking de departamentos</h2><p className="sub">{rankDeps.length} departamentos por {metMapa === "insc" ? "inscripciones" : "cursos"} · clic para ver detalle</p></div></header>
                <ol className="rank">
                  {rankDeps.map(x => { const max = valDep(rankDeps[0]) || 1; return (
                    <li key={x.n} onClick={() => set({ dep: x.i, zona: -1 })} style={{ cursor: "pointer" }} role="button" tabIndex={0}
                      onKeyDown={e => { if (e.key === "Enter") set({ dep: x.i, zona: -1 }); }}>
                      <span title={nombreDep(x.n)}>{nombreDep(x.n)}</span><div className="bar"><i style={{ width: `${valDep(x) / max * 100}%` }} /></div><span>{miles(valDep(x))}</span>
                    </li>); })}
                </ol>
              </>
            )}
          </section>
        </div>

        <div className="grid grid-2" style={{ marginTop: 20 }}>
          <section className="card">
            <header><div><h2>Inscripciones por estado</h2><p className="sub">Situación actual de cada inscripción</p></div></header>
            <BarraPartes unidad="inscripciones" etiquetas items={estados.map(e => ({ clave: e.c, etiqueta: TITULO[e.c] ?? e.c, valor: e.v, color: COLOR_ESTADO[e.c] ?? "#9aa3b2" }))} />
          </section>
          <section className="card">
            <header><div><h2>Cursos por sector productivo</h2><p className="sub">Clic en un sector para filtrar todo el tablero</p></div></header>
            <BarrasH unidad="cursos" seleccion={f.sector >= 0 ? d.sectores[f.sector] : null}
              onSelect={k => set({ sector: k ? d.sectores.indexOf(k) : -1 })}
              items={porSector.map((g, i) => ({ clave: d.sectores[i], etiqueta: d.sectores[i], valor: g.cursos, color: colorSerie(i), detalle: `${miles(g.insc)} inscripciones` }))
                .filter(x => x.valor > 0).sort((a, b) => b.valor - a.valor).slice(0, 12)} />
          </section>
        </div>

        {serieMeses.length > 1 && (
          <section className="card" style={{ marginTop: 20 }}>
            <header><div><h2>Inscripciones por mes de inicio del curso</h2><p className="sub">Apiladas por estado actual</p></div></header>
            <ColumnasApiladas titulo="Inscripciones por mes de inicio" unidad="inscripciones" meses={serieMeses}
              series={off.estado.cats.map((c, i) => ({ clave: c, etiqueta: TITULO[c] ?? c, color: COLOR_ESTADO[c] ?? "#9aa3b2", idx: i }))} />
          </section>
        )}

        <div className="grid grid-2" style={{ marginTop: 20 }}>
          {([["sexo", "Sexo", ["#1baf7a", "#2a78d6", "#9aa3b2"]], ["edad", "Edad", null], ["estudios", "Nivel de estudios", null], ["trabajo", "Situación laboral", null]] as const).map(([k, t, cols]) => (
            <section className="card" key={k}>
              <header><div><h2>{t}</h2><p className="sub">{miles(insc)} inscripciones</p></div></header>
              <BarrasH unidad="inscripciones" total={insc} items={grupo(k).map((x, i) => ({
                clave: x.c, etiqueta: k === "sexo" ? ({ F: "Mujeres", M: "Varones", X: "Otro" } as Record<string, string>)[x.c] ?? x.c : x.c, valor: x.v, color: cols ? cols[i] : colorSerie(i) }))} />
            </section>
          ))}
        </div>

        <div ref={panelRef} style={{ scrollMarginTop: 12 }}>
          {alcanceNominal && <PanelNominalCmc alcance={alcanceNominal} onCerrarCurso={() => setCursoSel(null)} />}
        </div>

        <section className="card" style={{ marginTop: 20 }}>
          <header>
            <div><h2>Cursos</h2><p className="sub">{miles(ag.cursos)} cursos{ag.cursos > MAX_FILAS ? ` · se muestran los ${MAX_FILAS} con más inscripciones` : ""}{verPersonas ? " · elegí un curso para ver quiénes participan" : ""}</p></div>
            <div className="cmc-buscar"><input type="search" placeholder="Buscar curso o institución" value={f.curso} onChange={e => set({ curso: e.target.value })} aria-label="Buscar curso o institución" /></div>
          </header>
          <div className="tabla-detalle">
            <table className="cmc-tabla-cursos">
              <thead><tr><th className="th-loc">Curso</th><th>Institución</th><th>Localidad</th><th>Inicio</th><th className="th-num">Inscriptos</th><th className="th-num">Egresados</th><th className="th-num">Bajas</th></tr></thead>
              <tbody>
                {filas.slice(0, MAX_FILAS).map(i => { const c = d.cursos[i], z = d.zonas[c[C.zona]], v = d.perfil[i]; return (
                  <tr key={c[C.id]} aria-selected={cursoSel === c[C.id]} style={{ cursor: verPersonas ? "pointer" : undefined, background: cursoSel === c[C.id] ? "var(--celeste-claro)" : undefined }}
                    onClick={verPersonas ? () => setCursoSel(cursoSel === c[C.id] ? null : c[C.id]) : undefined}
                    onKeyDown={verPersonas ? e => { if (e.key === "Enter") setCursoSel(cursoSel === c[C.id] ? null : c[C.id]); } : undefined} tabIndex={verPersonas ? 0 : undefined}>
                    <td className="td-loc td-curso">{d.cursos_nombres[c[C.curso]]}</td>
                    <td>{d.inst[c[C.inst]]}</td>
                    <td>{nombreDep(z[1])}<br /><small>{nombreDep(d.dep[z[0]])}</small></td>
                    <td>{c[C.mes] >= 0 ? mesTexto(d.meses[c[C.mes]]) : "—"}</td>
                    <td className="td-num">{miles(v[0])}</td>
                    <td className="td-num">{miles(v[off.estado.ini + off.estado.cats.indexOf("EGRESADO")])}</td>
                    <td className="td-num">{miles(v[off.estado.ini + off.estado.cats.indexOf("BAJA")])}</td>
                  </tr>); })}
              </tbody>
            </table>
          </div>
        </section>
      </div></main>
    </>
  );
}
