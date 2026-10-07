"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/* Vista nominal: listado de personas con filtros y buscador. Los datos se piden a /api/personas, que verifica el
   rol en el servidor en cada solicitud. No hay exportación: se ve de a 50 por página. */

type Fila = Record<string, string | number | null>;
interface Respuesta { filas: Fila[]; total: number; pagina: number; porPagina: number; columnas: string[] }
interface Facetas { departamentos: string[]; localidades: string[]; estados: string[]; lineas: string[] }
interface Filtros { q: string; departamento: string; localidad: string; estado: string; linea: string }
const VACIOS: Filtros = { q: "", departamento: "", localidad: "", estado: "", linea: "" };

const ETIQUETAS: Record<string, string> = {
  nombre: "Nombre", cuil: "CUIL", nro_doc: "Documento", departamento: "Departamento", localidad: "Localidad", estado: "Estado", linea: "Línea",
};
const etiqueta = (c: string) => ETIQUETAS[c] ?? (c.charAt(0).toUpperCase() + c.slice(1).replace(/_/g, " "));
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
        </header>
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
