"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { COLUMNAS_TABLA, MAX_EXPORTACION, etiquetaColumna as etiqueta } from "@/lib/personasComun";

/* Vista nominal: listado de personas con filtros y buscador. Los datos se piden a /api/personas, que verifica el
   rol en el servidor en cada solicitud. Se ve de a 50 por página y se puede exportar a PDF (hasta 5.000 personas). */

type Fila = Record<string, string | number | null>;
interface Respuesta { filas: Fila[]; total: number; pagina: number; porPagina: number; columnas: string[] }
interface Facetas { departamentos: string[]; localidades: string[]; estados: string[]; lineas: string[]; columnas?: string[] }
interface Filtros { q: string; departamento: string; localidad: string; estado: string; linea: string }
const VACIOS: Filtros = { q: "", departamento: "", localidad: "", estado: "", linea: "" };

const miles = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const dato = (v: string | number | null | undefined) => v === null || v === undefined || v === "" ? "—" : String(v);

export default function VistaPersonas() {
  const [f, setF] = useState<Filtros>(VACIOS);
  const [busq, setBusq] = useState("");           // texto escrito; pasa a `f.q` con una pausa
  const [pagina, setPagina] = useState(1);
  const [fac, setFac] = useState<Facetas>({ departamentos: [], localidades: [], estados: [], lineas: [] });
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ficha, setFicha] = useState<{ id: number; datos: Fila | null; error?: boolean } | null>(null);
  const cerrarRef = useRef<HTMLButtonElement>(null);
  const [exp, setExp] = useState<{ abierto: boolean; cols: string[]; generando: boolean; error: string | null }>(
    { abierto: false, cols: COLUMNAS_TABLA, generando: false, error: null });

  // Pausa al escribir para no consultar en cada tecla
  useEffect(() => {
    const t = setTimeout(() => { setF(a => a.q === busq ? a : { ...a, q: busq }); setPagina(1); }, 400);
    return () => clearTimeout(t);
  }, [busq]);

  // Valores de los filtros (las localidades dependen del departamento)
  useEffect(() => {
    const ctl = new AbortController();
    fetch(`/api/personas/facetas?departamento=${encodeURIComponent(f.departamento)}`, { signal: ctl.signal })
      .then(r => r.ok ? r.json() : Promise.reject(r.status)).then(setFac).catch(() => {});
    return () => ctl.abort();
  }, [f.departamento]);

  // Listado
  useEffect(() => {
    const ctl = new AbortController();
    const p = new URLSearchParams({ pagina: String(pagina) });
    (Object.keys(f) as (keyof Filtros)[]).forEach(k => f[k] && p.set(k, f[k]));
    setCargando(true); setError(null);
    fetch(`/api/personas?${p}`, { signal: ctl.signal })
      .then(async r => r.ok ? r.json() : Promise.reject(r.status))
      .then((d: Respuesta) => { setDatos(d); setCargando(false); })
      .catch(e => { if (e?.name === "AbortError") return; setCargando(false);
        setError(e === 403 ? "No tenés permiso para ver esta información." : e === 503 ? "La base de personas no está disponible todavía." : "No se pudo cargar. Probá de nuevo."); });
    return () => ctl.abort();
  }, [f, pagina]);

  const cambiar = useCallback((k: keyof Filtros, v: string) => {
    setF(a => ({ ...a, [k]: v, ...(k === "departamento" ? { localidad: "" } : {}) })); setPagina(1);
  }, []);
  const limpiar = () => { setF(VACIOS); setBusq(""); setPagina(1); };
  const hayFiltros = Object.values(f).some(Boolean) || busq !== "";

  const abrirFicha = (id: number) => {
    setFicha({ id, datos: null });
    fetch(`/api/personas/${id}`).then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((d: Fila) => setFicha({ id, datos: d })).catch(() => setFicha({ id, datos: null, error: true }));
  };
  useEffect(() => {
    if (!ficha) return;
    cerrarRef.current?.focus();
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setFicha(null); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [ficha]);

  const todasCols = fac.columnas?.length ? fac.columnas : COLUMNAS_TABLA;
  const alternarCol = (c: string) => setExp(e => ({ ...e, cols: e.cols.includes(c) ? e.cols.filter(x => x !== c) : [...e.cols, c] }));
  const excede = !!datos && datos.total > MAX_EXPORTACION;
  const exportar = async () => {
    const cols = todasCols.filter(c => exp.cols.includes(c));
    if (!cols.length || excede || !datos?.total) return;
    const p = new URLSearchParams({ columnas: cols.join(",") });
    (Object.keys(f) as (keyof Filtros)[]).forEach(k => f[k] && p.set(k, f[k]));
    setExp(e => ({ ...e, generando: true, error: null }));
    try {
      const r = await fetch(`/api/personas/exportar?${p}`);
      if (!r.ok) throw r.status;
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement("a");
      a.href = url; a.download = `personas-${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      setExp(e => ({ ...e, generando: false }));
    } catch (er) {
      setExp(e => ({ ...e, generando: false, error: er === 403 ? "No tenés permiso para exportar."
        : er === 413 ? `Hay más de ${miles(MAX_EXPORTACION)} personas: acotá los filtros.`
        : er === 503 ? "La base de personas no está disponible todavía." : "No se pudo generar el PDF. Probá de nuevo." }));
    }
  };

  const paginas = datos ? Math.max(1, Math.ceil(datos.total / datos.porPagina)) : 1;
  const opciones = (vals: string[], actual: string) => (actual && !vals.includes(actual) ? [actual, ...vals] : vals);

  return (
    <>
      <section className="filtros filtros-personas" aria-label="Filtros de personas">
        <div className="filtro-sel filtro-buscar">
          <label htmlFor="p-busq">Buscar persona</label>
          <input id="p-busq" type="search" autoComplete="off" value={busq} onChange={e => setBusq(e.target.value)}
            placeholder="Nombre, CUIL o documento" />
        </div>
        <div className="filtro-sel">
          <label htmlFor="p-dep">Departamento</label>
          <select id="p-dep" value={f.departamento} onChange={e => cambiar("departamento", e.target.value)}>
            <option value="">Todos</option>
            {opciones(fac.departamentos, f.departamento).map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <div className="filtro-sel">
          <label htmlFor="p-loc">Localidad</label>
          <select id="p-loc" value={f.localidad} disabled={!f.departamento} onChange={e => cambiar("localidad", e.target.value)}>
            <option value="">{f.departamento ? "Todas" : "Elegí un departamento"}</option>
            {opciones(fac.localidades, f.localidad).map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <div className="filtro-sel">
          <label htmlFor="p-est">Estado</label>
          <select id="p-est" value={f.estado} onChange={e => cambiar("estado", e.target.value)}>
            <option value="">Todos</option>
            {opciones(fac.estados, f.estado).map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        {fac.lineas.length > 0 && (
          <div className="filtro-sel">
            <label htmlFor="p-lin">Línea</label>
            <select id="p-lin" value={f.linea} onChange={e => cambiar("linea", e.target.value)}>
              <option value="">Todas</option>
              {opciones(fac.lineas, f.linea).map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
        )}
        {hayFiltros && <button type="button" className="limpiar" onClick={limpiar}>Limpiar filtros</button>}
      </section>

      <section className="card" style={{ marginTop: 20 }} aria-live="polite">
        <header>
          <div><h2>Personas</h2>
            <p className="sub">{error ? "—" : datos ? `${miles(datos.total)} ${datos.total === 1 ? "persona" : "personas"}` : "Cargando…"}
              {cargando && datos ? " · actualizando…" : ""}</p></div>
          <button type="button" className="limpiar" aria-expanded={exp.abierto}
            onClick={() => setExp(e => ({ ...e, abierto: !e.abierto }))}>Exportar PDF</button>
        </header>
        {exp.abierto && (
          <div className="exportar-panel" role="group" aria-label="Exportar a PDF">
            <p className="sub">Se exportan las personas que cumplen los filtros actuales ({datos ? miles(datos.total) : "…"}). Elegí las columnas:</p>
            <div className="exportar-cols">
              <button type="button" className="limpiar" onClick={() => setExp(e => ({ ...e, cols: todasCols }))}>Todas</button>
              <button type="button" className="limpiar" onClick={() => setExp(e => ({ ...e, cols: COLUMNAS_TABLA.filter(c => todasCols.includes(c)) }))}>Las de la tabla</button>
              <button type="button" className="limpiar" onClick={() => setExp(e => ({ ...e, cols: [] }))}>Ninguna</button>
            </div>
            <ul className="exportar-lista">
              {todasCols.map(c => (
                <li key={c}><label><input type="checkbox" checked={exp.cols.includes(c)} onChange={() => alternarCol(c)} /> {etiqueta(c)}</label></li>
              ))}
            </ul>
            {excede && <p className="nota" role="alert">Hay más de {miles(MAX_EXPORTACION)} personas con estos filtros. Acotalos (por ejemplo, elegí una localidad) para exportar.</p>}
            {exp.error && <p className="nota" role="alert">{exp.error}</p>}
            <button type="button" className="acto-link" disabled={exp.generando || excede || !exp.cols.length || !datos?.total} onClick={exportar}>
              {exp.generando ? "Generando…" : "Descargar PDF"}</button>
            <p className="nota">La exportación queda registrada. El PDF contiene datos personales: usalo solo para tareas del Banco.</p>
          </div>
        )}
        {error ? <p className="nota">{error}</p> : datos && datos.filas.length === 0 ? (
          <p className="nota">No hay personas con esos filtros.</p>
        ) : datos && (
          <>
            <div className="tabla-detalle">
              <table>
                <thead><tr>{datos.columnas.map(c => <th key={c} className="th-loc">{etiqueta(c)}</th>)}</tr></thead>
                <tbody>
                  {datos.filas.map(r => (
                    <tr key={String(r.id)} className="fila-persona" tabIndex={0} onClick={() => abrirFicha(Number(r.id))}
                      onKeyDown={e => { if (e.key === "Enter") abrirFicha(Number(r.id)); }}>
                      {datos.columnas.map(c => <td key={c} className="td-loc">{dato(r[c])}</td>)}
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
      </section>

      {ficha && (
        <div className="ficha-fondo" onClick={() => setFicha(null)}>
          <aside className="ficha-persona" role="dialog" aria-modal="true" aria-label="Ficha de la persona" onClick={e => e.stopPropagation()}>
            <header>
              <h2>{ficha.datos ? dato(ficha.datos.nombre) : "Ficha"}</h2>
              <button type="button" ref={cerrarRef} onClick={() => setFicha(null)} aria-label="Cerrar ficha">×</button>
            </header>
            {ficha.error ? <p className="nota">No se pudo cargar la ficha.</p> : !ficha.datos ? <p className="nota">Cargando…</p> : (
              <dl>
                {Object.entries(ficha.datos).filter(([k]) => k !== "id").map(([k, v]) => (
                  <div key={k}><dt>{etiqueta(k)}</dt><dd>{dato(v)}</dd></div>
                ))}
              </dl>
            )}
            <p className="nota">Esta consulta queda registrada.</p>
          </aside>
        </div>
      )}
    </>
  );
}
