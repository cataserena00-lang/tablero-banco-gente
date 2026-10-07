"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MapaCircuitosCarga from "./mapa/MapaCircuitosCarga";
import type { CircuitosGeo, InfoCircuito } from "./mapa/MapaCircuitos";

/* ── Tipos ── */
export interface Cubo {
  f: string[];      // fechas ISO
  dep: string[];    // departamentos
  loc: string[];    // localidades
  lin: string[];    // líneas de crédito
  rows: number[][]; // [f_idx, dep_idx, loc_idx, lin_idx, n, m]
}
export interface CuboCapital {
  f: string[];      // fechas ISO (mismas que cubo principal)
  bar: string[];    // barrios
  lin: string[];    // líneas de crédito
  cir?: { c: string; n: string }[]; // circuitos con barrios asignados (código, nombre)
  bar_cir?: number[];               // por barrio: índice en `cir`, o -1 si no tiene circuito
  rows: number[][]; // [f_idx, bar_idx, lin_idx, n, m]
}
export interface GeoData {
  w: number; h: number;
  deptos: { nombre: string; d: string; bbox: number[] }[];
}

export type { CircuitosGeo };

const SIN_CIRCUITO = "__sin_circuito__";   // valor del filtro de circuito: barrios sin circuito asignado
type CatBarrio = "todos" | "con" | "sin";   // filtro por categoría de barrio

type Vista = "panorama" | "localidades" | "barrios";
type Met = "n" | "m";

/* ── Helpers ── */
const MESES = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
const TILDES: Record<string,string> = {
  "COLON":"Colón","RIO CUARTO":"Río Cuarto","RIO PRIMERO":"Río Primero",
  "RIO SECO":"Río Seco","RIO SEGUNDO":"Río Segundo","JUAREZ CELMAN":"Juárez Celman",
  "MARCOS JUAREZ":"Marcos Juárez","ISCHILIN":"Ischilín",
  "GENERAL SAN MARTIN":"General San Martín","UNION":"Unión",
  "PRESIDENTE ROQUE SAENZ PENA":"Presidente Roque Sáenz Peña",
  "SANTA MARIA":"Santa María","CORDOBA":"Córdoba",
  "SIN ASIGNAR":"Sin asignar","SIN DATO":"Sin dato",
};
function nombreDep(s: string) {
  return TILDES[s] || s.toLowerCase()
    .replace(/(^|[\s])(\p{L})/gu, (_, a, b) => a + b.toUpperCase())
    .replace(/ De | Del /g, x => x.toLowerCase());
}
const miles = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const peso = (n: number) => "$ " + miles(n);
const fmtF = (iso: string) => iso.slice(8,10)+"/"+iso.slice(5,7)+"/"+iso.slice(0,4);

function sumaMeses(iso: string, k: number) {
  let y = +iso.slice(0,4), m = +iso.slice(5,7)-1+k;
  y += Math.floor(m/12); m = ((m%12)+12)%12;
  const ult = new Date(y, m+1, 0).getDate();
  const d = Math.min(+iso.slice(8,10), ult);
  return `${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
}

const ESC = ["#E6F2FB","#9BCBEE","#4A97D3","#1F5F99","#0F3A63"];
function colorMapa(v: number, max: number) {
  if (!v) return null;
  const t = Math.min(.999, Math.sqrt(v/max)) * (ESC.length-1);
  const i = Math.floor(t), frac = t-i;
  const hex = (c: string) => [1,3,5].map(j => parseInt(c.slice(j,j+2),16));
  const a = hex(ESC[i]), b = hex(ESC[Math.min(i+1, ESC.length-1)]);
  return "rgb("+a.map((x,j) => Math.round(x+(b[j]-x)*frac)).join(",")+")";
}

function nombreLinea(s: string) {
  const map: Record<string,string> = {
    "LIBRE DISPONIBILIDAD": "Libre Disponibilidad",
    "POTENCIAR EMPRENDIMIENTO": "Potenciar Emprendimiento",
    "PE": "PE",
    "L2": "L2",
    "L4.": "L4",
  };
  return map[s] || s;
}

/* ── Componente principal ── */
export default function Tablero({ cubo, cuboCap, geo, circ, actualizado }: {
  cubo: Cubo; cuboCap: CuboCapital; geo: GeoData | null; circ: CircuitosGeo | null; actualizado: string;
}) {
  const F0 = cubo.f[0], F1 = cubo.f[cubo.f.length-1];

  const [vista, setVista] = useState<Vista>("panorama");
  const [desde, setDesde] = useState(F0);
  const [hasta, setHasta] = useState(F1);
  const [atajo, setAtajo] = useState("todo");
  const [metG, setMetG] = useState<Met>("n");
  const [metM, setMetM] = useState<Met>("m");
  const [dep, setDep] = useState<string|null>(null);
  const [mes, setMes] = useState<string|null>(null);
  const [busqBarrio, setBusqBarrio] = useState("");
  const [metC, setMetC] = useState<Met>("m");
  const [circSel, setCircSel] = useState<string|null>(null);
  const [catBarrio, setCatBarrio] = useState<CatBarrio>("todos");
  const [locSel, setLocSel] = useState<string|null>(null);   // filtro de localidad (departamentos que no son Capital)

  const chartRef = useRef<HTMLDivElement>(null);
  const tipGRef = useRef<HTMLDivElement>(null);
  const tipMRef = useRef<HTMLDivElement>(null);
  const tituloRef = useRef<HTMLHeadingElement>(null);
  const primeraVista = useRef(true);

  /* Navegación */
  const irADep = useCallback((nombre: string) => {
    setDep(nombre); setLocSel(null);
    if (nombre === "CAPITAL") setVista("barrios");
    else setVista("localidades");
  }, []);
  const irAPanorama = useCallback(() => {
    setVista("panorama"); setDep(null); setBusqBarrio(""); setCircSel(null); setCatBarrio("todos"); setLocSel(null);
  }, []);

  /* Al cambiar de vista: arriba de todo y foco en el título (no en la primera carga).
     Los filtros de fecha viven en este componente, así que se mantienen. */
  useEffect(() => {
    if (primeraVista.current) { primeraVista.current = false; return; }
    const quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: quieto ? "auto" : "smooth" });
    tituloRef.current?.focus({ preventScroll: true });
  }, [vista]);

  /* Atajo de fecha */
  const aplicarAtajo = useCallback((k: string) => {
    setAtajo(k); setMes(null);
    if (k === "todo") { setDesde(F0); setHasta(F1); }
    if (k === "mes") { setHasta(F1); setDesde(sumaMeses(F1, -1)); }
    if (k === "3m") { setHasta(F1); setDesde(sumaMeses(F1, -3)); }
    if (k === "anio") { setHasta(F1); setDesde(F1.slice(0,4)+"-01-01"); }
  }, [F0, F1]);

  /* ── Filtrar rows del cubo principal ── */
  const filas = useMemo(() =>
    cubo.rows.filter(r => {
      const f = cubo.f[r[0]];
      return f >= desde && f <= hasta && (!mes || f.slice(0,7) === mes);
    }),
  [cubo, desde, hasta, mes]);

  /* ── Filtrar rows del cubo capital ── */
  const filasCapital = useMemo(() =>
    cuboCap.rows.filter(r => {
      const f = cuboCap.f[r[0]];
      return f >= desde && f <= hasta && (!mes || f.slice(0,7) === mes);
    }),
  [cuboCap, desde, hasta, mes]);

  /* ── Agregados panorama ── */
  const { tot, porDep, porLoc } = useMemo(() => {
    const tot = { n: 0, m: 0 };
    const porDep: Record<string, { n: number; m: number }> = {};
    const porLoc: Record<string, { n: number; m: number }> = {};
    for (const r of filas) {
      const n = r[4], m = r[5];
      tot.n += n; tot.m += m;
      const d = cubo.dep[r[1]];
      const pd = porDep[d] ??= { n: 0, m: 0 };
      pd.n += n; pd.m += m;
      const lk = cubo.loc[r[2]] + "|" + d;
      const pl = porLoc[lk] ??= { n: 0, m: 0 };
      pl.n += n; pl.m += m;
    }
    return { tot, porDep, porLoc };
  }, [filas, cubo]);

  /* ── Datos gráfico mensual (panorama) ── */
  const barras = useMemo(() => {
    const filtrado = cubo.rows.filter(r => {
      const f = cubo.f[r[0]]; return f >= desde && f <= hasta;
    });
    const a: Record<string, { n: number; m: number }> = {};
    for (const r of filtrado) {
      const k = cubo.f[r[0]].slice(0,7);
      const v = a[k] ??= { n: 0, m: 0 };
      v.n += r[4]; v.m += r[5];
    }
    let y = +desde.slice(0,4), m2 = +desde.slice(5,7);
    const ey = +hasta.slice(0,4), em = +hasta.slice(5,7);
    const ms: [string, { n: number; m: number }][] = [];
    while (y < ey || (y === ey && m2 <= em)) {
      const k = `${y}-${String(m2).padStart(2,"0")}`;
      ms.push([k, a[k] || { n: 0, m: 0 }]);
      m2++; if (m2 > 12) { m2 = 1; y++; }
    }
    return ms;
  }, [cubo, desde, hasta]);

  /* ── Ranking panorama ── */
  const ranking = useMemo(() =>
    Object.entries(porDep)
      .filter(([k]) => !["SIN ASIGNAR","SIN DATO"].includes(k))
      .sort((a,b) => b[1][metM] - a[1][metM])
      .slice(0, 10),
  [porDep, metM]);

  /* Top dep y loc para KPIs */
  const topDep = useMemo(() => {
    const arr = Object.entries(porDep).sort((a,b) => b[1].m - a[1].m);
    return arr[0] || null;
  }, [porDep]);
  const topLoc = useMemo(() => {
    const arr = Object.entries(porLoc).sort((a,b) => b[1].m - a[1].m);
    return arr[0] || null;
  }, [porLoc]);

  const sinDatos = useMemo(() =>
    ["SIN ASIGNAR","SIN DATO"].reduce((a, k) => ({
      n: a.n + (porDep[k]?.n || 0), m: a.m + (porDep[k]?.m || 0),
    }), { n: 0, m: 0 }),
  [porDep]);

  /* ── Datos vista Localidades (para un departamento seleccionado) ── */
  const localidadesDep = useMemo(() => {
    if (vista !== "localidades" || !dep) return [];
    const depIdx = cubo.dep.indexOf(dep);
    if (depIdx < 0) return [];
    const filtrado = filas.filter(r => r[1] === depIdx);
    // Agrupar por localidad, con desglose por línea
    const porLoc: Record<string, { n: number; m: number; lineas: Record<string, { n: number; m: number }> }> = {};
    for (const r of filtrado) {
      const loc = cubo.loc[r[2]];
      const pl = porLoc[loc] ??= { n: 0, m: 0, lineas: {} };
      pl.n += r[4]; pl.m += r[5];
      const lin = cubo.lin[r[3]];
      const ll = pl.lineas[lin] ??= { n: 0, m: 0 };
      ll.n += r[4]; ll.m += r[5];
    }
    return Object.entries(porLoc)
      .map(([loc, v]) => ({
        loc, ...v,
        lineasArr: Object.entries(v.lineas).sort((a,b) => b[1].m - a[1].m),
      }))
      .sort((a,b) => b.m - a.m);
  }, [vista, dep, filas, cubo]);

  // Con el filtro de localidad activo la tabla y los indicadores muestran solo esa localidad
  const datosLocalidades = useMemo(
    () => locSel ? localidadesDep.filter(r => r.loc === locSel) : localidadesDep,
    [localidadesDep, locSel]);

  const totDep = useMemo(() => {
    if (!dep) return { n: 0, m: 0 };
    if (locSel) return datosLocalidades.reduce((a, r) => ({ n: a.n + r.n, m: a.m + r.m }), { n: 0, m: 0 });
    return porDep[dep] || { n: 0, m: 0 };
  }, [dep, porDep, locSel, datosLocalidades]);

  // Opciones del select de localidad (alfabéticas); la elegida se mantiene aunque las fechas la dejen sin datos
  const opcionesLocalidad = useMemo(() => {
    const l = localidadesDep.map(r => ({ loc: r.loc, n: r.n }));
    if (locSel && !l.some(x => x.loc === locSel)) l.push({ loc: locSel, n: 0 });
    return l.sort((a, b) => nombreDep(a.loc).localeCompare(nombreDep(b.loc), "es"));
  }, [localidadesDep, locSel]);

  /* ── Circuitos (Capital): código de circuito de un barrio, o null si no tiene ── */
  const codigoCircuito = useCallback((barIdx: number) => {
    const i = cuboCap.bar_cir?.[barIdx] ?? -1;
    return i >= 0 ? cuboCap.cir?.[i]?.c ?? null : null;
  }, [cuboCap]);

  /* Valores por circuito (respeta fechas, no el buscador ni el circuito elegido) */
  const { porCirc, sinClasif } = useMemo(() => {
    const porCirc: Record<string, { n: number; m: number }> = {};
    const sinClasif = { n: 0, m: 0 };
    for (const r of filasCapital) {
      const c = codigoCircuito(r[1]);
      const v = c ? (porCirc[c] ??= { n: 0, m: 0 }) : sinClasif;
      v.n += r[3]; v.m += r[4];
    }
    return { porCirc, sinClasif };
  }, [filasCapital, codigoCircuito]);

  const circVals = useMemo(() => {
    const vals = (circ?.features ?? []).map(f => porCirc[f.properties.codigo]?.[metC] || 0);
    return { vals, max: Math.max(1, ...vals) };
  }, [circ, porCirc, metC]);

  const infoCirc = useMemo(() => {
    const out: Record<string, InfoCircuito> = {};
    (circ?.features ?? []).forEach((f, i) => {
      const { codigo, nombre } = f.properties;
      const v = porCirc[codigo] || { n: 0, m: 0 };
      const col = colorMapa(circVals.vals[i], circVals.max);
      const nom = `Circuito ${codigo} ${nombreDep(nombre)}`;
      out[codigo] = {
        color: col, activo: !!col,
        aria: col ? `${nom}: ${miles(v.n)} créditos, ${peso(v.m)}` : `${nom}: sin datos`,
        tooltip: `<b>${nom.replace(/[<>&]/g, "")}</b><div><span>Créditos</span><span>${miles(v.n)}</span></div><div><span>Monto</span><span>${peso(v.m)}</span></div>`,
      };
    });
    return out;
  }, [circ, porCirc, circVals]);
  const elegirCircuito = useCallback((codigo: string) => setCircSel(c => c === codigo ? null : codigo), []);

  /* Capital según fechas (sin otros filtros): cuántos créditos no tienen barrio (dato vacío) */
  const { sinBarrio, totCapFechas } = useMemo(() => {
    const sinBarrio = { n: 0, m: 0 }, totCapFechas = { n: 0, m: 0 };
    for (const r of filasCapital) {
      totCapFechas.n += r[3]; totCapFechas.m += r[4];
      if (cuboCap.bar[r[1]] === "") { sinBarrio.n += r[3]; sinBarrio.m += r[4]; }
    }
    return { sinBarrio, totCapFechas };
  }, [filasCapital, cuboCap]);

  /* ── Datos vista Barrios (Capital) ── */
  const datosBarrios = useMemo(() => {
    if (vista !== "barrios") return [];
    const porBar: Record<string, { n: number; m: number; lineas: Record<string, { n: number; m: number }> }> = {};
    for (const r of filasCapital) {
      if (circSel) {
        const c = codigoCircuito(r[1]);
        if (circSel === SIN_CIRCUITO ? c !== null : c !== circSel) continue;
      }
      const bar = cuboCap.bar[r[1]];
      if (catBarrio === "sin" ? bar !== "" : catBarrio === "con" && bar === "") continue;
      const pb = porBar[bar] ??= { n: 0, m: 0, lineas: {} };
      pb.n += r[3]; pb.m += r[4];
      const lin = cuboCap.lin[r[2]];
      const ll = pb.lineas[lin] ??= { n: 0, m: 0 };
      ll.n += r[3]; ll.m += r[4];
    }
    let arr = Object.entries(porBar)
      .map(([bar, v]) => ({
        bar, ...v,
        lineasArr: Object.entries(v.lineas).sort((a,b) => b[1].m - a[1].m),
      }))
      .sort((a,b) => b.m - a.m);
    if (busqBarrio) {
      const q = busqBarrio.toUpperCase();
      arr = arr.filter(x => x.bar.includes(q));
    }
    return arr;
  }, [vista, filasCapital, cuboCap, busqBarrio, circSel, catBarrio, codigoCircuito]);

  const totCapital = useMemo(() => {
    if (vista !== "barrios") return { n: 0, m: 0 };
    return datosBarrios.reduce((a, b) => ({ n: a.n + b.n, m: a.m + b.m }), { n: 0, m: 0 });
  }, [vista, datosBarrios]);

  /* Chips */
  const chips: { label: string; clear: () => void }[] = [];
  if (desde !== F0 || hasta !== F1)
    chips.push({ label: `Aprobación: ${fmtF(desde)} a ${fmtF(hasta)}`, clear: () => aplicarAtajo("todo") });
  if (mes) chips.push({ label: `Mes: ${MESES[+mes.slice(5,7)-1]} ${mes.slice(0,4)}`, clear: () => setMes(null) });
  if (circSel && vista === "barrios") {
    const nom = circ?.features.find(f => f.properties.codigo === circSel)?.properties.nombre ?? cuboCap.cir?.find(c => c.c === circSel)?.n ?? "";
    chips.push({
      label: circSel === SIN_CIRCUITO ? "Circuito: sin circuito asignado" : `Circuito: ${circSel}${nom ? " – " + nombreDep(nom) : ""}`,
      clear: () => setCircSel(null),
    });
  }
  if (catBarrio !== "todos" && vista === "barrios")
    chips.push({ label: catBarrio === "sin" ? "Barrio: sin barrio (dato vacío)" : "Barrio: solo con barrio", clear: () => setCatBarrio("todos") });
  if (locSel && vista === "localidades") chips.push({ label: `Localidad: ${nombreDep(locSel)}`, clear: () => setLocSel(null) });
  if (dep && vista === "panorama") chips.push({ label: `Departamento: ${nombreDep(dep)}`, clear: () => setDep(null) });

  /* ── SVG Gráfico ── */
  const [chartW, setChartW] = useState(1000);
  // El contenedor del gráfico solo existe en el panorama: se desmonta al entrar a un departamento
  // y se crea uno nuevo al volver, así que hay que volver a observarlo y medirlo (depende de `vista`).
  useEffect(() => {
    const el = chartRef.current;
    if (!el) return;
    const medir = () => { if (el.clientWidth > 0) setChartW(Math.max(300, el.clientWidth)); };
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el); return () => obs.disconnect();
  }, [vista]);

  const grafSvg = useMemo(() => {
    const W = chartW, H = 290, pl = W < 520 ? 60 : 66, pb = 30, pt = 14, pr = 8;
    const maxVal = Math.max(1, ...barras.map(x => x[1][metG]));
    const pasos = 4;
    const tick = (v: number) => metG === "m"
      ? (v >= 1e6 ? "$ "+miles(v/1e6)+" M" : v >= 1e3 ? "$ "+miles(v/1e3)+" mil" : peso(v))
      : miles(v);
    const bw = (W-pl-pr) / barras.length;
    const paso = Math.max(1, Math.ceil(52/bw));
    return { W, H, pl, pb, pt, pr, maxVal, pasos, tick, bw, paso };
  }, [chartW, barras, metG]);

  /* ── Mapa ── */
  const mapaVals = useMemo(() => {
    const met = metM;
    const vals = (geo?.deptos ?? []).map(d => (porDep[d.nombre]?.[met]) || 0);
    const max = Math.max(1, ...vals);
    return { vals, max };
  }, [geo, porDep, metM]);

  const fmtLeyenda = (v: number, met: Met = metM) =>
    met === "m" ? (v >= 1e6 ? "$ "+(v/1e6).toLocaleString("es-AR",{maximumFractionDigits:0})+" M" : peso(v)) : miles(v);

  /* ── Desglose por línea (mini tabla) ── */
  const LineaDesglose = ({ lineasArr }: { lineasArr: [string, { n: number; m: number }][] }) => (
    <div className="desglose-lineas">
      {lineasArr.map(([lin, v]) => (
        <div key={lin} className="desglose-row">
          <span className="desglose-lin">{nombreLinea(lin)}</span>
          <span className="desglose-val">{miles(v.n)}</span>
          <span className="desglose-val">{peso(v.m)}</span>
        </div>
      ))}
    </div>
  );

  /* ── Filtros (compartido) ── */
  const filtrosUI = (
    <>
      <section className="filtros" aria-label="Filtros">
        <div>
          <h2>Fecha de aprobación</h2>
          <div className="seg" role="group" aria-label="Atajos de fecha">
            {[["mes","Último mes"],["3m","Últimos 3 meses"],["anio","Este año"],["todo","Todo"]].map(([k,l]) => (
              <button key={k} type="button" aria-pressed={atajo===k} onClick={() => aplicarAtajo(k)}>{l}</button>
            ))}
          </div>
        </div>
        <div className="rango fecha">
          <div><label>Desde</label><input type="date" value={desde} onChange={e => {
            if (!e.target.value) return;
            const v = e.target.value;
            setDesde(v); if (v > hasta) setHasta(v); setAtajo(""); setMes(null);
          }} /></div>
          <div><label>Hasta</label><input type="date" value={hasta} onChange={e => {
            if (!e.target.value) return;
            const v = e.target.value;
            setHasta(v); if (desde > v) setDesde(v); setAtajo(""); setMes(null);
          }} /></div>
        </div>
        <button className="limpiar" type="button" style={{visibility: chips.length ? "visible":"hidden"}}
          onClick={() => { if (vista === "panorama") setDep(null); setCircSel(null); setCatBarrio("todos"); setLocSel(null); aplicarAtajo("todo"); }}>Limpiar filtros</button>
      </section>
      {chips.length > 0 && (
        <div className="chips" aria-live="polite">
          {chips.map(c => (
            <span key={c.label} className="chip">{c.label}
              <button type="button" aria-label={`Quitar filtro: ${c.label}`} onClick={c.clear}>×</button>
            </span>
          ))}
        </div>
      )}
    </>
  );

  /* ── Breadcrumb ── */
  const breadcrumb = vista !== "panorama" ? (
    <nav className="breadcrumb" aria-label="Navegación">
      <button type="button" onClick={irAPanorama}>Córdoba</button>
      <span className="bc-sep">›</span>
      <span className="bc-current">{vista === "barrios" ? "Capital – Barrios" : nombreDep(dep!)}</span>
    </nav>
  ) : null;

  /* ── Volver (vistas de detalle) y título de vista (recibe el foco al navegar) ── */
  const botonVolver = vista !== "panorama" ? (
    <button type="button" className="volver" onClick={irAPanorama}>
      <span aria-hidden="true">←</span> Volver al resumen general
    </button>
  ) : null;
  const tituloVista = (
    <h2 className="vista-titulo" ref={tituloRef} tabIndex={-1}>
      {vista === "panorama" ? "Resumen general" : vista === "barrios" ? "Capital – Barrios y circuitos" : `Departamento ${nombreDep(dep!)}`}
    </h2>
  );

  /* ════════════════════════════════════════════════════════════════
     VISTA: PANORAMA
     ════════════════════════════════════════════════════════════════ */
  const vistaPanorama = (
    <>
      {/* KPIs */}
      <section className="kpis" aria-label="Indicadores" style={{marginTop:20}}>
        <div className="kpi"><span>Créditos pendientes</span><b>{miles(tot.n)}</b><small>aprobados, sin entregar</small></div>
        <div className="kpi dest"><span>Monto total a entregar</span><b>{peso(tot.m)}</b><small>suma de montos prestables</small></div>
        <div className="kpi"><span>Monto promedio</span><b>{tot.n ? peso(tot.m/tot.n) : "—"}</b><small>por crédito</small></div>
        <div className="kpi"><span>Departamento con mayor monto</span>
          <b className="chico">{topDep ? nombreDep(topDep[0]) : "—"}</b>
          <small>{topDep ? `${peso(topDep[1].m)} · ${miles(topDep[1].n)} créditos` : ""}</small></div>
        <div className="kpi"><span>Localidad con mayor monto</span>
          <b className="chico">{topLoc ? nombreDep(topLoc[0].split("|")[0]) : "—"}</b>
          <small>{topLoc ? `${peso(topLoc[1].m)} · ${miles(topLoc[1].n)} créditos` : ""}</small></div>
      </section>

      {/* Gráfico mensual */}
      <section className="card" style={{marginTop:20}}>
        <header>
          <div><h2>Créditos pendientes por mes de aprobación</h2>
            <p className="sub">{barras.length} {barras.length===1?"mes":"meses"} · {fmtF(desde)} a {fmtF(hasta)} · hacé clic en una barra para filtrar el mes</p></div>
          <div className="seg" role="group" aria-label="Métrica del gráfico">
            <button type="button" aria-pressed={metG==="n"} onClick={() => setMetG("n")}>Cantidad</button>
            <button type="button" aria-pressed={metG==="m"} onClick={() => setMetG("m")}>Monto</button>
          </div>
        </header>
        <div className="chartbox" ref={chartRef} style={{position:"relative"}}>
          <svg viewBox={`0 0 ${grafSvg.W} ${grafSvg.H}`} width="100%" role="img" aria-label="Gráfico de barras mensual">
            {Array.from({length: grafSvg.pasos+1}, (_,i) => {
              const v = grafSvg.maxVal * i / grafSvg.pasos;
              const yy = grafSvg.pt + (grafSvg.H - grafSvg.pt - grafSvg.pb) * (1 - i/grafSvg.pasos);
              return <g key={i}>
                <line className="guia" x1={grafSvg.pl} x2={grafSvg.W-grafSvg.pr} y1={yy} y2={yy} />
                <text className="eje" x={grafSvg.pl-8} y={yy+4} textAnchor="end">{grafSvg.tick(v)}</text>
              </g>;
            })}
            {barras.map(([k, v], i) => {
              const h = (grafSvg.H-grafSvg.pt-grafSvg.pb) * (v[metG]/grafSvg.maxVal);
              const x = grafSvg.pl + i*grafSvg.bw + grafSvg.bw*.18;
              const w = grafSvg.bw*.64;
              const etq = i % grafSvg.paso === 0;
              return <g key={k}>
                <rect className={`barra${mes===k?" sel":""}`}
                  x={x} y={grafSvg.H-grafSvg.pb-h} width={w}
                  height={Math.max(h, v[metG]?1:0)} rx={2}
                  tabIndex={0} role="button"
                  aria-label={`${MESES[+k.slice(5)-1]} ${k.slice(0,4)}: ${miles(v.n)} créditos, ${peso(v.m)}`}
                  onClick={() => setMes(mes===k?null:k)}
                  onMouseMove={e => {
                    const tip = tipGRef.current, box = chartRef.current;
                    if (!tip || !box) return;
                    const r = box.getBoundingClientRect();
                    tip.style.display = "block";
                    tip.innerHTML = `<b>${MESES[+k.slice(5)-1]} ${k.slice(0,4)}</b><div><span>Créditos</span><span>${miles(v.n)}</span></div><div><span>Monto</span><span>${peso(v.m)}</span></div>`;
                    tip.style.left = Math.min(e.clientX-r.left+14, r.width-170) + "px";
                    tip.style.top = "8px";
                  }}
                  onMouseLeave={() => { if (tipGRef.current) tipGRef.current.style.display = "none"; }}
                />
                <rect x={grafSvg.pl+i*grafSvg.bw} y={grafSvg.pt} width={grafSvg.bw}
                  height={grafSvg.H-grafSvg.pt-grafSvg.pb} fill="transparent"
                  onClick={() => setMes(mes===k?null:k)}
                  onMouseMove={e => {
                    const tip = tipGRef.current, box = chartRef.current;
                    if (!tip || !box) return;
                    const r = box.getBoundingClientRect();
                    tip.style.display = "block";
                    tip.innerHTML = `<b>${MESES[+k.slice(5)-1]} ${k.slice(0,4)}</b><div><span>Créditos</span><span>${miles(v.n)}</span></div><div><span>Monto</span><span>${peso(v.m)}</span></div>`;
                    tip.style.left = Math.min(e.clientX-r.left+14, r.width-170) + "px";
                    tip.style.top = "8px";
                  }}
                  onMouseLeave={() => { if (tipGRef.current) tipGRef.current.style.display = "none"; }}
                />
                {etq && <text className="eje" x={grafSvg.pl+i*grafSvg.bw+grafSvg.bw/2} y={grafSvg.H-10} textAnchor="middle">
                  {MESES[+k.slice(5)-1]} {k.slice(2,4)}
                </text>}
              </g>;
            })}
          </svg>
          <div className="tip" ref={tipGRef} />
        </div>
      </section>

      {/* Mapa + Ranking */}
      <div className="grid" style={{marginTop:20}}>
        {geo && (
        <section className="card">
          <header>
            <div><h2>Departamentos de Córdoba</h2><p className="sub">Hacé clic en un departamento para ver el detalle</p></div>
            <div className="seg" role="group" aria-label="Métrica del mapa">
              <button type="button" aria-pressed={metM==="m"} onClick={() => setMetM("m")}>Monto</button>
              <button type="button" aria-pressed={metM==="n"} onClick={() => setMetM("n")}>Cantidad</button>
            </div>
          </header>
          <div className="chartbox" style={{position:"relative"}}>
            <svg className="mapa" viewBox={`0 0 ${geo.w} ${geo.h}`} role="img" aria-label="Mapa de departamentos de Córdoba">
              {geo.deptos.map((d, i) => {
                const c = colorMapa(mapaVals.vals[i], mapaVals.max);
                return <path key={d.nombre}
                  className={`dep${c?"":" vacio"}${dep===d.nombre?" sel":""}`}
                  d={d.d} fill={c || "#E5E7EB"}
                  tabIndex={c ? 0 : -1}
                  role={c ? "button" : undefined}
                  aria-label={c ? `${nombreDep(d.nombre)}: ${miles(porDep[d.nombre]?.n||0)} créditos, ${peso(porDep[d.nombre]?.m||0)}` : undefined}
                  onClick={() => { if (c) irADep(d.nombre); }}
                  onMouseMove={e => {
                    const tip = tipMRef.current;
                    const box = (e.currentTarget as SVGPathElement).closest(".chartbox") as HTMLElement;
                    if (!tip || !box) return;
                    const r = box.getBoundingClientRect();
                    const v = porDep[d.nombre] || { n:0, m:0 };
                    tip.style.display = "block";
                    tip.innerHTML = `<b>${nombreDep(d.nombre)}</b><div><span>Créditos</span><span>${miles(v.n)}</span></div><div><span>Monto</span><span>${peso(v.m)}</span></div>`;
                    tip.style.left = Math.min(e.clientX-r.left+14, r.width-170)+"px";
                    tip.style.top = (e.clientY-r.top+14)+"px";
                  }}
                  onMouseLeave={() => { if (tipMRef.current) tipMRef.current.style.display = "none"; }}
                />;
              })}
            </svg>
            <div className="tip" ref={tipMRef} />
          </div>
          <div className="leyenda">
            <span>{fmtLeyenda(0)}</span>
            <div className="escala" />
            <span>{fmtLeyenda(mapaVals.max)}</span>
            <span style={{marginLeft:8}}>
              <i style={{display:"inline-block",width:12,height:12,background:"#E5E7EB",borderRadius:3,verticalAlign:-2}} /> Sin datos
            </span>
          </div>
          {sinDatos.n > 0 && (
            <p className="nota">{miles(sinDatos.n)} créditos ({peso(sinDatos.m)}) no tienen departamento asignado en la base y no se pintan en el mapa.</p>
          )}
        </section>
        )}

        <section className="card">
          <header><div><h2>Ranking de departamentos</h2>
            <p className="sub">Top 10 por {metM==="m"?"monto":"cantidad de créditos"} · clic para ver detalle</p></div></header>
          <ol className="rank">
            {ranking.map(([k, v]) => {
              const maxR = ranking[0]?.[1][metM] || 1;
              return <li key={k} onClick={() => irADep(k)} style={{cursor:"pointer"}} role="button" tabIndex={0}>
                <span title={nombreDep(k)}>{nombreDep(k)}</span>
                <div className="bar"><i style={{width:`${v[metM]/maxR*100}%`}} /></div>
                <span>{metM==="m"?peso(v.m):miles(v.n)}</span>
              </li>;
            })}
          </ol>
        </section>
      </div>
    </>
  );

  /* ════════════════════════════════════════════════════════════════
     VISTA: LOCALIDADES (detalle de un departamento)
     ════════════════════════════════════════════════════════════════ */
  const vistaLocalidades = dep ? (
    <>
      {/* KPIs del departamento */}
      <section className="kpis kpis-3" aria-label="Indicadores del departamento" style={{marginTop:20}}>
        <div className="kpi"><span>Créditos en {nombreDep(dep)}</span><b>{miles(totDep.n)}</b></div>
        <div className="kpi dest"><span>Monto total</span><b>{peso(totDep.m)}</b></div>
        <div className="kpi"><span>Localidades</span><b>{miles(datosLocalidades.length)}</b></div>
      </section>

      {/* Filtro de localidad */}
      <section className="filtros filtros-capital" aria-label="Filtro de localidad" style={{marginTop:20}}>
        <div className="filtro-sel">
          <label htmlFor="f-localidad">Localidad</label>
          <select id="f-localidad" value={locSel ?? ""} onChange={e => setLocSel(e.target.value || null)}>
            <option value="">Todas las localidades ({miles(localidadesDep.length)})</option>
            {opcionesLocalidad.map(o => (
              <option key={o.loc} value={o.loc}>{nombreDep(o.loc)} ({miles(o.n)})</option>
            ))}
          </select>
        </div>
      </section>

      {/* Tabla de localidades */}
      <section className="card" style={{marginTop:20}}>
        <header>
          <div><h2>Localidades de {nombreDep(dep)}</h2>
            <p className="sub">{datosLocalidades.length} {datosLocalidades.length === 1 ? "localidad" : "localidades"} · ordenadas por monto</p></div>
        </header>
        {datosLocalidades.length === 0 ? (
          <p className="nota">No hay datos para este departamento en el rango de fechas seleccionado.</p>
        ) : (
          <div className="tabla-detalle">
            <table>
              <thead>
                <tr>
                  <th className="th-loc">Localidad</th>
                  <th className="th-num">Créditos</th>
                  <th className="th-num">Monto</th>
                  <th className="th-num">Promedio</th>
                  <th className="th-lineas">Desglose por línea</th>
                </tr>
              </thead>
              <tbody>
                {datosLocalidades.map(row => (
                  <tr key={row.loc}>
                    <td className="td-loc">{nombreDep(row.loc)}</td>
                    <td className="td-num">{miles(row.n)}</td>
                    <td className="td-num">{peso(row.m)}</td>
                    <td className="td-num">{row.n ? peso(row.m / row.n) : "—"}</td>
                    <td className="td-lineas"><LineaDesglose lineasArr={row.lineasArr} /></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="td-loc"><b>Total</b></td>
                  <td className="td-num"><b>{miles(totDep.n)}</b></td>
                  <td className="td-num"><b>{peso(totDep.m)}</b></td>
                  <td className="td-num"><b>{totDep.n ? peso(totDep.m / totDep.n) : "—"}</b></td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>
    </>
  ) : null;

  /* ════════════════════════════════════════════════════════════════
     VISTA: BARRIOS (Capital)
     ════════════════════════════════════════════════════════════════ */
  const vistaBarrios = (
    <>
      {/* KPIs de Capital */}
      <section className="kpis kpis-4" aria-label="Indicadores de Capital" style={{marginTop:20}}>
        <div className="kpi"><span>Créditos en Capital</span><b>{miles(totCapital.n)}</b></div>
        <div className="kpi dest"><span>Monto total</span><b>{peso(totCapital.m)}</b></div>
        <div className="kpi"><span>Barrios</span><b>{miles(datosBarrios.filter(x => x.bar).length)}</b></div>
        <button type="button" className="kpi kpi-btn" aria-pressed={catBarrio === "sin"}
          onClick={() => setCatBarrio(c => c === "sin" ? "todos" : "sin")}>
          <span>Sin barrio (dato vacío)</span><b>{miles(sinBarrio.n)}</b>
          <small>{totCapFechas.n ? `${(100 * sinBarrio.n / totCapFechas.n).toLocaleString("es-AR", { maximumFractionDigits: 1 })} % de Capital` : "—"} · {peso(sinBarrio.m)}</small>
          <small className="kpi-accion">{catBarrio === "sin" ? "Quitar filtro" : "Ver solo estos"}</small>
        </button>
      </section>

      {/* Filtros de Capital: circuito y categoría de barrio */}
      <section className="filtros filtros-capital" aria-label="Filtros de Capital" style={{marginTop:20}}>
        <div className="filtro-sel">
          <label htmlFor="f-circuito">Circuito</label>
          <select id="f-circuito" value={circSel ?? ""} onChange={e => setCircSel(e.target.value || null)}>
            <option value="">Todos los circuitos</option>
            {(cuboCap.cir ?? []).map(c => (
              <option key={c.c} value={c.c}>{c.c} – {nombreDep(c.n)} ({miles(porCirc[c.c]?.n || 0)})</option>
            ))}
            <option value={SIN_CIRCUITO}>Sin circuito asignado ({miles(sinClasif.n)})</option>
          </select>
        </div>
        <div className="filtro-sel">
          <label htmlFor="f-barrio">Barrio</label>
          <select id="f-barrio" value={catBarrio} onChange={e => setCatBarrio(e.target.value as CatBarrio)}>
            <option value="todos">Todos ({miles(totCapFechas.n)})</option>
            <option value="con">Con barrio ({miles(totCapFechas.n - sinBarrio.n)})</option>
            <option value="sin">Sin barrio – dato vacío ({miles(sinBarrio.n)})</option>
          </select>
        </div>
      </section>

      {/* Mapa de circuitos (coroplético) */}
      {circ && cuboCap.cir && (
        <section className="card" style={{marginTop:20}}>
          <header>
            <div><h2>Circuitos de Córdoba Capital</h2>
              <p className="sub">Suma de los barrios de cada circuito · hacé clic en un circuito para filtrar la tabla de barrios</p></div>
            <div className="seg" role="group" aria-label="Métrica del mapa de circuitos">
              <button type="button" aria-pressed={metC==="m"} onClick={() => setMetC("m")}>Monto</button>
              <button type="button" aria-pressed={metC==="n"} onClick={() => setMetC("n")}>Cantidad</button>
            </div>
          </header>
          <div className="chartbox mapa-circ" style={{position:"relative"}}>
            <MapaCircuitosCarga geo={circ} info={infoCirc} seleccionado={circSel === SIN_CIRCUITO ? null : circSel} onSelect={elegirCircuito} />
          </div>
          <p className="nota mapa-ayuda">
            <span className="ayuda-mouse">Hacé clic en el mapa para activar el zoom con la rueda del mouse.</span>
            <span className="ayuda-tactil">Con dos dedos movés y ampliás el mapa; con uno se desplaza la página.</span>
          </p>
          <div className="leyenda">
            <span>{fmtLeyenda(0, metC)}</span>
            <div className="escala" />
            <span>{fmtLeyenda(circVals.max, metC)}</span>
            <span style={{marginLeft:8}}>
              <i style={{display:"inline-block",width:12,height:12,background:"#E5E7EB",borderRadius:3,verticalAlign:-2}} /> Sin datos
            </span>
          </div>
          {sinClasif.n > 0 && (
            <p className="nota">{miles(sinClasif.n)} créditos ({peso(sinClasif.m)}) no se pudieron asignar a un circuito (sin barrio, sin coincidencia con la base oficial o ambiguo) y no se pintan en el mapa; sí figuran en la tabla de barrios.</p>
          )}
        </section>
      )}

      {/* Buscador + tabla de barrios */}
      <section className="card" style={{marginTop:20}}>
        <header>
          <div><h2>Barrios de Córdoba Capital</h2>
            <p className="sub">{datosBarrios.filter(x => x.bar).length} barrios · ordenados por monto</p></div>
          <div className="buscar-barrio">
            <input type="search" placeholder="Buscar barrio…" value={busqBarrio}
              onChange={e => setBusqBarrio(e.target.value)} aria-label="Buscar barrio" />
          </div>
        </header>
        {datosBarrios.length === 0 ? (
          <p className="nota">{busqBarrio ? "No se encontraron barrios con ese nombre." : "No hay datos para Capital en el rango de fechas seleccionado."}</p>
        ) : (
          <div className="tabla-detalle">
            <table>
              <thead>
                <tr>
                  <th className="th-loc">Barrio</th>
                  <th className="th-num">Créditos</th>
                  <th className="th-num">Monto</th>
                  <th className="th-num">Promedio</th>
                  <th className="th-lineas">Desglose por línea</th>
                </tr>
              </thead>
              <tbody>
                {datosBarrios.map(row => (
                  <tr key={row.bar}>
                    <td className="td-loc">{row.bar ? nombreDep(row.bar) : <em className="sin-barrio">Sin barrio (dato vacío)</em>}</td>
                    <td className="td-num">{miles(row.n)}</td>
                    <td className="td-num">{peso(row.m)}</td>
                    <td className="td-num">{row.n ? peso(row.m / row.n) : "—"}</td>
                    <td className="td-lineas"><LineaDesglose lineasArr={row.lineasArr} /></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="td-loc"><b>Total</b></td>
                  <td className="td-num"><b>{miles(totCapital.n)}</b></td>
                  <td className="td-num"><b>{peso(totCapital.m)}</b></td>
                  <td className="td-num"><b>{totCapital.n ? peso(totCapital.m / totCapital.n) : "—"}</b></td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>
    </>
  );

  /* ── RENDER ── */
  return (
    <>
      <div className="franja" />
      <header className="top"><div className="wrap">
        <div className="logo" role="img" aria-label="Espacio reservado para el logo">Espacio para logo<br/>Gobierno de Córdoba</div>
        <div className="titulo"><h1>Banco de la Gente</h1><p>Créditos aprobados pendientes de entrega</p></div>
        <div className="actualiz">Datos actualizados el<b>{fmtF(actualizado)}</b></div>
        <form method="post" action="/api/logout"><button className="salir" type="submit">Salir</button></form>
      </div></header>

      <main className="dash"><div className="wrap">
        {botonVolver}
        {filtrosUI}
        {breadcrumb}
        {tituloVista}
        {vista === "panorama" && vistaPanorama}
        {vista === "localidades" && vistaLocalidades}
        {vista === "barrios" && vistaBarrios}
      </div></main>
    </>
  );
}
