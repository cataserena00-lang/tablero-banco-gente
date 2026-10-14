"use client";
import { useEffect, useRef, useState } from "react";
import { miles, nombreDep, peso } from "@/lib/formato";

/* Participantes, capacitadores y costos de Córdoba me capacita (datos NOMINALES). Solo se muestra al perfil completo y admin,
   y todo viene de /api/cmc/*, que verifica el rol y el acceso al programa en el servidor en cada solicitud.
   Se pide por curso o por zona (departamento y, si se eligió, localidad); si hay un curso elegido, manda el curso. */

type Fila = Record<string, string | number | null>;
interface Participantes { total: number; filas: Fila[]; pagina: number; porPagina: number }
interface Capacitador { apellido: string | null; nombre: string | null; cuil: string | null }
interface Curso { id_curso: number; curso: string; institucion: string; tipo_institucion: string; etapa: string; estado_planificacion: string; sector: string; modalidad: string;
  fecha_inicio: string | null; fecha_fin: string | null; hs_presenciales: number | null; sede: string | null; zona_dep: string; zona_loc: string; condicion_pago: string | null;
  total_honorarios: number | null; mat_pedagogico: number | null; total: number | null; inscriptos: number }
interface ResumenZona { costos: { cursos: number; honorarios: number; material: number; total: number; horas: number }; capacitadores: number }
export interface AlcanceNominal { curso: number | null; dep: string | null; loc: string | null; nombre: string }

const dato = (v: string | number | null | undefined) => (v === null || v === undefined || v === "" ? "—" : String(v));
const fechaCorta = (v: string | null) => (v ? v.slice(8, 10) + "/" + v.slice(5, 7) + "/" + v.slice(0, 4) : "—");
const nombreCompleto = (c: Capacitador) => [c.apellido, c.nombre].filter(Boolean).join(", ") || "—";

export default function PanelNominalCmc({ alcance, onCerrarCurso }: { alcance: AlcanceNominal; onCerrarCurso: () => void }) {
  const [busq, setBusq] = useState(""), [q, setQ] = useState(""), [pagina, setPagina] = useState(1);
  const [datos, setDatos] = useState<Participantes | null>(null);
  const [detalle, setDetalle] = useState<{ curso: Curso; capacitadores: Capacitador[] } | null>(null);
  const [zona, setZona] = useState<ResumenZona | null>(null);
  const [error, setError] = useState<string | null>(null), [cargando, setCargando] = useState(false);
  const [bajando, setBajando] = useState<string | null>(null);
  const claveAlcance = `${alcance.curso}|${alcance.dep}|${alcance.loc}`;
  const base = () => {
    const p = new URLSearchParams();
    if (alcance.curso !== null) p.set("curso", String(alcance.curso));
    else { if (alcance.dep) p.set("zdep", alcance.dep); if (alcance.loc) p.set("zloc", alcance.loc); }
    return p;
  };

  useEffect(() => { setBusq(""); setQ(""); setPagina(1); }, [claveAlcance]);
  useEffect(() => { const t = setTimeout(() => { setQ(busq); setPagina(1); }, 400); return () => clearTimeout(t); }, [busq]);

  useEffect(() => {
    const ctl = new AbortController();
    setCargando(true); setError(null);
    const p = base(); if (q.trim()) p.set("q", q.trim()); p.set("pagina", String(pagina));
    fetch(`/api/cmc/participantes?${p}`, { signal: ctl.signal })
      .then(r => r.ok ? r.json() : Promise.reject(r.status)).then(setDatos)
      .catch(e => { if (e !== 0 && !ctl.signal.aborted) setError(e === 503 ? "La base de participantes todavía no está disponible." : "No se pudo cargar el listado."); })
      .finally(() => { if (!ctl.signal.aborted) setCargando(false); });
    return () => ctl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveAlcance, q, pagina]);

  useEffect(() => {
    const ctl = new AbortController();
    setDetalle(null); setZona(null);
    fetch(`/api/cmc/resumen?${base()}`, { signal: ctl.signal }).then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(j => (alcance.curso !== null ? setDetalle(j) : setZona(j))).catch(() => {});
    return () => ctl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveAlcance]);

  async function exportar(tipo: "participantes" | "capacitadores") {
    setBajando(tipo); setError(null);
    try {
      const p = base(); p.set("tipo", tipo); if (tipo === "participantes" && q.trim()) p.set("q", q.trim());
      const r = await fetch(`/api/cmc/exportar?${p}`);
      if (!r.ok) throw new Error(r.status === 413 ? "Son demasiadas filas para un solo Excel: elegí una localidad o un curso." : r.status === 404 ? "No hay datos para exportar." : "No se pudo generar el Excel.");
      const blob = await r.blob(), a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = /filename="([^"]+)"/.exec(r.headers.get("Content-Disposition") ?? "")?.[1] ?? `${tipo}.xlsx`;
      a.click(); URL.revokeObjectURL(a.href);
    } catch (e) { setError((e as Error).message); } finally { setBajando(null); }
  }

  const paginas = datos ? Math.max(1, Math.ceil(datos.total / datos.porPagina)) : 1;
  const c = detalle?.curso;
  const titulo = alcance.curso !== null ? (c?.curso ?? "Curso") : alcance.nombre;
  const costos = alcance.curso !== null && c ? { honorarios: c.total_honorarios ?? 0, material: c.mat_pedagogico ?? 0, total: c.total ?? 0 } : zona?.costos;

  return (
    <section className="card cmc-nominal" aria-label="Participantes" style={{ marginTop: 20 }}>
      <header>
        <div>
          <p className="zona-etiqueta">{alcance.curso !== null ? "Curso" : "Participantes de la zona"}</p>
          <h2>{titulo}</h2>
          {c && <p className="sub">{c.institucion} · {nombreDep(c.zona_loc)}, {nombreDep(c.zona_dep)} · {c.sector} · {c.modalidad} · {c.etapa}</p>}
        </div>
        <div className="cmc-acciones">
          <button type="button" className="acto-link" disabled={!!bajando} onClick={() => exportar("participantes")}>{bajando === "participantes" ? "Preparando…" : "Excel de participantes"}</button>
          <button type="button" className="acto-link" disabled={!!bajando} onClick={() => exportar("capacitadores")}>{bajando === "capacitadores" ? "Preparando…" : "Excel de capacitadores"}</button>
          {alcance.curso !== null && <button type="button" className="acto-link" onClick={onCerrarCurso}>Ver la zona</button>}
        </div>
      </header>

      {(c || zona) && (
        <div className="kpis kpis-4">
          <div className="kpi"><span>{alcance.curso !== null ? "Inscriptos" : "Cursos"}</span><b>{miles(c ? c.inscriptos : zona!.costos.cursos)}</b>
            <small>{c ? `${fechaCorta(c.fecha_inicio)} a ${fechaCorta(c.fecha_fin)} · ${dato(c.hs_presenciales)} hs` : `${miles(zona!.costos.horas)} horas presenciales`}</small></div>
          <div className="kpi"><span>Capacitadores</span><b>{miles(c ? detalle!.capacitadores.length : zona!.capacitadores)}</b>
            <small>{c ? (detalle!.capacitadores.map(nombreCompleto).join(" · ") || "sin dato") : "distintos, por CUIL"}</small></div>
          <div className="kpi"><span>Honorarios</span><b>{costos ? peso(costos.honorarios) : "—"}</b><small>{c?.condicion_pago ? `Condición: ${c.condicion_pago}` : "total de los cursos"}</small></div>
          <div className="kpi"><span>Costo total</span><b>{costos ? peso(costos.total) : "—"}</b><small>{costos ? `material pedagógico ${peso(costos.material)}` : ""}</small></div>
        </div>
      )}

      <div className="cmc-buscar" style={{ margin: "14px 0 8px" }}>
        <input type="search" placeholder="Buscar por apellido, nombre, CUIL o DNI" value={busq} onChange={e => setBusq(e.target.value)} aria-label="Buscar participante" />
        <span className="cmc-nota" style={{ marginLeft: 10 }}>{datos ? `${miles(datos.total)} ${datos.total === 1 ? "inscripción" : "inscripciones"}` : ""}{cargando ? " · cargando…" : ""}</span>
      </div>
      {error && <p className="err" role="alert">{error}</p>}
      <div className="tabla-detalle">
        <table>
          <thead><tr><th className="th-loc">Apellido y nombre</th><th>CUIL</th><th>Sexo</th><th className="th-num">Edad</th><th>Teléfono</th><th>Mail</th><th>Estado</th>{alcance.curso === null && <th>Curso</th>}</tr></thead>
          <tbody>
            {datos?.filas.map((f, i) => (
              <tr key={i}>
                <td className="td-loc">{dato(f.apellido)}, {dato(f.nombre)}</td><td>{dato(f.cuil)}</td><td>{dato(f.sexo)}</td><td className="td-num">{dato(f.edad)}</td>
                <td>{dato(f.telefono)}</td><td>{dato(f.mail)}</td><td>{dato(f.estado)}</td>
                {alcance.curso === null && <td>{dato(f.curso)}<br /><small>{nombreDep(String(f.localidad ?? ""))}</small></td>}
              </tr>
            ))}
            {datos && !datos.filas.length && <tr><td colSpan={8}>No hay participantes con esa búsqueda.</td></tr>}
          </tbody>
        </table>
      </div>
      {paginas > 1 && (
        <div className="paginado" style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 10 }}>
          <button type="button" className="acto-link" disabled={pagina <= 1} onClick={() => setPagina(p => p - 1)}>← Anterior</button>
          <span className="cmc-nota">Página {miles(pagina)} de {miles(paginas)}</span>
          <button type="button" className="acto-link" disabled={pagina >= paginas} onClick={() => setPagina(p => p + 1)}>Siguiente →</button>
        </div>
      )}
      <p className="cmc-nota">Información confidencial: contiene datos personales. Cada consulta y cada exportación queda registrada.</p>
    </section>
  );
}
