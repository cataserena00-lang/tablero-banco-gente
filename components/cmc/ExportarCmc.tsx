"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { LogoCmc } from "../Marca";
import { fmtF, miles, nombreDep } from "@/lib/formato";
import { SIN_FILTRO, calcular, contexto, nEstado, pct, type DatosCmc } from "@/lib/cmc";
import { descargarExcelCmc, parametros } from "@/lib/clienteCmc";
import HojasResumenCmc, { type Nivel } from "./HojasResumenCmc";
import { useImprimir } from "./useImprimir";

/* Exportar de Córdoba me capacita: se elige el alcance (todo Córdoba, un departamento o una localidad) y se baja el resumen en PDF
   (todos los perfiles) y, solo para el perfil completo y admin, las bases de participantes y de capacitadores en Excel. */

export default function ExportarCmc({ datos: d, verPersonas }: { datos: DatosCmc; verPersonas: boolean }) {
  const [nivel, setNivel] = useState<Nivel>("general");
  const [dep, setDep] = useState(-1), [zona, setZona] = useState(-1);
  const [bajando, setBajando] = useState<string | null>(null), [aviso, setAviso] = useState<string | null>(null);
  const cx = useMemo(() => contexto(d), [d]);
  const depsOrden = useMemo(() => d.dep.map((n, i) => ({ n, i })).sort((a, b) => nombreDep(a.n).localeCompare(nombreDep(b.n), "es")), [d]);
  const zonasDep = useMemo(() => d.zonas.map((z, i) => ({ i, dep: z[0], nombre: z[1] })).filter(z => z.dep === dep).sort((a, b) => nombreDep(a.nombre).localeCompare(nombreDep(b.nombre), "es")), [d, dep]);

  const nivelEf: Nivel = nivel === "loc" && zona >= 0 ? "loc" : nivel !== "general" && dep >= 0 ? "dep" : "general";
  const f = useMemo(() => ({ ...SIN_FILTRO, dep: nivelEf === "general" ? -1 : dep, zona: nivelEf === "loc" ? zona : -1 }), [nivelEf, dep, zona]);
  const r = useMemo(() => calcular(d, f, cx), [d, f, cx]);
  const depN = f.dep >= 0 ? d.dep[f.dep] : null, zonaN = f.zona >= 0 ? d.zonas[f.zona] : null;
  const titulo = nivelEf === "general" ? "Resumen general" : nivelEf === "dep" ? `Departamento ${nombreDep(depN!)}` : `Localidad ${nombreDep(zonaN![1])}`;
  const ambito = nivelEf === "general" ? "Todo Córdoba" : nivelEf === "dep" ? `Departamento ${nombreDep(depN!)}` : `${nombreDep(zonaN![1])}, ${nombreDep(depN!)}`;
  const listo = nivel === "general" || (nivel === "dep" && dep >= 0) || (nivel === "loc" && zona >= 0);
  const { imprimiendo, imprimir } = useImprimir(`resumen-${(zonaN ? zonaN[1] : depN ?? "cordoba").toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/[^a-z0-9]+/g, "-")}-cba-me-capacita`, [ambito]);
  const alcance = { dep: depN, loc: zonaN ? zonaN[1] : null };
  const bajar = async (tipo: "participantes" | "capacitadores") => { setBajando(tipo); setAviso(await descargarExcelCmc(tipo, alcance)); setBajando(null); };
  const q = parametros(alcance).toString();

  return (
    <>
      <div className="franja" />
      <header className="top"><div className="wrap">
        <LogoCmc />
        <div className="titulo"><h1>Córdoba me capacita</h1><p>Exportar · resumen en PDF y bases en Excel</p></div>
        <div className="actualiz">Datos actualizados el<b>{fmtF(d.actualizado)}</b></div>
        <form method="post" action="/api/logout" className="salir-form"><button className="salir" type="submit">Salir</button></form>
      </div></header>
      <main className="dash"><div className="wrap">
        <h2 className="vista-titulo">Exportar</h2>
        <section className="card">
          <header><div><h2>1. Elegí qué querés exportar</h2><p className="sub">El resumen incluye indicadores, estados, sectores, perfil de participantes y el detalle de la zona.</p></div></header>
          <div className="seg" role="group" aria-label="Alcance">
            {([["general", "Todo Córdoba"], ["dep", "Un departamento"], ["loc", "Una localidad"]] as [Nivel, string][]).map(([k, t]) => (
              <button key={k} type="button" aria-pressed={nivel === k} onClick={() => { setNivel(k); setAviso(null); if (k === "general") { setDep(-1); setZona(-1); } if (k === "dep") setZona(-1); }}>{t}</button>
            ))}
          </div>
          {nivel !== "general" && (
            <div className="filtros" style={{ marginTop: 14 }}>
              <div className="filtro-sel"><label>Departamento
                <select value={dep} onChange={e => { setDep(+e.target.value); setZona(-1); }}>
                  <option value={-1}>Elegí un departamento</option>{depsOrden.map(x => <option key={x.n} value={x.i}>{nombreDep(x.n)}</option>)}
                </select></label></div>
              {nivel === "loc" && (
                <div className="filtro-sel"><label>Localidad
                  <select value={zona} disabled={dep < 0} onChange={e => setZona(+e.target.value)}>
                    <option value={-1}>{dep < 0 ? "Primero elegí un departamento" : "Elegí una localidad"}</option>{zonasDep.map(z => <option key={z.i} value={z.i}>{nombreDep(z.nombre)}</option>)}
                  </select></label></div>
              )}
            </div>
          )}
        </section>

        {listo && (
          <section className="card" style={{ marginTop: 20 }}>
            <header><div><p className="zona-etiqueta">Se va a exportar</p><h2>{titulo}</h2></div></header>
            <div className="kpis kpis-4">
              <div className="kpi"><span>Cursos</span><b>{miles(r.ag.cursos)}</b></div>
              <div className="kpi"><span>Inscripciones</span><b>{miles(r.insc)}</b><small>{r.unicos ? `${miles(r.unicos.personas)} personas distintas` : ""}</small></div>
              <div className="kpi"><span>Egresados</span><b>{miles(nEstado(r, "EGRESADO"))}</b><small>{pct(nEstado(r, "EGRESADO"), r.insc)}</small></div>
              <div className="kpi"><span>Bajas</span><b>{miles(nEstado(r, "BAJA"))}</b><small>{pct(nEstado(r, "BAJA"), r.insc)}{r.unicos ? ` · ${miles(r.unicos.capacitadores)} capacitadores` : ""}</small></div>
            </div>
            <h3 className="acto-sub" style={{ marginTop: 18 }}>2. Descargá</h3>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
              <button type="button" className="volver" style={{ marginBottom: 0 }} disabled={imprimiendo} onClick={imprimir}>{imprimiendo ? "Preparando…" : "Resumen en PDF"}</button>
              {verPersonas && (
                <>
                  <button type="button" className="acto-link" disabled={!!bajando || nivelEf === "general"} onClick={() => bajar("participantes")}
                    title={nivelEf === "general" ? "Elegí un departamento o una localidad: la base de todo Córdoba es demasiado grande para un Excel" : undefined}>
                    {bajando === "participantes" ? "Preparando…" : "Base de participantes (Excel)"}</button>
                  <button type="button" className="acto-link" disabled={!!bajando} onClick={() => bajar("capacitadores")}>{bajando === "capacitadores" ? "Preparando…" : "Base de capacitadores (Excel)"}</button>
                  <Link className="enlace-zona" href={`/cba-me-capacita/participantes${q ? "?" + q : ""}`}>Ver participantes</Link>
                  <Link className="enlace-zona" href={`/cba-me-capacita/capacitadores${q ? "?" + q : ""}`}>Ver capacitadores</Link>
                </>
              )}
            </div>
            {aviso && <p className="err" role="alert">{aviso}</p>}
            {verPersonas
              ? <p className="cmc-nota">Las bases contienen datos personales: cada descarga queda registrada. Para todo Córdoba solo se puede bajar la base de capacitadores; la de participantes se baja por departamento, localidad o curso.</p>
              : <p className="cmc-nota">Las bases de participantes y capacitadores (con datos personales) solo las descarga el perfil completo.</p>}
          </section>
        )}
      </div></main>

      {imprimiendo && listo && typeof document !== "undefined" && createPortal(
        <div className="hojas-impresion">
          <style>{"@page{size:A4 portrait;margin:0}"}</style>
          <HojasResumenCmc d={d} r={r} cx={cx} nivel={nivelEf} titulo={titulo} ambito={ambito} filtros={[]} depSel={f.dep} />
        </div>, document.body)}
    </>
  );
}
