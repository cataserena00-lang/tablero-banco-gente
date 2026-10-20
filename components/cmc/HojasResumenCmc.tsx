"use client";
import { BarraPartes, BarrasH, ColumnasApiladas, colorSerie } from "../graficos";
import { fmtF, miles, nombreDep } from "@/lib/formato";
import { C, COLOR_ESTADO, aniosTexto, conAlFinal, GRUPOS_PERFIL, TITULO_ESTADO, TITULO_SEXO, mesTexto, nEstado, pct, type Contexto, type DatosCmc, type Resumen } from "@/lib/cmc";
import AvisoDatos from "./AvisoDatos";
import HojasFlujo, { type Bloque } from "./HojasFlujo";

/* Hojas impresas del resumen de Córdoba me capacita (general, de un departamento, de una localidad o de varias zonas): páginas A4 con cabecera y pie
   de marca, pensadas para "Guardar como PDF" desde el diálogo de impresión. Solo agregados: las ven todos los perfiles.
   El contenido fluye por las hojas (HojasFlujo): indicadores, estados, sectores, perfil de los participantes, evolución por mes de inicio y el detalle
   (departamentos en el general, localidades en un departamento, zonas en el conjunto o cursos en una localidad). Los bloques de sectores, perfil, evolución y detalle cambian
   de lugar entre sí si así se evita una última hoja casi vacía. */

export type Nivel = "general" | "dep" | "loc" | "zonas";   // "zonas": varias zonas elegidas a la vez (resumen conjunto)
const MAX_CURSOS = 40;

export default function HojasResumenCmc({ d, r, cx, nivel, titulo, ambito, filtros: filtrosTodos, depSel, zonasTabla = [], nota, periodo }: {
  d: DatosCmc; r: Resumen; cx: Contexto; nivel: Nivel; titulo: string; ambito: string; filtros: string[]; depSel: number;
  zonasTabla?: { nombre: string; cursos: number; insc: number; egr: number }[];   // solo para nivel «zonas»
  nota?: string;                                                      // aclaración al pie de la tabla de detalle
  periodo?: string;                                                   // años que cubre el resumen (por defecto, todos los de los datos)
}) {
  const filtros = filtrosTodos.filter(t => !t.startsWith("Año:"));   // el año ya está en «Datos de …»
  const hayFiltros = filtros.length > 0;
  const anios = periodo ?? aniosTexto(d);
  const off = cx.off;
  const sectores = r.porSector.map((g, i) => ({ clave: d.sectores[i], etiqueta: d.sectores[i], valor: g.cursos, color: colorSerie(i), detalle: `${miles(g.insc)} insc.` }))
    .filter(x => x.valor > 0).sort((a, b) => b.valor - a.valor).slice(0, 10).sort(conAlFinal(x => x.etiqueta, (a, b) => b.valor - a.valor));
  const subs = nivel === "zonas" ? zonasTabla.map(z => ({ k: z.nombre, ...z })) : nivel === "general"
    ? d.dep.map((n, i) => ({ k: n, nombre: nombreDep(n), ...r.porDep[i] })).filter(x => x.cursos > 0).sort(conAlFinal(x => x.nombre, (a, b) => b.insc - a.insc))
    : nivel === "dep"
      ? d.zonas.map((z, i) => ({ k: String(i), nombre: nombreDep(z[1]), dep: z[0], ...r.porZona[i] })).filter(x => x.dep === depSel && x.cursos > 0).sort(conAlFinal(x => x.nombre, (a, b) => b.insc - a.insc))
      : [];
  const totalInsc = subs.reduce((a, x) => a + x.insc, 0), totalEgr = subs.reduce((a, x) => a + x.egr, 0);
  const cursos = nivel === "loc" ? [...r.ag.indices].sort((a, b) => d.perfil[b][0] - d.perfil[a][0]) : [];
  const perfil = (k: string, t: string, gi: number) => (
    <div key={k}>
      <h3 className="acto-sub">{t}</h3>
      <BarrasH unidad="inscripciones" total={r.insc} items={r.grupos[k].map((x, i) => ({
        clave: x.c, etiqueta: k === "sexo" ? TITULO_SEXO[x.c] ?? x.c : x.c, valor: x.v, color: k === "sexo" ? ["#1baf7a", "#2a78d6", "#9aa3b2"][i] : colorSerie(i + gi) }))} />
    </div>
  );
  const etiquetaNivel = nivel === "general" ? "Resumen general" : nivel === "zonas" ? "Resumen conjunto" : nivel === "dep" ? "Departamento" : "Localidad";
  const detalleTitulo = nivel === "general" ? "Departamentos" : nivel === "zonas" ? "Zonas elegidas" : nivel === "dep" ? "Localidades" : "Cursos";
  const unidades = nivel === "general" ? "departamentos" : nivel === "zonas" ? "zonas" : "localidades";
  const subDetalle = nivel === "loc" ? `${miles(r.ag.cursos)} cursos${r.ag.cursos > MAX_CURSOS ? ` · los ${MAX_CURSOS} con más inscripciones` : ""}` : `${miles(subs.length)} ${unidades} por inscripciones`;
  const cab = (t: string) => <header><div><p className="zona-etiqueta">{titulo}</p><h2>{t}</h2></div></header>;

  const bloques: Bloque[] = [
    { id: "titulo", nodo: (
      <header><div>
        <p className="zona-etiqueta">{etiquetaNivel}</p>
        <h2>{titulo}</h2>
        <p className="sub">Datos de {anios}{hayFiltros ? ` · Filtros: ${filtros.join(" · ")}` : " · Sin filtros"}</p>
      </div></header>) },
    { id: "salvedad", nodo: <AvisoDatos /> },
    { id: "kpis", nodo: (
      <div className="kpis kpis-5">
        <div className="kpi"><span>Cursos</span><b>{miles(r.ag.cursos)}</b><small>dictados en {anios}</small></div>
        <div className="kpi"><span>Inscripciones</span><b>{miles(r.insc)}</b><small>{r.unicos ? `${miles(r.unicos.personas)} personas distintas` : "según los filtros elegidos"}</small></div>
        <div className="kpi"><span>Egresados</span><b>{miles(nEstado(r, "EGRESADO"))}</b><small>{pct(nEstado(r, "EGRESADO"), r.insc)} de las inscripciones</small></div>
        <div className="kpi"><span>Bajas</span><b>{miles(nEstado(r, "BAJA"))}</b><small>{pct(nEstado(r, "BAJA"), r.insc)} de las inscripciones</small></div>
        <div className="kpi"><span>Capacitadores</span><b>{r.capacitadores === null ? "—" : miles(r.capacitadores)}</b><small>distintos</small></div>
      </div>) },
    { id: "estados", nodo: (
      <><h3 className="acto-sub">Inscripciones por estado</h3>
        <BarraPartes unidad="inscripciones" etiquetas items={r.estados.map(e => ({ clave: e.c, etiqueta: TITULO_ESTADO[e.c] ?? e.c, valor: e.v, color: COLOR_ESTADO[e.c] ?? "#9aa3b2" }))} /></>) },
    { id: "perfil1", nodo: (<><h3 className="acto-sub">Características de los participantes de los cursos</h3><div className="hoja-dos-col">{GRUPOS_PERFIL.slice(0, 2).map(([k, t], gi) => perfil(k, t, gi))}</div></>) },
    { id: "perfil2", nodo: (<div className="hoja-dos-col">{GRUPOS_PERFIL.slice(2).map(([k, t], gi) => perfil(k, t, gi + 2))}</div>) },
    { id: "sectores", nodo: (<><h3 className="acto-sub">Top 10 de sectores productivos con más cursos</h3><BarrasH unidad="cursos" items={sectores} /></>) },
    ...(r.meses.length > 1 ? [{ id: "meses", nodo: (
      <><h3 className="acto-sub">Inscripciones por mes de inicio del curso</h3>
        <ColumnasApiladas titulo="Inscripciones por mes de inicio" unidad="inscripciones" meses={r.meses}
          series={off.estado.cats.map((c, i) => ({ clave: c, etiqueta: TITULO_ESTADO[c] ?? c, color: COLOR_ESTADO[c] ?? "#9aa3b2", idx: i }))} /></>) } as Bloque] : []),
    nivel === "loc" ? { id: "detalle", tabla: {
      titulo: <div style={{ marginTop: 14 }}>{cab(detalleTitulo)}<p className="sub">{subDetalle}</p></div>,
      continuacion: <p className="sub" style={{ marginTop: 6 }}>{detalleTitulo} (continuación)</p>,
      cabecera: <tr><th className="th-loc">Curso</th><th>Institución</th><th>Inicio</th><th className="th-num">Inscriptos</th><th className="th-num">Egresados</th><th className="th-num">% de finalización</th><th className="th-num">Bajas</th></tr>,
      filas: cursos.slice(0, MAX_CURSOS).map(i => { const c = d.cursos[i], v = d.perfil[i]; return (
        <tr key={c[C.id]}><td className="td-loc">{d.cursos_nombres[c[C.curso]]}</td><td>{d.inst[c[C.inst]]}</td><td>{c[C.mes] >= 0 ? mesTexto(d.meses[c[C.mes]]) : "—"}</td>
          <td className="td-num">{miles(v[0])}</td><td className="td-num">{miles(v[off.estado.ini + off.estado.cats.indexOf("EGRESADO")])}</td>
          <td className="td-num">{pct(v[off.estado.ini + off.estado.cats.indexOf("EGRESADO")], v[0])}</td>
          <td className="td-num">{miles(v[off.estado.ini + off.estado.cats.indexOf("BAJA")])}</td></tr>); }),
    } } : { id: "detalle", tabla: {
      titulo: <div style={{ marginTop: 14 }}>{cab(detalleTitulo)}<p className="sub">{subDetalle}</p></div>,
      continuacion: <p className="sub" style={{ marginTop: 6 }}>{detalleTitulo} (continuación)</p>,
      cabecera: <tr><th className="th-loc">{nivel === "general" ? "Departamento" : nivel === "zonas" ? "Zona" : "Localidad"}</th><th className="th-num">Cursos</th><th className="th-num">Inscripciones</th><th className="th-num">Egresados</th><th className="th-num">% de finalización</th></tr>,
      filas: subs.map(x => <tr key={x.k}><td className="td-loc">{x.nombre}</td><td className="td-num">{miles(x.cursos)}</td><td className="td-num">{miles(x.insc)}</td><td className="td-num">{miles(x.egr)}</td><td className="td-num">{pct(x.egr, x.insc)}</td></tr>),
      pie: <tfoot><tr><td className="td-loc"><b>Total</b></td><td className="td-num"><b>{miles(subs.reduce((a, x) => a + x.cursos, 0))}</b></td><td className="td-num"><b>{miles(totalInsc)}</b></td><td className="td-num"><b>{miles(totalEgr)}</b></td><td className="td-num"><b>{pct(totalEgr, totalInsc)}</b></td></tr></tfoot>,
    } },
    ...(nota ? [{ id: "nota", nodo: <p className="nota" style={{ marginTop: 8 }}>{nota}</p> } as Bloque] : []),
  ];
  return <HojasFlujo bloques={bloques} actualizado={fmtF(d.actualizado)} detalle={ambito} movibles={["perfil1", "perfil2", "sectores", "meses", "detalle"]} />;
}
