"use client";
import { useMemo, useState } from "react";
import Link from "next/link";

export type Fila = { creditos: number; monto: number; [k: string]: string | number };
export type Resumen = { creditos: number; monto: number; localidades: number; departamentos: number;
  capital_creditos: number; capital_monto: number; fecha_min: string | null; fecha_max: string | null };

const n = (x: number) => x.toLocaleString("es-AR");
const $ = (x: number) => "$ " + x.toLocaleString("es-AR");
const cap = (s: string) => s.toLowerCase().replace(/(^|[\s.(-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());

type Vista = "departamentos" | "localidades" | "barrios";

export default function Tablero(p: { resumen: Resumen; departamentos: Fila[]; localidades: Fila[];
  barrios: Fila[]; meses: Fila[]; actualizado: string }) {
  const [vista, setVista] = useState<Vista>("departamentos");
  const [depto, setDepto] = useState("");
  const [q, setQ] = useState("");
  const [metrica, setMetrica] = useState<"creditos" | "monto">("creditos");

  const { filas, clave } = useMemo(() => {
    let base: Fila[], clave: string;
    if (vista === "departamentos") { base = p.departamentos; clave = "departamento"; }
    else if (vista === "localidades") { base = depto ? p.localidades.filter(r => r.departamento === depto) : p.localidades; clave = "localidad"; }
    else { base = p.barrios; clave = "barrio"; }
    const t = q.trim().toUpperCase();
    const f = base.filter(r => !t || String(r[clave]).includes(t)).sort((a, b) => b[metrica] - a[metrica]);
    return { filas: f, clave };
  }, [vista, depto, q, metrica, p]);

  const max = Math.max(1, ...filas.map(r => r[metrica]));
  const totC = filas.reduce((s, r) => s + r.creditos, 0), totM = filas.reduce((s, r) => s + r.monto, 0);
  const mx = Math.max(1, ...p.meses.map(r => r[metrica]));

  return (
    <main className="wrap">
      <header>
        <div><Link href="/" className="back">← Tableros</Link><h1>Banco de la Gente · Pendientes de entrega</h1>
          <small>Créditos aprobados aún no entregados · actualizado {new Date(p.actualizado).toLocaleDateString("es-AR")}</small></div>
        <form method="post" action="/api/logout"><button className="sec">Salir</button></form>
      </header>

      <section className="kpis">
        <div className="card kpi"><span>Créditos pendientes</span><b>{n(p.resumen.creditos)}</b></div>
        <div className="card kpi"><span>Monto pendiente</span><b>{$(p.resumen.monto)}</b></div>
        <div className="card kpi"><span>Departamentos / Localidades</span><b>{p.resumen.departamentos} / {p.resumen.localidades}</b></div>
        <div className="card kpi"><span>Córdoba Capital</span><b>{n(p.resumen.capital_creditos)}</b><small>{$(p.resumen.capital_monto)}</small></div>
      </section>

      <section className="card">
        <h2>Pendientes por mes de aprobación</h2>
        <div className="meses">
          {p.meses.map(m => (
            <div key={String(m.mes)} className="col" title={`${m.mes}: ${n(m.creditos)} créditos · ${$(m.monto)}`}>
              <div className="bar" style={{ height: `${(m[metrica] / mx) * 100}%` }} />
              <span>{String(m.mes).slice(2)}</span>
            </div>))}
        </div>
      </section>

      <section className="card">
        <div className="controles">
          <div className="tabs">
            {(["departamentos", "localidades", "barrios"] as Vista[]).map(v => (
              <button key={v} className={vista === v ? "on" : ""} onClick={() => setVista(v)}>
                {v === "barrios" ? "Barrios (Córdoba Capital)" : cap(v)}</button>))}
          </div>
          <div className="tabs">
            <button className={metrica === "creditos" ? "on" : ""} onClick={() => setMetrica("creditos")}>Cantidad</button>
            <button className={metrica === "monto" ? "on" : ""} onClick={() => setMetrica("monto")}>Monto</button>
          </div>
          {vista === "localidades" && (
            <select value={depto} onChange={e => setDepto(e.target.value)}>
              <option value="">Todos los departamentos</option>
              {p.departamentos.map(d => <option key={String(d.departamento)} value={String(d.departamento)}>{cap(String(d.departamento))}</option>)}
            </select>)}
          <input placeholder="Buscar…" value={q} onChange={e => setQ(e.target.value)} />
        </div>

        <table>
          <thead><tr><th>{cap(clave)}</th>{vista === "localidades" && <th>Departamento</th>}<th className="num">Créditos</th><th className="num">Monto</th><th className="barcol" /></tr></thead>
          <tbody>
            {filas.slice(0, 300).map((r, i) => (
              <tr key={i}>
                <td>{cap(String(r[clave]))}</td>
                {vista === "localidades" && <td>{cap(String(r.departamento))}</td>}
                <td className="num">{n(r.creditos)}</td><td className="num">{$(r.monto)}</td>
                <td className="barcol"><div className="hb" style={{ width: `${(r[metrica] / max) * 100}%` }} /></td>
              </tr>))}
          </tbody>
          <tfoot><tr><td>Total ({n(filas.length)} filas)</td>{vista === "localidades" && <td />}<td className="num">{n(totC)}</td><td className="num">{$(totM)}</td><td /></tr></tfoot>
        </table>
        {filas.length > 300 && <small>Mostrando las primeras 300 filas; usá el buscador para filtrar.</small>}
      </section>
    </main>
  );
}
