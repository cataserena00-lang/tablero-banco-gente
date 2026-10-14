"use client";
import { useEffect, useMemo, useState } from "react";
import { miles, nombreDep } from "@/lib/formato";
import { descargarExcelCmc, parametros } from "@/lib/clienteCmc";

/* Vista nominal de Córdoba me capacita (participantes o capacitadores), aparte del tablero, como la «Vista de personas» de Banco de la Gente.
   Solo la ve el perfil completo y admin: el servidor verifica rol y programa en cada solicitud a /api/cmc/*. */

type Fila = Record<string, string | number | null>;
interface Respuesta { total: number; filas: Fila[]; pagina: number; porPagina: number }
export interface CursoOpcion { id: number; curso: string; inst: string; loc: string; dep: string }
const ESTADOS: [string, string][] = [["INSCRIPTO", "Inscriptos"], ["CURSANDO", "Cursando"], ["APROBADO", "Aprobados"], ["EGRESADO", "Egresados"], ["NO APROBADO", "No aprobados"], ["BAJA", "Bajas"]];
const dato = (v: string | number | null | undefined) => (v === null || v === undefined || v === "" ? "—" : String(v));
const plano = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

export default function VistaNominalCmc({ tipo, deps, zonas, cursos, inicial }: {
  tipo: "participantes" | "capacitadores"; deps: string[]; zonas: [number, string][]; cursos: CursoOpcion[];
  inicial: { dep: string; loc: string; curso: number | null };
}) {
  const esPart = tipo === "participantes";
  const [dep, setDep] = useState(inicial.dep), [loc, setLoc] = useState(inicial.loc), [curso, setCurso] = useState<number | null>(inicial.curso);
  const [estado, setEstado] = useState(""), [busq, setBusq] = useState(""), [q, setQ] = useState(""), [pagina, setPagina] = useState(1);
  const [buscaCurso, setBuscaCurso] = useState("");
  const [datos, setDatos] = useState<Respuesta | null>(null), [cargando, setCargando] = useState(false), [error, setError] = useState<string | null>(null);
  const [bajando, setBajando] = useState(false);

  const locs = useMemo(() => (dep ? zonas.filter(z => deps[z[0]] === dep).map(z => z[1]).sort((a, b) => a.localeCompare(b, "es")) : []), [dep, zonas, deps]);
  const cursoSel = curso !== null ? cursos.find(c => c.id === curso) : null;
  const sugeridos = useMemo(() => {
    const t = plano(buscaCurso.trim());
    if (t.length < 2) return [];
    return cursos.filter(c => plano(`${c.curso} ${c.inst} ${c.loc} ${c.id}`).includes(t)).slice(0, 8);
  }, [buscaCurso, cursos]);

  useEffect(() => { const t = setTimeout(() => { setQ(busq); setPagina(1); }, 400); return () => clearTimeout(t); }, [busq]);

  useEffect(() => {
    const ctl = new AbortController();
    const p = parametros({ curso, dep: dep || null, loc: loc || null, q, estado: esPart ? estado : "" }); p.set("pagina", String(pagina));
    setCargando(true); setError(null);
    fetch(`/api/cmc/${tipo}?${p}`, { signal: ctl.signal }).then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((j: Respuesta) => { setDatos(j); setCargando(false); })
      .catch(e => { if (ctl.signal.aborted) return; setCargando(false); setError(e === 403 ? "No tenés permiso para ver esta información." : e === 503 ? "La base todavía no está disponible." : "No se pudo cargar. Probá de nuevo."); });
    return () => ctl.abort();
  }, [tipo, esPart, curso, dep, loc, q, estado, pagina]);

  const paginas = datos ? Math.max(1, Math.ceil(datos.total / datos.porPagina)) : 1;
  const hayFiltros = !!(dep || loc || curso !== null || estado || busq);
  const limpiar = () => { setDep(""); setLoc(""); setCurso(null); setEstado(""); setBusq(""); setQ(""); setBuscaCurso(""); setPagina(1); };
  const exportar = async () => {
    setBajando(true); setError(null);
    setError(await descargarExcelCmc(tipo, { curso, dep: dep || null, loc: loc || null, q, estado: esPart ? estado : "" })); setBajando(false);
  };
  const puedeExcel = !esPart || curso !== null || !!dep;

  return (
    <>
      <section className="filtros filtros-personas" aria-label="Filtros">
        <div className="filtro-sel"><label>Departamento
          <select value={dep} onChange={e => { setDep(e.target.value); setLoc(""); setPagina(1); }}>
            <option value="">Todos</option>{deps.map(x => <option key={x} value={x}>{nombreDep(x)}</option>)}
          </select></label></div>
        <div className="filtro-sel"><label>Localidad
          <select value={loc} disabled={!dep} onChange={e => { setLoc(e.target.value); setPagina(1); }}>
            <option value="">{dep ? "Todas" : "Elegí un departamento"}</option>{locs.map(x => <option key={x} value={x}>{nombreDep(x)}</option>)}
          </select></label></div>
        {esPart && (
          <div className="filtro-sel"><label>Estado de la inscripción
            <select value={estado} onChange={e => { setEstado(e.target.value); setPagina(1); }}>
              <option value="">Todos</option>{ESTADOS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
            </select></label></div>
        )}
        <div className="filtro-sel cmc-curso-pick"><label>Curso
          <input type="search" placeholder="Buscar un curso" value={buscaCurso} onChange={e => setBuscaCurso(e.target.value)} aria-label="Buscar un curso" /></label>
          {sugeridos.length > 0 && (
            <ul className="cmc-sugeridos" role="listbox">
              {sugeridos.map(c => <li key={c.id}><button type="button" role="option" aria-selected={false} onClick={() => { setCurso(c.id); setBuscaCurso(""); setPagina(1); }}>
                <b>{c.curso}</b><small>{c.inst} · {nombreDep(c.loc)}, {nombreDep(c.dep)}</small></button></li>)}
            </ul>
          )}
        </div>
        <div className="filtro-sel"><label>Buscar {esPart ? "persona" : "capacitador"}
          <input type="search" placeholder="Apellido, nombre, CUIL o DNI" value={busq} onChange={e => setBusq(e.target.value)} aria-label="Buscar" /></label></div>
        <button className="limpiar" type="button" style={{ visibility: hayFiltros ? "visible" : "hidden" }} onClick={limpiar}>Limpiar filtros</button>
      </section>
      {cursoSel && (
        <div className="chips"><span className="chip">Curso: {cursoSel.curso} · {cursoSel.inst}<button type="button" aria-label="Quitar el curso" onClick={() => { setCurso(null); setPagina(1); }}>×</button></span></div>
      )}

      <section className="card" style={{ marginTop: 20 }} aria-live="polite">
        <header>
          <div><h2>{esPart ? "Participantes" : "Capacitadores"}</h2>
            <p className="sub">{datos ? `${miles(datos.total)} ${esPart ? (datos.total === 1 ? "inscripción" : "inscripciones") : (datos.total === 1 ? "capacitador" : "capacitadores")}` : "Cargando…"}{cargando && datos ? " · actualizando…" : ""}</p></div>
          <button type="button" className="acto-link" disabled={bajando || !puedeExcel || !datos?.total} title={puedeExcel ? undefined : "Elegí un departamento o un curso: la base de todo Córdoba es demasiado grande para un Excel"} onClick={exportar}>
            {bajando ? "Preparando…" : `Exportar a Excel${datos?.total && puedeExcel ? ` · ${miles(datos.total)}` : ""}`}</button>
        </header>
        {error && <p className="err" role="alert">{error}</p>}
        {!puedeExcel && <p className="cmc-nota">Para exportar la base de participantes elegí un departamento, una localidad o un curso.</p>}
        <div className="tabla-detalle">
          <table>
            {esPart ? (
              <thead><tr><th className="th-loc">Apellido y nombre</th><th>CUIL</th><th>DNI</th><th>Sexo</th><th className="th-num">Edad</th><th>Teléfono</th><th>Mail</th><th>Estado</th><th>Curso</th></tr></thead>
            ) : (
              <thead><tr><th className="th-loc">Apellido y nombre</th><th>CUIL</th><th className="th-num">Cursos</th><th>Localidades</th><th>Departamentos</th></tr></thead>
            )}
            <tbody>
              {datos?.filas.map((f, i) => esPart ? (
                <tr key={i}><td className="td-loc">{dato(f.apellido)}, {dato(f.nombre)}</td><td>{dato(f.cuil)}</td><td>{dato(f.dni)}</td><td>{dato(f.sexo)}</td><td className="td-num">{dato(f.edad)}</td>
                  <td>{dato(f.telefono)}</td><td>{dato(f.mail)}</td><td>{dato(f.estado)}</td><td>{dato(f.curso)}<br /><small>{dato(f.institucion)} · {nombreDep(String(f.localidad ?? ""))}</small></td></tr>
              ) : (
                <tr key={i}><td className="td-loc">{dato(f.apellido)}, {dato(f.nombre)}</td><td>{dato(f.cuil)}</td><td className="td-num">{dato(f.cursos)}</td>
                  <td>{String(f.localidades ?? "").split(", ").map(nombreDep).join(", ") || "—"}</td><td>{String(f.departamentos ?? "").split(", ").map(nombreDep).join(", ") || "—"}</td></tr>
              ))}
              {datos && !datos.filas.length && <tr><td colSpan={9}>No hay resultados con estos filtros.</td></tr>}
            </tbody>
          </table>
        </div>
        {paginas > 1 && (
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 10 }}>
            <button type="button" className="acto-link" disabled={pagina <= 1} onClick={() => setPagina(p => p - 1)}>← Anterior</button>
            <span className="cmc-nota">Página {miles(pagina)} de {miles(paginas)}</span>
            <button type="button" className="acto-link" disabled={pagina >= paginas} onClick={() => setPagina(p => p + 1)}>Siguiente →</button>
          </div>
        )}
        <p className="cmc-nota">Información confidencial: contiene datos personales. Cada búsqueda y cada exportación queda registrada.</p>
      </section>
    </>
  );
}
