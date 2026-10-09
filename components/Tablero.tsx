"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import FichaZona, { plural } from "./FichaZona";
import { CON_MONTO, resumenEstados, resumenTotal, type DatosEstados } from "@/lib/estadosAgregados";
import { CATEGORIAS, categoriaDe } from "@/lib/estados";
import ResumenEstadosVista from "./ResumenEstadosVista";
import { BarraPartes, BarrasH, colorSerie } from "./graficos";
import { LogoBanco } from "./Marca";
import { fmtF, lineaCanonica, miles, nombreDep, nombreLinea, peso } from "@/lib/formato";
import { BARRIO_VACIO, antiguedad, esperaPromedio, fichaBarrio, fichaDepartamento, fichaLocalidad, hoyArgentina, notaBarrio, subBarrio, zonasInterior } from "@/lib/acto";
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

const PENDIENTES = "pendientes";   // valor del filtro de estado del mapa: lo pendiente de entrega (vista de siempre)
const TODAS = "todas";             // todas las solicitudes, de cualquier estado
const SIN_CIRCUITO = "__sin_circuito__";   // valor del filtro de circuito: barrios sin circuito asignado
type CatBarrio = "todos" | "con" | "sin";   // filtro por categoría de barrio

type Vista = "panorama" | "localidades" | "barrios";
type Met = "n" | "m";

/* ── Helpers ── */
const MESES = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
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

/* ── Componente principal ── */
export default function Tablero({ cubo, cuboCap, geo, circ, estados, actualizado }: {
  cubo: Cubo; cuboCap: CuboCapital; geo: GeoData | null; circ: CircuitosGeo | null; estados: DatosEstados | null; actualizado: string;
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
  const [estadoSel, setEstadoSel] = useState<string>(PENDIENTES);   // estado que pinta el mapa y ordena el ranking de departamentos
  const [circSel, setCircSel] = useState<string|null>(null);
  const [catBarrio, setCatBarrio] = useState<CatBarrio>("todos");
  const [locFicha, setLocFicha] = useState<number|null>(null);       // ficha de localidad abierta (índice en cubo.loc)
  const [barrioFicha, setBarrioFicha] = useState<number|null>(null); // ficha de barrio abierta (índice en cuboCap.bar)

  const chartRef = useRef<HTMLDivElement>(null);
  const tipGRef = useRef<HTMLDivElement>(null);
  const tipMRef = useRef<HTMLDivElement>(null);
  const tituloRef = useRef<HTMLHeadingElement>(null);
  const primeraVista = useRef(true);

  /* Navegación */
  const irADep = useCallback((nombre: string) => {
    setDep(nombre); setLocFicha(null); setBarrioFicha(null);
    if (nombre === "CAPITAL") setVista("barrios");
    else setVista("localidades");
  }, []);
  const irAPanorama = useCallback(() => {
    setVista("panorama"); setDep(null); setBusqBarrio(""); setCircSel(null); setCatBarrio("todos"); setLocFicha(null); setBarrioFicha(null);
  }, []);

  /* Al cambiar de vista: arriba de todo y foco en el título (no en la primera carga).
     Los filtros de fecha viven en este componente, así que se mantienen. */
  useEffect(() => {
    if (primeraVista.current) { primeraVista.current = false; return; }
    const quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: quieto ? "auto" : "smooth" });
    tituloRef.current?.focus({ preventScroll: true });
  }, [vista, locFicha, barrioFicha]);

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

  /* Espera de entrega: días desde la aprobación de los créditos del filtro actual (la fecha de hoy se calcula en el
     navegador porque la página es estática) */
  const [hoy, setHoy] = useState<string | null>(null);
  useEffect(() => { setHoy(hoyArgentina()); }, []);
  const espera = useMemo(() => {
    if (!hoy || !tot.n) return null;
    const porF = new Map<string, { f: string; n: number; m: number }>();
    for (const r of filas) {
      const f = cubo.f[r[0]];
      const x = porF.get(f) ?? { f, n: 0, m: 0 };
      x.n += r[4]; x.m += r[5]; porF.set(f, x);
    }
    return antiguedad([...porF.values()], hoy);
  }, [filas, cubo, hoy, tot.n]);

  /* Mapa y ranking según el estado elegido: lo pendiente de entrega (con el filtro de fechas) o las solicitudes de una categoría
     de estado (base de personas, sin filtro de fechas). Se pintan los dos con `porDepVis`. */
  const porDepEstado = useMemo(() => {
    if (!estados || estadoSel === PENDIENTES) return null;
    const a: Record<string, { n: number; m: number }> = {};
    for (const [di, , ei, , n, m] of estados.zonas) {
      if (estadoSel !== TODAS && categoriaDe(estados.estados[ei]) !== estadoSel) continue;
      const v = a[estados.dep[di]] ??= { n: 0, m: 0 };
      v.n += n; v.m += m;
    }
    return a;
  }, [estados, estadoSel]);
  const porDepVis = porDepEstado ?? porDep;
  const verEstado = porDepEstado !== null;
  const conMontoVis = !verEstado || CON_MONTO.has(estadoSel);   // en los otros estados el monto es solo lo solicitado
  const metMVis: Met = conMontoVis ? metM : "n";
  const nombreEstadoSel = estadoSel === PENDIENTES ? "Pendientes de entrega" : estadoSel === TODAS ? "Todas las solicitudes" : estadoSel;
  const rankingVis = useMemo(() =>
    Object.entries(porDepVis)
      .filter(([k]) => !["SIN ASIGNAR","SIN DATO"].includes(k))
      .sort((a,b) => b[1][metMVis] - a[1][metMVis]),
  [porDepVis, metMVis]);
  const sinDatosVis = useMemo(() =>
    ["SIN ASIGNAR","SIN DATO"].reduce((a, k) => ({
      n: a.n + (porDepVis[k]?.n || 0), m: a.m + (porDepVis[k]?.m || 0),
    }), { n: 0, m: 0 }),
  [porDepVis]);
  const resumenPais = useMemo(() => estados ? resumenTotal(estados) : null, [estados]);
  // Pendientes por línea (con el filtro de fechas): la línea se unifica con su nombre oficial
  const pendPorLinea = useMemo(() => {
    const a = new Map<string, { n: number; m: number }>();
    for (const r of filas) {
      const crudo = cubo.lin[r[3]];
      const k = lineaCanonica(crudo) ?? crudo;
      const v = a.get(k) ?? { n: 0, m: 0 }; v.n += r[4]; v.m += r[5]; a.set(k, v);
    }
    return [...a].sort((x, y) => y[1].m - x[1].m);
  }, [filas, cubo]);

  /* ── Vista departamento (ficha): siempre sobre todo el stock, sin filtro de fecha ── */
  const depIdx = dep ? cubo.dep.indexOf(dep) : -1;
  const zonasLoc = useMemo(
    () => depIdx < 0 ? [] : zonasInterior(cubo).filter(z => z.dep === depIdx),
    [cubo, depIdx]);
  const fichaDep = useMemo(() => depIdx < 0 ? null : fichaDepartamento(cubo, depIdx), [cubo, depIdx]);
  const fichaLoc = useMemo(
    () => depIdx < 0 || locFicha === null ? null : fichaLocalidad(cubo, depIdx, locFicha),
    [cubo, depIdx, locFicha]);
  const completaDep = useMemo(() => estados && dep ? resumenEstados(estados, [{ dep }]) : null, [estados, dep]);
  const completaLoc = useMemo(() => estados && dep && locFicha !== null ? resumenEstados(estados, [{ dep, loc: cubo.loc[locFicha] }]) : null, [estados, dep, locFicha, cubo]);
  const fichaBar = useMemo(() => barrioFicha === null ? null : fichaBarrio(cuboCap, barrioFicha), [cuboCap, barrioFicha]);
  const idxBarrio = useMemo(() => new Map(cuboCap.bar.map((b, i) => [b, i] as [string, number])), [cuboCap]);
  const abrirBarrio = useCallback((b: string) => { const i = idxBarrio.get(b); if (i !== undefined) setBarrioFicha(i); }, [idxBarrio]);
  const avisoFiltro = (desde !== F0 || hasta !== F1 || mes) ? "El filtro de fecha del resumen no se aplica a la ficha." : null;
  const enFicha = vista === "localidades" || (vista === "barrios" && barrioFicha !== null);

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
      const linCruda = cuboCap.lin[r[2]];
      const lin = lineaCanonica(linCruda) ?? linCruda;
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
  if (estadoSel !== PENDIENTES && vista === "panorama") chips.push({ label: `Estado del mapa: ${nombreEstadoSel}`, clear: () => setEstadoSel(PENDIENTES) });
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
    const met = metMVis;
    const vals = (geo?.deptos ?? []).map(d => (porDepVis[d.nombre]?.[met]) || 0);
    const max = Math.max(1, ...vals);
    return { vals, max };
  }, [geo, porDepVis, metMVis]);

  const fmtLeyenda = (v: number, met: Met = metMVis) =>
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
          onClick={() => { if (vista === "panorama") { setDep(null); setEstadoSel(PENDIENTES); } setCircSel(null); setCatBarrio("todos"); aplicarAtajo("todo"); }}>Limpiar filtros</button>
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
  const nombreBarrioFicha = barrioFicha === null ? null : cuboCap.bar[barrioFicha] === "" ? BARRIO_VACIO : nombreDep(cuboCap.bar[barrioFicha]);
  const nombreLocFicha = locFicha === null ? null : nombreDep(cubo.loc[locFicha]);
  const Sep = () => <span className="bc-sep">›</span>;
  const breadcrumb = vista !== "panorama" ? (
    <nav className="breadcrumb" aria-label="Navegación">
      <button type="button" onClick={irAPanorama}>Córdoba</button>
      <Sep />
      {vista === "barrios" ? (
        barrioFicha !== null ? (
          <><button type="button" onClick={() => setBarrioFicha(null)}>Capital – Barrios</button><Sep />
            <span className="bc-current">{nombreBarrioFicha}</span></>
        ) : <span className="bc-current">Capital – Barrios</span>
      ) : (
        locFicha !== null ? (
          <><button type="button" onClick={() => setLocFicha(null)}>{nombreDep(dep!)}</button><Sep />
            <span className="bc-current">{nombreLocFicha}</span></>
        ) : <span className="bc-current">{nombreDep(dep!)}</span>
      )}
    </nav>
  ) : null;

  /* ── Volver (vistas de detalle) y título de vista (recibe el foco al navegar).
        En las fichas el foco va al nombre de la zona (ver FichaZona). ── */
  const volver = vista === "barrios" && barrioFicha !== null
    ? { txt: "Volver a los barrios de Capital", fn: () => setBarrioFicha(null) }
    : vista === "localidades" && locFicha !== null
      ? { txt: `Volver a ${nombreDep(dep!)}`, fn: () => setLocFicha(null) }
      : { txt: "Volver al resumen general", fn: irAPanorama };
  const botonVolver = vista !== "panorama" ? (
    <button type="button" className="volver" onClick={volver.fn}>
      <span aria-hidden="true">←</span> {volver.txt}
    </button>
  ) : null;
  const tituloVista = (
    <h2 className="vista-titulo" ref={tituloRef} tabIndex={-1}>
      {vista === "panorama" ? "Resumen general" : "Capital – Barrios y circuitos"}
    </h2>
  );

  /* ════════════════════════════════════════════════════════════════
     VISTA: PANORAMA
     ════════════════════════════════════════════════════════════════ */
  const vistaPanorama = (
    <>
      {/* KPIs */}
      <section className="kpis kpis-4" aria-label="Indicadores" style={{marginTop:20}}>
        <div className="kpi"><span>Créditos pendientes</span><b>{miles(tot.n)}</b><small>aprobados, sin entregar</small></div>
        <div className="kpi dest"><span>Monto total a entregar</span><b>{peso(tot.m)}</b><small>suma de montos prestables</small></div>
        <div className="kpi"><span>Monto promedio</span><b>{tot.n ? peso(tot.m/tot.n) : "—"}</b><small>por crédito</small></div>
        <div className="kpi"><span>Espera de entrega</span>
          <b className="chico">{espera && tot.m ? `${((espera.tramos[3].m / tot.m) * 100).toFixed(0)} % del monto` : "—"}</b>
          <small>{espera ? `lleva más de 180 días · promedio ${plural(espera.diasPromedio, "día", "días")}` : "\u00a0"}</small>
          {espera && tot.m > 0 && (
            <div className="espera-barra" role="img"
              aria-label={"Monto por tiempo desde la aprobación: " + espera.tramos.map(x => `${x.etiqueta.toLowerCase()}, ${((x.m / tot.m) * 100).toFixed(0)} %`).join("; ")}>
              {espera.tramos.map((x, i) => <i key={x.id} className={"e" + i} style={{ width: `${(x.m / tot.m) * 100}%` }} title={`${x.etiqueta}: ${((x.m / tot.m) * 100).toFixed(0)} % del monto`} />)}
            </div>)}
        </div>
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
      <div className="grid grid-mapa" style={{marginTop:20}}>
        {geo && (
        <section className="card">
          <header>
            <div><h2>Departamentos de Córdoba</h2><p className="sub">{verEstado ? `${nombreEstadoSel} · ` : ""}Hacé clic en un departamento para ver el detalle</p></div>
            <div className="seg" role="group" aria-label="Métrica del mapa">
              <button type="button" aria-pressed={metMVis==="m"} disabled={!conMontoVis} title={conMontoVis ? undefined : "En este estado el monto es solo lo solicitado"} onClick={() => setMetM("m")}>Monto</button>
              <button type="button" aria-pressed={metMVis==="n"} onClick={() => setMetM("n")}>Cantidad</button>
            </div>
          </header>
          {estados && (
            <div className="filtro-sel filtro-estado-mapa">
              <label htmlFor="f-estado-mapa">Estado de los créditos</label>
              <select id="f-estado-mapa" value={estadoSel} onChange={e => setEstadoSel(e.target.value)}>
                <option value={PENDIENTES}>Pendientes de entrega</option>
                <optgroup label="Solicitudes por estado (base de personas)">
                  <option value={TODAS}>Todas las solicitudes</option>
                  {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
                </optgroup>
              </select>
              {verEstado && <p className="nota">El filtro de fechas aplica solo a los pendientes de entrega.</p>}
            </div>
          )}
          <div className="chartbox" style={{position:"relative"}}>
            <svg className="mapa" viewBox={`0 0 ${geo.w} ${geo.h}`} role="img" aria-label="Mapa de departamentos de Córdoba">
              {geo.deptos.map((d, i) => {
                const c = colorMapa(mapaVals.vals[i], mapaVals.max);
                return <path key={d.nombre}
                  className={`dep${c?"":" vacio"}${dep===d.nombre?" sel":""}`}
                  d={d.d} fill={c || "#E5E7EB"}
                  tabIndex={c ? 0 : -1}
                  role={c ? "button" : undefined}
                  aria-label={c ? `${nombreDep(d.nombre)}: ${miles(porDepVis[d.nombre]?.n||0)} ${verEstado ? "solicitudes" : "créditos"}${conMontoVis ? `, ${peso(porDepVis[d.nombre]?.m||0)}` : ""}` : undefined}
                  onClick={() => { if (c) irADep(d.nombre); }}
                  onMouseMove={e => {
                    const tip = tipMRef.current;
                    const box = (e.currentTarget as SVGPathElement).closest(".chartbox") as HTMLElement;
                    if (!tip || !box) return;
                    const r = box.getBoundingClientRect();
                    const v = porDepVis[d.nombre] || { n:0, m:0 };
                    tip.style.display = "block";
                    tip.innerHTML = `<b>${nombreDep(d.nombre)}</b><div><span>${verEstado ? "Solicitudes" : "Créditos"}</span><span>${miles(v.n)}</span></div>${conMontoVis ? `<div><span>Monto</span><span>${peso(v.m)}</span></div>` : ""}`;
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
          {sinDatosVis.n > 0 && (
            <p className="nota">{miles(sinDatosVis.n)} {verEstado ? "solicitudes" : "créditos"}{conMontoVis ? ` (${peso(sinDatosVis.m)})` : ""} no tienen departamento asignado en la base y no se pintan en el mapa.</p>
          )}
        </section>
        )}

        <section className={`card${geo ? " rank-ajustado" : ""}`}>
          <header><div><h2>Ranking de departamentos</h2>
            <p className="sub">{rankingVis.length} departamentos por {metMVis==="m"?"monto":verEstado ? "cantidad de solicitudes" : "cantidad de créditos"}{verEstado ? ` · ${nombreEstadoSel}` : ""} · clic para ver detalle</p></div></header>
          <ol className="rank">
            {rankingVis.map(([k, v]) => {
              const maxR = rankingVis[0]?.[1][metMVis] || 1;
              return <li key={k} onClick={() => irADep(k)} style={{cursor:"pointer"}} role="button" tabIndex={0}>
                <span title={nombreDep(k)}>{nombreDep(k)}</span>
                <div className="bar"><i style={{width:`${v[metMVis]/maxR*100}%`}} /></div>
                <span>{metMVis==="m"?peso(v.m):miles(v.n)}</span>
              </li>;
            })}
          </ol>
        </section>
      </div>

      {/* Pendientes: por línea y espera (gráficos) */}
      {tot.n > 0 && (
        <div className="grid grid-2" style={{marginTop:20}}>
          <section className="card">
            <header><div><h2>Pendientes por línea</h2>
              <p className="sub">Monto a entregar según la línea de crédito · {fmtF(desde)} a {fmtF(hasta)}</p></div></header>
            <BarraPartes unidad="$" items={pendPorLinea.map(([l, v], i) => ({
              clave: l, etiqueta: `${nombreLinea(l)} · ${miles(v.n)} créditos`, valor: v.m, color: colorSerie(i),
            }))} />
          </section>
          {espera && (
            <section className="card">
              <header><div><h2>Espera de entrega</h2>
                <p className="sub">Créditos pendientes según el tiempo desde la aprobación</p></div></header>
              <BarrasH unidad="créditos" total={tot.n} items={espera.tramos.map((x, i) => ({
                clave: x.id, etiqueta: x.etiqueta, valor: x.n, color: ["#6da7ec", "#3987e5", "#256abf", "#0d366b"][i], detalle: peso(x.m),
              }))} />
            </section>
          )}
        </div>
      )}

      {/* Todos los estados (base de personas): lo ya entregado y el resto de las categorías */}
      {resumenPais && estados && (
        <section className="card" style={{marginTop:20}} aria-label="Todas las solicitudes por estado">
          <header><div><h2>Todas las solicitudes, por estado</h2>
            <p className="sub">{miles(resumenPais.n)} solicitudes de crédito desde el inicio del programa · incluye lo ya pagado y lo cerrado sin desembolso</p></div></header>
          <ResumenEstadosVista resumen={resumenPais} fechaDatos={estados.actualizado} tituloMeses="Solicitudes por mes de todo el programa" />
        </section>
      )}
    </>
  );

  /* ════════════════════════════════════════════════════════════════
     VISTA: LOCALIDADES (detalle de un departamento)
     ════════════════════════════════════════════════════════════════ */
  const vistaLocalidades = dep && fichaDep ? (
    locFicha !== null && fichaLoc ? (
      <FichaZona ficha={fichaLoc} titulo={nombreLocFicha!} sub={`Localidad · Departamento ${nombreDep(dep)}`}
        notas={[avisoFiltro]} actualizado={actualizado} titleRef={tituloRef} completa={completaLoc} fechaCompleta={estados?.actualizado} />
    ) : (
      <>
        <FichaZona ficha={fichaDep} titulo={nombreDep(dep)} sub={`Departamento · ${plural(zonasLoc.length, "localidad", "localidades")}`}
          notas={[avisoFiltro]} actualizado={actualizado} titleRef={tituloRef} completa={completaDep} fechaCompleta={estados?.actualizado} />

        {/* Localidades del departamento */}
        <section className="card" style={{marginTop:20}}>
          <header>
            <div><h2>Localidades de {nombreDep(dep)}</h2>
              <p className="sub">{plural(zonasLoc.length, "localidad", "localidades")} · ordenadas por cantidad de créditos · elegí una para ver su ficha</p></div>
          </header>
          <div className="tabla-detalle">
            <table>
              <thead>
                <tr>
                  <th className="th-loc">Localidad</th>
                  <th className="th-num">Créditos</th>
                  <th className="th-num">Monto</th>
                  <th className="th-num col-prom">Promedio</th>
                  <th className="th-lineas th-num">Espera promedio</th>
                </tr>
              </thead>
              <tbody>
                {zonasLoc.map(z => (
                  <tr key={z.loc}>
                    <td className="td-loc"><button type="button" className="enlace-zona" onClick={() => setLocFicha(z.loc)}>{nombreDep(z.nombre)}</button></td>
                    <td className="td-num">{miles(z.n)}</td>
                    <td className="td-num">{peso(z.m)}</td>
                    <td className="td-num col-prom">{z.n ? peso(z.m / z.n) : "—"}</td>
                    <td className="td-lineas td-num">{hoy ? plural(esperaPromedio(z, hoy), "día", "días") : "—"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="td-loc"><b>Total</b></td>
                  <td className="td-num"><b>{miles(fichaDep.n)}</b></td>
                  <td className="td-num"><b>{peso(fichaDep.m)}</b></td>
                  <td className="td-num col-prom"><b>{fichaDep.n ? peso(fichaDep.m / fichaDep.n) : "—"}</b></td>
                  <td className="td-lineas td-num"><b>{hoy ? plural(antiguedad(fichaDep.fechas, hoy).diasPromedio, "día", "días") : "—"}</b></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      </>
    )
  ) : null;

  /* ════════════════════════════════════════════════════════════════
     VISTA: BARRIOS (Capital)
     ════════════════════════════════════════════════════════════════ */
  const listaBarrios = (
    <>
      {/* KPIs de Capital */}
      <section className="kpis kpis-4" aria-label="Indicadores de Capital" style={{marginTop:20}}>
        <div className="kpi"><span>Créditos en Capital</span><b>{miles(totCapital.n)}</b></div>
        <div className="kpi dest"><span>Monto total</span><b>{peso(totCapital.m)}</b></div>
        <div className="kpi"><span>Barrios</span><b>{miles(datosBarrios.filter(x => x.bar).length)}</b></div>
        <div className="kpi">
          <span>Sin barrio (dato vacío)</span><b>{miles(sinBarrio.n)}</b>
          <small>{totCapFechas.n ? `${(100 * sinBarrio.n / totCapFechas.n).toLocaleString("es-AR", { maximumFractionDigits: 1 })} % de Capital` : "—"} · {peso(sinBarrio.m)}</small>
          <small className="kpi-acciones">
            <button type="button" className="enlace-zona" aria-pressed={catBarrio === "sin"}
              onClick={() => setCatBarrio(c => c === "sin" ? "todos" : "sin")}>{catBarrio === "sin" ? "Quitar filtro" : "Ver solo estos"}</button>
            <button type="button" className="enlace-zona" onClick={() => abrirBarrio("")}>Ver ficha de zona</button>
          </small>
        </div>
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
                  <th className="th-num col-prom">Promedio</th>
                  <th className="th-lineas">Desglose por línea</th>
                </tr>
              </thead>
              <tbody>
                {datosBarrios.map(row => (
                  <tr key={row.bar}>
                    <td className="td-loc"><button type="button" className="enlace-zona" onClick={() => abrirBarrio(row.bar)}>{row.bar ? nombreDep(row.bar) : <em className="sin-barrio">Sin barrio (dato vacío)</em>}</button></td>
                    <td className="td-num">{miles(row.n)}</td>
                    <td className="td-num">{peso(row.m)}</td>
                    <td className="td-num col-prom">{row.n ? peso(row.m / row.n) : "—"}</td>
                    <td className="td-lineas"><LineaDesglose lineasArr={row.lineasArr} /></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="td-loc"><b>Total</b></td>
                  <td className="td-num"><b>{miles(totCapital.n)}</b></td>
                  <td className="td-num"><b>{peso(totCapital.m)}</b></td>
                  <td className="td-num col-prom"><b>{totCapital.n ? peso(totCapital.m / totCapital.n) : "—"}</b></td>
                  <td className="td-lineas"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>
    </>
  );
  const vistaBarrios = barrioFicha !== null && fichaBar ? (
    <FichaZona ficha={fichaBar} titulo={nombreBarrioFicha!} sub={subBarrio(cuboCap, barrioFicha)}
      notas={[notaBarrio(cuboCap.bar[barrioFicha]), avisoFiltro]} actualizado={actualizado} titleRef={tituloRef} />
  ) : listaBarrios;

  /* ── RENDER ── */
  return (
    <>
      <div className="franja" />
      <header className="top"><div className="wrap">
        <LogoBanco />
        <div className="titulo"><h1>Banco de la Gente</h1><p>Créditos aprobados pendientes de entrega</p></div>
        <div className="actualiz">Datos actualizados el<b>{fmtF(actualizado)}</b></div>
        <form method="post" action="/api/logout" className="salir-form"><button className="salir" type="submit">Salir</button></form>
      </div></header>

      <main className="dash"><div className="wrap">
        {botonVolver}
        {!enFicha && filtrosUI}
        {breadcrumb}
        {!enFicha && tituloVista}
        {vista === "panorama" && vistaPanorama}
        {vista === "localidades" && vistaLocalidades}
        {vista === "barrios" && vistaBarrios}
      </div></main>
    </>
  );
}
