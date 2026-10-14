"use client";
import { BarraPartes, BarrasH, ColumnasApiladas, colorSerie } from "../graficos";
import { CabeceraHojaCmc, PieHoja } from "../Marca";
import { fmtF, miles, nombreDep } from "@/lib/formato";
import { C, COLOR_ESTADO, GRUPOS_PERFIL, TITULO_ESTADO, TITULO_SEXO, mesTexto, nEstado, pct, type Contexto, type DatosCmc, type Resumen } from "@/lib/cmc";

/* Hojas impresas del resumen de Córdoba me capacita (general, de un departamento o de una localidad): tres páginas A4 con cabecera y pie
   de marca, pensadas para "Guardar como PDF" desde el diálogo de impresión. Solo agregados: las ven todos los perfiles.
     1. Indicadores, estado de las inscripciones y sectores.
     2. Perfil de los participantes y evolución por mes de inicio.
     3. Detalle: departamentos (general), localidades (departamento) o cursos (localidad). */

export type Nivel = "general" | "dep" | "loc";
const MAX_CURSOS = 30;

export default function HojasResumenCmc({ d, r, cx, nivel, titulo, ambito, filtros, depSel }: {
  d: DatosCmc; r: Resumen; cx: Contexto; nivel: Nivel; titulo: string; ambito: string; filtros: string[]; depSel: number;
}) {
  const act = fmtF(d.actualizado);
  const hayFiltros = filtros.length > 0;
  const sectores = r.porSector.map((g, i) => ({ clave: d.sectores[i], etiqueta: d.sectores[i], valor: g.cursos, color: colorSerie(i), detalle: `${miles(g.insc)} insc.` }))
    .filter(x => x.valor > 0).sort((a, b) => b.valor - a.valor).slice(0, 10);
  const subs = nivel === "general"
    ? d.dep.map((n, i) => ({ k: n, nombre: nombreDep(n), ...r.porDep[i] })).filter(x => x.cursos > 0).sort((a, b) => b.insc - a.insc)
    : nivel === "dep"
      ? d.zonas.map((z, i) => ({ k: String(i), nombre: nombreDep(z[1]), dep: z[0], ...r.porZona[i] })).filter(x => x.dep === depSel && x.cursos > 0).sort((a, b) => b.insc - a.insc)
      : [];
  const totalInsc = subs.reduce((a, x) => a + x.insc, 0);
  const cursos = nivel === "loc" ? [...r.ag.indices].sort((a, b) => d.perfil[b][0] - d.perfil[a][0]) : [];
  const off = cx.off;

  return (
    <>
      <div className="hoja hoja-panorama">
        <CabeceraHojaCmc actualizado={act} detalle={ambito} />
        <section className="card acto-ficha" aria-label="Resumen">
          <header><div>
            <p className="zona-etiqueta">{nivel === "general" ? "Resumen general" : nivel === "dep" ? "Departamento" : "Localidad"}</p>
            <h2>{titulo}</h2>
            <p className="sub">Cursos desde {d.desde.slice(0, 4)}{hayFiltros ? ` · Filtros: ${filtros.join(" · ")}` : " · Sin filtros"}</p>
          </div></header>
          <div className="kpis kpis-4">
            <div className="kpi"><span>Cursos</span><b>{miles(r.ag.cursos)}</b><small>dictados desde {d.desde.slice(0, 4)}</small></div>
            <div className="kpi"><span>Inscripciones</span><b>{miles(r.insc)}</b><small>{r.unicos ? `${miles(r.unicos.personas)} personas distintas` : "según los filtros elegidos"}</small></div>
            <div className="kpi"><span>Egresados</span><b>{miles(nEstado(r, "EGRESADO"))}</b><small>{pct(nEstado(r, "EGRESADO"), r.insc)} de las inscripciones</small></div>
            <div className="kpi"><span>Bajas</span><b>{miles(nEstado(r, "BAJA"))}</b><small>{pct(nEstado(r, "BAJA"), r.insc)}{r.unicos ? ` · ${miles(r.unicos.capacitadores)} capacitadores` : ""}</small></div>
          </div>
          <h3 className="acto-sub">Inscripciones por estado</h3>
          <BarraPartes unidad="inscripciones" etiquetas items={r.estados.map(e => ({ clave: e.c, etiqueta: TITULO_ESTADO[e.c] ?? e.c, valor: e.v, color: COLOR_ESTADO[e.c] ?? "#9aa3b2" }))} />
          <h3 className="acto-sub">Cursos por sector productivo</h3>
          <BarrasH unidad="cursos" items={sectores} />
        </section>
        <PieHoja />
      </div>

      <div className="hoja hoja-panorama">
        <CabeceraHojaCmc actualizado={act} detalle={ambito} />
        <section className="card acto-ficha" aria-label="Perfil de los participantes">
          <header><div><p className="zona-etiqueta">{titulo}</p><h2>Perfil de los participantes</h2><p className="sub">{miles(r.insc)} inscripciones</p></div></header>
          <div className="hoja-dos-col">
            {GRUPOS_PERFIL.map(([k, t], gi) => (
              <div key={k}>
                <h3 className="acto-sub">{t}</h3>
                <BarrasH unidad="inscripciones" total={r.insc} items={r.grupos[k].map((x, i) => ({
                  clave: x.c, etiqueta: k === "sexo" ? TITULO_SEXO[x.c] ?? x.c : x.c, valor: x.v, color: k === "sexo" ? ["#1baf7a", "#2a78d6", "#9aa3b2"][i] : colorSerie(i + gi) }))} />
              </div>
            ))}
          </div>
          {r.meses.length > 1 && (
            <>
              <h3 className="acto-sub">Inscripciones por mes de inicio del curso</h3>
              <ColumnasApiladas titulo="Inscripciones por mes de inicio" unidad="inscripciones" meses={r.meses}
                series={off.estado.cats.map((c, i) => ({ clave: c, etiqueta: TITULO_ESTADO[c] ?? c, color: COLOR_ESTADO[c] ?? "#9aa3b2", idx: i }))} />
            </>
          )}
        </section>
        <PieHoja />
      </div>

      <div className="hoja hoja-panorama">
        <CabeceraHojaCmc actualizado={act} detalle={ambito} />
        <section className="card acto-ficha" aria-label="Detalle">
          <header><div><p className="zona-etiqueta">{titulo}</p>
            <h2>{nivel === "general" ? "Departamentos" : nivel === "dep" ? "Localidades" : "Cursos"}</h2>
            <p className="sub">{nivel === "loc" ? `${miles(r.ag.cursos)} cursos${r.ag.cursos > MAX_CURSOS ? ` · los ${MAX_CURSOS} con más inscripciones` : ""}` : `${miles(subs.length)} ${nivel === "general" ? "departamentos" : "localidades"} por inscripciones`}</p></div></header>
          <div className="tabla-detalle">
            {nivel === "loc" ? (
              <table>
                <thead><tr><th className="th-loc">Curso</th><th>Institución</th><th>Inicio</th><th className="th-num">Inscriptos</th><th className="th-num">Egresados</th><th className="th-num">Bajas</th></tr></thead>
                <tbody>
                  {cursos.slice(0, MAX_CURSOS).map(i => { const c = d.cursos[i], v = d.perfil[i]; return (
                    <tr key={c[C.id]}><td className="td-loc">{d.cursos_nombres[c[C.curso]]}</td><td>{d.inst[c[C.inst]]}</td><td>{c[C.mes] >= 0 ? mesTexto(d.meses[c[C.mes]]) : "—"}</td>
                      <td className="td-num">{miles(v[0])}</td><td className="td-num">{miles(v[off.estado.ini + off.estado.cats.indexOf("EGRESADO")])}</td>
                      <td className="td-num">{miles(v[off.estado.ini + off.estado.cats.indexOf("BAJA")])}</td></tr>); })}
                </tbody>
              </table>
            ) : (
              <table>
                <thead><tr><th className="th-loc">{nivel === "general" ? "Departamento" : "Localidad"}</th><th className="th-num">Cursos</th><th className="th-num">Inscripciones</th><th className="th-num">% del total</th></tr></thead>
                <tbody>
                  {subs.map(x => <tr key={x.k}><td className="td-loc">{x.nombre}</td><td className="td-num">{miles(x.cursos)}</td><td className="td-num">{miles(x.insc)}</td><td className="td-num">{pct(x.insc, totalInsc)}</td></tr>)}
                </tbody>
                <tfoot><tr><td className="td-loc"><b>Total</b></td><td className="td-num"><b>{miles(subs.reduce((a, x) => a + x.cursos, 0))}</b></td><td className="td-num"><b>{miles(totalInsc)}</b></td><td className="td-num"><b>100 %</b></td></tr></tfoot>
              </table>
            )}
          </div>
        </section>
        <PieHoja />
      </div>
    </>
  );
}
