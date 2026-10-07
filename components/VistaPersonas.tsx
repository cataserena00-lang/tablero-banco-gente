"use client";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { COLUMNAS_TABLA, MAX_EXPORTACION, etiquetaColumna as etiqueta, periodo } from "@/lib/personasComun";

/* Vista nominal: listado de personas con filtros y buscador. Cada fila es una persona, con los datos de su última
   solicitud; al hacer clic se despliegan todas sus solicitudes (cada fila del origen es una solicitud, y una persona puede
   tener varias). Los datos se piden a /api/personas, que verifica el rol en el servidor en cada solicitud.
   Se ve de a 50 por página y se puede exportar a PDF (hasta 5.000 personas). */

type Fila = Record<string, string | number | null>;
interface Respuesta { filas: Fila[]; total: number; solicitudes: number; pagina: number; porPagina: number; columnas: string[] }
interface Detalle { persona: Fila; solicitudes: Fila[] }
type Historial = { estado: "cargando" } | { estado: "error" } | { estado: "ok"; datos: Detalle };
interface Facetas { departamentos: string[]; localidades: string[]; estados: string[]; lineas: string[]; columnas?: string[] }
interface Filtros { q: string; departamento: string; localidad: string; estado: string; linea: string }
const VACIOS: Filtros = { q: "", departamento: "", localidad: "", estado: "", linea: "" };
// Mismo nombre sin tildes, en mayúsculas y con espacios simples: así "Villa Allende" encuentra "VILLA ALLENDE"
const clave = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toUpperCase().replace(/\s+/g, " ").trim();
const buscarValor = (vals: string[], pedido: string) => vals.find(v => clave(v) === clave(pedido));

const miles = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const dato = (v: string | number | null | undefined) => v === null || v === undefined || v === "" ? "—" : String(v);
const plural = (n: number, uno: string, varios: string) => `${miles(n)} ${n === 1 ? uno : varios}`;
// En el listado, "Estado" es el de la última solicitud
const etiquetaLista = (c: string) => c === "estado" ? "Último estado" : etiqueta(c);

// Columnas de cada solicitud en el desplegable (solo las que trae la base)
const COLUMNAS_HISTORIAL = ["nro_formulario", "estado", "linea", "monto_prestable", "plazo_devolucion", "valor_cuota", "fecha_aprobado", "fecha_pago_banco", "monto_deuda", "deuda_vencida", "monto_recupero"];
// Títulos cortos para el desplegable (la ficha lateral usa los completos)
const CORTO: Record<string, string> = { nro_formulario: "Formulario", monto_prestable: "Monto", plazo_devolucion: "Plazo", valor_cuota: "Cuota",
  fecha_aprobado: "Aprobación", fecha_pago_banco: "Pago en banco", monto_deuda: "Deuda", deuda_vencida: "Vencida", monto_recupero: "Recupero" };
// En la ficha lateral no se repite lo que ya está arriba (datos de la persona) ni el año y el mes (van como período)
const FIJOS_PERSONA = ["nombre", "cuil", "nro_doc", "departamento", "localidad"];

export default function VistaPersonas({ inicial }: { inicial?: Partial<Filtros> }) {
  // Si se llega desde la ficha de una zona, el departamento y la localidad vienen por URL con los nombres del tablero:
  // se buscan entre los valores de la base (sin tildes ni mayúsculas) y recién entonces se pide el listado.
  const zonaPedida = useRef({ departamento: inicial?.departamento ?? "", localidad: inicial?.localidad ?? "" });
  const [esperando, setEsperando] = useState(!!inicial?.departamento);
  const [aviso, setAviso] = useState<string | null>(null);
  const [f, setF] = useState<Filtros>({ ...VACIOS, estado: inicial?.estado ?? "", linea: inicial?.linea ?? "", q: inicial?.q ?? "" });
  const [busq, setBusq] = useState(inicial?.q ?? "");   // texto escrito; pasa a `f.q` con una pausa
  const [pagina, setPagina] = useState(1);
  const [fac, setFac] = useState<Facetas>({ departamentos: [], localidades: [], estados: [], lineas: [] });
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [abiertos, setAbiertos] = useState<number[]>([]);          // personas con las solicitudes desplegadas
  const [hist, setHist] = useState<Record<number, Historial>>({});  // detalle ya pedido, por persona
  const pedidos = useRef(new Set<number>());
  const [ficha, setFicha] = useState<number | null>(null);
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

  // Departamento pedido por URL: se elige el valor equivalente de la base
  useEffect(() => {
    const dep = zonaPedida.current.departamento;
    if (!esperando || !dep || !fac.departamentos.length || f.departamento) return;
    const v = buscarValor(fac.departamentos, dep);
    if (!v) { setAviso(`No se encontró el departamento «${dep}» en la base de personas. Elegilo en el filtro.`); setEsperando(false); return; }
    setF(a => ({ ...a, departamento: v }));
  }, [esperando, fac.departamentos, f.departamento]);
  // Localidad pedida por URL (en Capital alcanza con el departamento)
  useEffect(() => {
    const { departamento, localidad } = zonaPedida.current;
    if (!esperando || !f.departamento || buscarValor([f.departamento], departamento) === undefined) return;
    if (!localidad || clave(f.departamento) === "CAPITAL") { setEsperando(false); return; }
    if (!fac.localidades.length) return;   // todavía no llegaron las localidades de este departamento
    const v = buscarValor(fac.localidades, localidad);
    if (v) setF(a => ({ ...a, localidad: v })); else setAviso(`No se encontró la localidad «${localidad}» en la base de personas: se muestra todo el departamento.`);
    setEsperando(false);
  }, [esperando, f.departamento, fac.localidades]);

  // Listado
  useEffect(() => {
    if (esperando) return;
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
  }, [f, pagina, esperando]);

  const cambiar = useCallback((k: keyof Filtros, v: string) => {
    setF(a => ({ ...a, [k]: v, ...(k === "departamento" ? { localidad: "" } : {}) })); setPagina(1);
  }, []);
  const limpiar = () => { setF(VACIOS); setBusq(""); setPagina(1); setAviso(null); setEsperando(false); };
  const hayFiltros = Object.values(f).some(Boolean) || busq !== "";

  // Detalle de una persona (solicitudes): se pide una sola vez y lo usan tanto el desplegable como la ficha lateral
  const pedirDetalle = useCallback((id: number) => {
    if (pedidos.current.has(id)) return;
    pedidos.current.add(id);
    setHist(h => ({ ...h, [id]: { estado: "cargando" } }));
    fetch(`/api/personas/${id}`).then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((d: Detalle) => setHist(h => ({ ...h, [id]: { estado: "ok", datos: d } })))
      .catch(() => { pedidos.current.delete(id); setHist(h => ({ ...h, [id]: { estado: "error" } })); });
  }, []);
  const alternar = (id: number) => {
    if (!abiertos.includes(id)) pedirDetalle(id);
    setAbiertos(a => a.includes(id) ? a.filter(x => x !== id) : [...a, id]);
  };
  const abrirFicha = (id: number) => { pedirDetalle(id); setFicha(id); };
  useEffect(() => {
    if (ficha === null) return;
    cerrarRef.current?.focus();
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setFicha(null); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [ficha]);

  const todasCols = fac.columnas?.length ? fac.columnas : COLUMNAS_TABLA.filter(c => c !== "ultima");
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
  const celda = (c: string, r: Fila) => c === "ultima" ? periodo(r.ano, r.mes) : dato(r[c]);

  // Solicitudes de una persona, de la más nueva a la más vieja (la primera es la que se ve en el listado)
  const historial = (id: number, nombre: string) => {
    const h = hist[id];
    if (!h || h.estado === "cargando") return <p className="nota">Cargando solicitudes…</p>;
    if (h.estado === "error") return (
      <p className="nota">No se pudieron cargar las solicitudes.{" "}
        <button type="button" className="limpiar" onClick={() => pedirDetalle(id)}>Reintentar</button></p>);
    const sols = h.datos.solicitudes;
    const cols = COLUMNAS_HISTORIAL.filter(c => sols[0] && c in sols[0]);
    return (
      <>
        <div className="tabla-hist-scroll">
        <table className="tabla-hist">
          <caption className="sr-only">Solicitudes de {nombre}, de la más reciente a la más antigua</caption>
          <thead><tr><th scope="col">Período</th>{cols.map(c => <th key={c} scope="col" title={etiqueta(c)}>{CORTO[c] ?? etiqueta(c)}</th>)}</tr></thead>
          <tbody>
            {sols.map((s, i) => (
              <tr key={i}>
                <td>{periodo(s.ano, s.mes)}{i === 0 && sols.length > 1 && <span className="tag-ultima">Última</span>}</td>
                {cols.map(c => <td key={c}>{dato(s[c])}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        <button type="button" className="limpiar" onClick={() => abrirFicha(id)}>Ver ficha completa</button>
      </>
    );
  };

  const fichaAbierta = ficha !== null ? hist[ficha] : undefined;
  const fichaDatos = fichaAbierta?.estado === "ok" ? fichaAbierta.datos : null;

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
          <label htmlFor="p-est">Estado de la última solicitud</label>
          <select id="p-est" value={f.estado} onChange={e => cambiar("estado", e.target.value)}>
            <option value="">Todos</option>
            {opciones(fac.estados, f.estado).map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        {fac.lineas.length > 0 && (
          <div className="filtro-sel">
            <label htmlFor="p-lin">Línea de la última solicitud</label>
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
            <p className="sub">{error ? "—" : datos ? `${plural(datos.total, "persona", "personas")} · ${plural(datos.solicitudes, "solicitud", "solicitudes")}` : "Cargando…"}
              {cargando && datos ? " · actualizando…" : ""}</p></div>
          <button type="button" className="limpiar" aria-expanded={exp.abierto}
            onClick={() => setExp(e => ({ ...e, abierto: !e.abierto }))}>Exportar PDF</button>
        </header>
        {exp.abierto && (
          <div className="exportar-panel" role="group" aria-label="Exportar a PDF">
            <p className="sub">Se exportan las personas que cumplen los filtros actuales ({datos ? miles(datos.total) : "…"}), cada una con los datos de su última solicitud. Elegí las columnas:</p>
            <div className="exportar-cols">
              <button type="button" className="limpiar" onClick={() => setExp(e => ({ ...e, cols: todasCols }))}>Todas</button>
              <button type="button" className="limpiar" onClick={() => setExp(e => ({ ...e, cols: COLUMNAS_TABLA.filter(c => todasCols.includes(c)) }))}>Las de la tabla</button>
              <button type="button" className="limpiar" onClick={() => setExp(e => ({ ...e, cols: [] }))}>Ninguna</button>
            </div>
            <ul className="exportar-lista">
              {todasCols.map(c => (
                <li key={c}><label><input type="checkbox" checked={exp.cols.includes(c)} onChange={() => alternarCol(c)} /> {etiquetaLista(c)}</label></li>
              ))}
            </ul>
            {excede && <p className="nota" role="alert">Hay más de {miles(MAX_EXPORTACION)} personas con estos filtros. Acotalos (por ejemplo, elegí una localidad) para exportar.</p>}
            {exp.error && <p className="nota" role="alert">{exp.error}</p>}
            <button type="button" className="acto-link" disabled={exp.generando || excede || !exp.cols.length || !datos?.total} onClick={exportar}>
              {exp.generando ? "Generando…" : "Descargar PDF"}</button>
            <p className="nota">La exportación queda registrada. El PDF contiene datos personales: usalo solo para tareas del Banco.</p>
          </div>
        )}
        {aviso && <p className="nota" role="status">{aviso}</p>}
        {error ? <p className="nota">{error}</p> : esperando || !datos ? <p className="nota">Cargando…</p> : datos && datos.filas.length === 0 ? (
          <p className="nota">No hay personas con esos filtros.</p>
        ) : datos && (
          <>
            <p className="nota">Cada fila muestra la última solicitud de la persona. Hacé clic en una fila para ver todas sus solicitudes.</p>
            <div className="tabla-detalle tabla-personas">
              <table>
                <thead><tr>{datos.columnas.map(c => <th key={c} className="th-loc">{etiquetaLista(c)}</th>)}</tr></thead>
                <tbody>
                  {datos.filas.map(r => {
                    const id = Number(r.id), abierto = abiertos.includes(id);
                    return (
                      <Fragment key={id}>
                        <tr className={"fila-persona" + (abierto ? " abierta" : "")} onClick={() => alternar(id)}>
                          {datos.columnas.map((c, i) => (
                            <td key={c} className="td-loc">
                              {i === 0 ? (
                                <button type="button" className="btn-fila" aria-expanded={abierto} aria-controls={`hist-${id}`}
                                  onClick={e => { e.stopPropagation(); alternar(id); }}>
                                  <span className="chev" aria-hidden="true">{abierto ? "▾" : "▸"}</span>{celda(c, r)}
                                </button>
                              ) : celda(c, r)}
                            </td>
                          ))}
                        </tr>
                        {abierto && (
                          <tr id={`hist-${id}`} className="fila-historial">
                            <td colSpan={datos.columnas.length}>{historial(id, dato(r.nombre))}</td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
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

      {ficha !== null && (
        <div className="ficha-fondo" onClick={() => setFicha(null)}>
          <aside className="ficha-persona" role="dialog" aria-modal="true" aria-label="Ficha de la persona" onClick={e => e.stopPropagation()}>
            <header>
              <h2>{fichaDatos ? dato(fichaDatos.persona.nombre) : "Ficha"}</h2>
              <button type="button" ref={cerrarRef} onClick={() => setFicha(null)} aria-label="Cerrar ficha">×</button>
            </header>
            {fichaAbierta?.estado === "error" ? (
              <p className="nota">No se pudo cargar la ficha. <button type="button" className="limpiar" onClick={() => pedirDetalle(ficha)}>Reintentar</button></p>
            ) : !fichaDatos ? <p className="nota">Cargando…</p> : (
              <>
                <dl>
                  {FIJOS_PERSONA.filter(k => k !== "nombre").map(k => <div key={k}><dt>{etiqueta(k)}</dt><dd>{dato(fichaDatos.persona[k])}</dd></div>)}
                  <div><dt>{etiqueta("solicitudes")}</dt><dd>{dato(fichaDatos.persona.solicitudes)}</dd></div>
                </dl>
                <h3>Solicitudes, de la más reciente a la más antigua</h3>
                {fichaDatos.solicitudes.map((s, i) => (
                  <section key={i} className="ficha-solicitud" aria-label={`Solicitud ${periodo(s.ano, s.mes)}`}>
                    <h4>{periodo(s.ano, s.mes)}{i === 0 && fichaDatos.solicitudes.length > 1 && <span className="tag-ultima">Última</span>}</h4>
                    <dl>
                      {Object.entries(s)
                        .filter(([k, v]) => !FIJOS_PERSONA.includes(k) && k !== "ano" && k !== "mes" && v !== null && v !== "")
                        .map(([k, v]) => <div key={k}><dt>{etiqueta(k)}</dt><dd>{dato(v)}</dd></div>)}
                    </dl>
                  </section>
                ))}
              </>
            )}
            {fichaDatos && <a className="limpiar" href={`/api/personas/${ficha}/exportar`} download>Exportar ficha a PDF</a>}
            <p className="nota">Esta consulta queda registrada.</p>
          </aside>
        </div>
      )}
    </>
  );
}
