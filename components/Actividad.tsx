"use client";
import { useEffect, useMemo, useState } from "react";
import { BarrasH, ColumnasApiladas, colorSerie } from "./graficos";
import { miles } from "@/lib/formato";

/* Actividad de los usuarios (solo perfil admin): quién ingresó, qué consultó y qué exportables generó.
   Los datos vienen de /api/actividad, que vuelve a verificar el rol en el servidor en cada solicitud. */

interface Evento { id: number; creado: string; usuario: string; rol: string; accion: string; detalle: Record<string, unknown> | null; resultados: number | null }
interface ResumenUsuario { usuario: string; rol: string; ingresos: number; ultimo_ingreso: string | null; exportables: number; consultas: number; ultimo: string }
interface Respuesta {
  filas: Evento[]; total: number; pagina: number; porPagina: number;
  nombres?: Record<string, string>;
  resumen: { dias: number; usuarios: ResumenUsuario[]; porDia: { dia: string; ingresos: number; exportables: number }[]; todosLosUsuarios: string[] };
}

const PERFIL: Record<string, string> = { admin: "Administración", completo: "Completo", agregado: "Agregado" };
const ACCION: Record<string, string> = { ingreso: "Ingreso", busqueda: "Búsqueda de personas", ficha: "Ficha de persona", exportacion: "Exportación (PDF/Excel)", exportable: "Exportable" };
const GRUPOS: [string, string][] = [["", "Todas las acciones"], ["ingreso", "Ingresos"], ["exportable", "Exportables"], ["consulta", "Consultas de personas"]];
const PERIODOS: [number, string][] = [[7, "Últimos 7 días"], [30, "Últimos 30 días"], [90, "Últimos 90 días"]];
const ETQ_FILTRO: Record<string, string> = { zdep: "Zona", q: "Búsqueda", departamento: "Departamento", localidad: "Localidad", categoria: "Estado", estado: "Estado puntual", linea: "Línea" };

const fecha = (iso: string) => new Date(iso).toLocaleString("es-AR", { timeZone: "America/Argentina/Cordoba", dateStyle: "short", timeStyle: "short" });
const texto = (v: unknown) => (typeof v === "string" || typeof v === "number" ? String(v) : "");

/** Qué hizo el usuario, en una línea y sin volcar datos de más. */
function describir(e: Evento): string {
  const d = e.detalle ?? {};
  if (e.accion === "ingreso") return "Ingresó al tablero";
  if (e.accion === "exportable") {
    const zonas = Array.isArray(d.zonas) ? (d.zonas as unknown[]).map(texto).filter(Boolean) : [];
    const cont = d.contenido === "completa+personas" ? "ficha completa con personas" : d.contenido === "completa" ? "ficha completa" : "solo pendientes";
    if (d.tipo === "panorama") return "Resumen general (PDF)";
    return `${d.tipo === "fichas" ? "Fichas" : "Ficha"}: ${zonas.slice(0, 4).join(", ")}${zonas.length > 4 ? ` y ${zonas.length - 4} más` : ""} · ${cont}${d.cantidad && d.contenido === "completa+personas" ? ` · ${miles(Number(d.cantidad))} personas` : ""}`;
  }
  if (e.accion === "ficha") return `Abrió la ficha de la persona n.º ${texto(d.id)}`;
  if (e.accion === "exportacion" && d.tipo === "pendientes_excel") {
    const zona = [d.dep, d.loc, d.circuito === "__sin__" ? "sin circuito" : d.circuito ? `circuito ${texto(d.circuito)}` : "", d.barrio === "" ? "sin barrio" : d.barrio].map(texto).filter(Boolean).join(" · ");
    return `Excel de pendientes · ${zona}`;
  }
  if (e.accion === "exportacion" && d.tipo === "ficha") return `PDF de la ficha de la persona n.º ${texto(d.id)}`;
  const filtros = Object.entries(ETQ_FILTRO).filter(([k]) => texto(d[k])).map(([k, l]) => `${l}: ${texto(d[k])}`);
  const base = e.accion === "exportacion" ? "PDF de personas" : "Búsqueda";
  return filtros.length ? `${base} · ${filtros.join(" · ")}` : `${base} sin filtros`;
}

const dias = (n: number) => {
  const out: string[] = [];
  const hoy = new Date(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Cordoba" }).format(new Date()) + "T12:00:00");
  for (let i = n - 1; i >= 0; i--) { const d = new Date(hoy); d.setDate(d.getDate() - i); out.push(d.toISOString().slice(0, 10)); }
  return out;
};

export default function Actividad() {
  const [usuario, setUsuario] = useState("");
  const [grupo, setGrupo] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [periodo, setPeriodo] = useState(30);
  const [pagina, setPagina] = useState(1);
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctl = new AbortController();
    const p = new URLSearchParams({ pagina: String(pagina), dias: String(periodo) });
    if (usuario) p.set("usuario", usuario);
    if (grupo) p.set("grupo", grupo);
    if (desde) p.set("desde", desde);
    if (hasta) p.set("hasta", hasta);
    setCargando(true); setError(null);
    fetch(`/api/actividad?${p}`, { signal: ctl.signal })
      .then(async r => r.ok ? r.json() : Promise.reject(await r.json().catch(() => ({})).then((j: { error?: string }) => j.error ?? r.status)))
      .then((d: Respuesta) => { setDatos(d); setCargando(false); })
      .catch(e => { if (e?.name === "AbortError") return; setCargando(false);
        setError(e === "prohibido" ? "Esta solapa es solo para el perfil de administración."
          : e === "sin_permiso" ? "Falta darle permiso de lectura sobre la tabla «accesos» al usuario de lectura de la base (ver el README, sección de actividad)."
          : e === "sin_base" ? "El registro de actividad todavía no está disponible." : "No se pudo cargar. Probá de nuevo."); });
    return () => ctl.abort();
  }, [usuario, grupo, desde, hasta, periodo, pagina]);

  const r = datos?.resumen;
  const quien = (u: string) => datos?.nombres?.[u] ? `${datos.nombres[u]} (${u})` : u;
  const tot = useMemo(() => (r?.usuarios ?? []).reduce((a, u) => ({ ingresos: a.ingresos + u.ingresos, exportables: a.exportables + u.exportables, consultas: a.consultas + u.consultas }), { ingresos: 0, exportables: 0, consultas: 0 }), [r]);
  const serieDias = useMemo(() => {
    if (!r) return [];
    const m = new Map(r.porDia.map(x => [x.dia, x]));
    return dias(r.dias).map(d => ({ mes: d, v: [m.get(d)?.ingresos ?? 0, m.get(d)?.exportables ?? 0] }));
  }, [r]);
  const paginas = datos ? Math.max(1, Math.ceil(datos.total / datos.porPagina)) : 1;

  return (
    <>
      <section className="filtros filtros-personas" aria-label="Período y filtros">
        <div className="filtro-sel">
          <label htmlFor="a-per">Período de los resúmenes</label>
          <select id="a-per" value={periodo} onChange={e => setPeriodo(Number(e.target.value))}>
            {PERIODOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div className="filtro-sel">
          <label htmlFor="a-usu">Usuario</label>
          <select id="a-usu" value={usuario} onChange={e => { setUsuario(e.target.value); setPagina(1); }}>
            <option value="">Todos</option>
            {(r?.todosLosUsuarios ?? []).map(u => <option key={u} value={u}>{quien(u)}</option>)}
          </select>
        </div>
        <div className="filtro-sel">
          <label htmlFor="a-acc">Acción</label>
          <select id="a-acc" value={grupo} onChange={e => { setGrupo(e.target.value); setPagina(1); }}>
            {GRUPOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div className="filtro-sel"><label htmlFor="a-des">Eventos desde</label><input id="a-des" type="date" value={desde} onChange={e => { setDesde(e.target.value); setPagina(1); }} /></div>
        <div className="filtro-sel"><label htmlFor="a-has">hasta</label><input id="a-has" type="date" value={hasta} onChange={e => { setHasta(e.target.value); setPagina(1); }} /></div>
        {(usuario || grupo || desde || hasta) && <button type="button" className="limpiar" onClick={() => { setUsuario(""); setGrupo(""); setDesde(""); setHasta(""); setPagina(1); }}>Limpiar filtros</button>}
      </section>

      {error ? <p className="nota" role="alert" style={{ marginTop: 20 }}>{error}</p> : !datos ? <p className="nota" style={{ marginTop: 20 }}>Cargando…</p> : (
        <>
          <section className="kpis kpis-4" aria-label="Resumen del período" style={{ marginTop: 20 }}>
            <div className="kpi dest"><span>Ingresos</span><b>{miles(tot.ingresos)}</b><small>últimos {r!.dias} días</small></div>
            <div className="kpi"><span>Usuarios que ingresaron</span><b>{miles(r!.usuarios.filter(u => u.ingresos > 0).length)}</b><small>de {miles(r!.todosLosUsuarios.length)} con actividad registrada</small></div>
            <div className="kpi"><span>Exportables generados</span><b>{miles(tot.exportables)}</b><small>PDF de personas, fichas y resúmenes</small></div>
            <div className="kpi"><span>Consultas de personas</span><b>{miles(tot.consultas)}</b><small>búsquedas y fichas abiertas</small></div>
          </section>

          <section className="card" style={{ marginTop: 20 }}>
            <header><div><h2>Ingresos y exportables por día</h2><p className="sub">Últimos {r!.dias} días</p></div></header>
            <ColumnasApiladas meses={serieDias} unidad="eventos" titulo="Ingresos y exportables por día"
              series={[{ clave: "ingresos", etiqueta: "Ingresos", color: colorSerie(0), idx: 0 }, { clave: "exportables", etiqueta: "Exportables", color: colorSerie(1), idx: 1 }]} />
          </section>

          <div className="grid grid-2" style={{ marginTop: 20 }}>
            <section className="card">
              <header><div><h2>Ingresos por usuario</h2><p className="sub">Últimos {r!.dias} días</p></div></header>
              {r!.usuarios.some(u => u.ingresos) ? <BarrasH unidad="ingresos" items={r!.usuarios.filter(u => u.ingresos).map(u => ({
                clave: u.usuario, etiqueta: datos.nombres?.[u.usuario] ?? u.usuario, valor: u.ingresos, color: colorSerie(0), detalle: `${PERFIL[u.rol] ?? u.rol}${u.ultimo_ingreso ? ` · último: ${fecha(u.ultimo_ingreso)}` : ""}` }))} /> : <p className="nota">Sin ingresos en el período.</p>}
            </section>
            <section className="card">
              <header><div><h2>Exportables por usuario</h2><p className="sub">Últimos {r!.dias} días</p></div></header>
              {r!.usuarios.some(u => u.exportables) ? <BarrasH unidad="exportables" items={[...r!.usuarios].filter(u => u.exportables).sort((a, b) => b.exportables - a.exportables).map(u => ({
                clave: u.usuario, etiqueta: datos.nombres?.[u.usuario] ?? u.usuario, valor: u.exportables, color: colorSerie(1), detalle: PERFIL[u.rol] ?? u.rol }))} /> : <p className="nota">Sin exportables en el período.</p>}
            </section>
          </div>

          <section className="card" style={{ marginTop: 20 }} aria-live="polite">
            <header><div><h2>Detalle de eventos</h2>
              <p className="sub">{miles(datos.total)} {datos.total === 1 ? "evento" : "eventos"}{cargando ? " · actualizando…" : ""} · del más reciente al más antiguo</p></div></header>
            {datos.filas.length === 0 ? <p className="nota">No hay eventos con esos filtros.</p> : (
              <>
                <div className="tabla-detalle">
                  <table>
                    <thead><tr><th className="th-loc">Fecha</th><th className="th-loc">Usuario</th><th className="th-loc">Perfil</th><th className="th-loc">Acción</th><th className="th-loc">Detalle</th><th className="th-num">Resultados</th></tr></thead>
                    <tbody>
                      {datos.filas.map(e => (
                        <tr key={e.id}>
                          <td className="td-loc">{fecha(e.creado)}</td>
                          <td className="td-loc"><b>{datos.nombres?.[e.usuario] ?? e.usuario}</b>{datos.nombres?.[e.usuario] && <small className="cat-estado"> {e.usuario}</small>}</td>
                          <td className="td-loc">{PERFIL[e.rol] ?? e.rol}</td>
                          <td className="td-loc">{ACCION[e.accion] ?? e.accion}</td>
                          <td className="td-loc">{describir(e)}</td>
                          <td className="td-num">{e.resultados === null ? "—" : miles(e.resultados)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <nav className="paginacion" aria-label="Páginas">
                  <button type="button" disabled={pagina <= 1 || cargando} onClick={() => setPagina(p => p - 1)}>← Anterior</button>
                  <span>Página {miles(pagina)} de {miles(paginas)}</span>
                  <button type="button" disabled={pagina >= paginas || cargando} onClick={() => setPagina(p => p + 1)}>Siguiente →</button>
                </nav>
              </>
            )}
            <p className="nota">Se registran los ingresos al tablero, las consultas de la vista de personas y los exportables (PDF de personas, fichas y resumen general). Los intentos de ingreso fallidos no se guardan.</p>
          </section>
        </>
      )}
    </>
  );
}
