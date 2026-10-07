"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Cubo, CuboCapital } from "./Tablero";
import FichaZona, { plural } from "./FichaZona";
import { CabeceraHoja, LogoBanco, PieHoja } from "./Marca";
import { fmtF, nombreDep, peso } from "@/lib/formato";
import { BARRIO_VACIO } from "@/lib/acto";
import {
  MAX_ZONAS, fichaDeZona, listarZonas, sumarFichas, zonasSinSuperposicion, type Tipo, type Zona,
} from "@/lib/exportarFichas";

/* Exportar fichas: se tildan departamentos, localidades y/o barrios de Córdoba (con buscador) y se imprime
   una ficha por zona (más un resumen total si hay más de una) con "Guardar como PDF" del navegador.
   Solo agregados; disponible para todos los perfiles. */

const MAX_LISTA = 100;
const plano = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const mostrar = (z: Zona) => (z.tipo === "bar" && z.nombre === "" ? BARRIO_VACIO : nombreDep(z.nombre));
const TIPOS: { id: Tipo; titulo: string; buscar: string }[] = [
  { id: "dep", titulo: "Departamentos", buscar: "Buscar departamento" },
  { id: "loc", titulo: "Localidades", buscar: "Buscar localidad" },
  { id: "bar", titulo: "Barrios de Córdoba", buscar: "Buscar barrio" },
];
const subZona = (z: Zona) => z.tipo === "dep" ? "Departamento" : z.tipo === "loc" ? `Localidad · Departamento ${nombreDep(z.depto!)}` : "Barrio de Córdoba Capital";

export default function ExportarFichas({ cubo, cuboCap, actualizado }: { cubo: Cubo; cuboCap: CuboCapital; actualizado: string }) {
  const [tipo, setTipo] = useState<Tipo>("dep");
  const [busq, setBusq] = useState("");
  const [depFiltro, setDepFiltro] = useState("");
  const [sel, setSel] = useState<Map<string, Zona>>(new Map());
  const [imprimiendo, setImprimiendo] = useState(false);

  const zonas = useMemo(() => listarZonas(cubo, cuboCap), [cubo, cuboCap]);
  const deptos = useMemo(() => zonas.deps.map(z => ({ id: String(z.dep), nombre: z.nombre }))
    .sort((a, b) => nombreDep(a.nombre).localeCompare(nombreDep(b.nombre), "es")), [zonas]);

  const q = plano(busq.trim());
  const candidatos = useMemo(() => {
    const base = tipo === "dep" ? zonas.deps : tipo === "loc" ? zonas.locs : zonas.barrios;
    return base.filter(z => (tipo !== "loc" || !depFiltro || String(z.dep) === depFiltro) && (!q || plano(mostrar(z)).includes(q)));
  }, [tipo, zonas, depFiltro, q]);
  const visibles = candidatos.slice(0, MAX_LISTA);

  const elegidas = useMemo(() => [...sel.values()], [sel]);
  const excede = elegidas.length > MAX_ZONAS;
  const fichas = useMemo(() => elegidas.map(z => ({ z, ficha: fichaDeZona(z, cubo, cuboCap) })), [elegidas, cubo, cuboCap]);
  const total = useMemo(() => sumarFichas(zonasSinSuperposicion(elegidas, cubo).map(z => fichaDeZona(z, cubo, cuboCap))),
    [elegidas, cubo, cuboCap]);
  const hayRepetidas = useMemo(() => zonasSinSuperposicion(elegidas, cubo).length < elegidas.length, [elegidas, cubo]);

  const alternar = (z: Zona) => setSel(a => { const m = new Map(a); if (m.has(z.clave)) m.delete(z.clave); else m.set(z.clave, z); return m; });
  const tildarTodos = () => setSel(a => { const m = new Map(a); candidatos.forEach(z => m.set(z.clave, z)); return m; });
  const quitarTodos = () => setSel(new Map());

  // Imprimir: primero se montan las hojas, después se abre el diálogo del navegador ("Guardar como PDF").
  useEffect(() => {
    if (!imprimiendo) return;
    const tituloAntes = document.title;
    document.title = `fichas-banco-gente-${new Date().toISOString().slice(0, 10)}`;
    const fin = () => { document.title = tituloAntes; setImprimiendo(false); };
    window.addEventListener("afterprint", fin, { once: true });
    const t = setTimeout(() => window.print(), 300 + elegidas.length * 8);
    return () => { clearTimeout(t); window.removeEventListener("afterprint", fin); document.title = tituloAntes; };
  }, [imprimiendo, elegidas.length]);

  const generar = () => { if (elegidas.length && !excede) setImprimiendo(true); };
  const nombresResumen = elegidas.slice(0, 25).map(z => mostrar(z)).join(", ") + (elegidas.length > 25 ? `… y ${elegidas.length - 25} más` : "");

  return (
    <>
      <div className="solo-pantalla">
        <div className="franja" />
        <header className="top"><div className="wrap">
          <LogoBanco />
          <div className="titulo"><h1>Banco de la Gente</h1><p>Exportar fichas · créditos aprobados pendientes de entrega</p></div>
          <div className="actualiz">Datos actualizados el<b>{fmtF(actualizado)}</b></div>
          <form method="post" action="/api/logout"><button className="salir" type="submit">Salir</button></form>
        </div></header>

        <main className="dash"><div className="wrap">
          <Link href="/banco-gente" className="volver">← Volver al tablero</Link>
          <h2 className="vista-titulo">Exportar fichas</h2>
          <p className="acto-intro">
            Tildá los departamentos, localidades o barrios de Córdoba que querés incluir. Se genera una ficha por zona y, si elegiste más de una,
            una página de resumen total. En el diálogo de impresión elegí «Guardar como PDF».
          </p>

          <section className="card acto-selector" aria-label="Elegir zonas">
            <div className="seg" role="group" aria-label="Tipo de zona">
              {TIPOS.map(t => (
                <button key={t.id} type="button" aria-pressed={tipo === t.id} onClick={() => { setTipo(t.id); setBusq(""); setDepFiltro(""); }}>{t.titulo}</button>
              ))}
            </div>

            <div className="acto-buscar">
              {tipo === "loc" && (
                <div>
                  <label htmlFor="exp-dep">Departamento</label>
                  <select id="exp-dep" value={depFiltro} onChange={e => setDepFiltro(e.target.value)}>
                    <option value="">Todos los departamentos</option>
                    {deptos.map(d => <option key={d.id} value={d.id}>{nombreDep(d.nombre)}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label htmlFor="exp-busq">{TIPOS.find(t => t.id === tipo)!.buscar}</label>
                <input id="exp-busq" type="search" value={busq} autoComplete="off" onChange={e => setBusq(e.target.value)} />
              </div>
            </div>

            <div className="exportar-cols">
              <button type="button" className="limpiar" disabled={!candidatos.length} onClick={tildarTodos}>
                Tildar los {candidatos.length} resultados</button>
              <button type="button" className="limpiar" disabled={!sel.size} onClick={quitarTodos}>Quitar todo lo elegido</button>
            </div>
            <p className="nota acto-cuenta" aria-live="polite">
              {candidatos.length === 0 ? "No hay coincidencias." : `Mostrando ${visibles.length} de ${candidatos.length}.${candidatos.length > MAX_LISTA ? " Seguí escribiendo para acotar." : ""}`}
            </p>
            <ul className="exportar-zonas">
              {visibles.map(z => (
                <li key={z.clave}>
                  <label>
                    <input type="checkbox" checked={sel.has(z.clave)} onChange={() => alternar(z)} />
                    <span className="acto-zona">{mostrar(z)}{z.tipo === "loc" && <small>{nombreDep(z.depto!)}</small>}</span>
                    <span className="acto-cifras">{plural(z.n, "crédito", "créditos")} · {peso(z.m)}</span>
                  </label>
                </li>
              ))}
            </ul>
          </section>

          <section className="card" aria-label="Zonas elegidas" aria-live="polite">
            <h3 className="acto-sub">Zonas elegidas: {elegidas.length}</h3>
            {elegidas.length === 0 ? <p className="nota">Todavía no elegiste ninguna zona.</p> : (
              <>
                <ul className="exportar-chips">
                  {elegidas.map(z => (
                    <li key={z.clave}><button type="button" onClick={() => alternar(z)} aria-label={`Quitar ${mostrar(z)}`}>{mostrar(z)} ×</button></li>
                  ))}
                </ul>
                <p className="nota">
                  Total: <b>{plural(total.n, "crédito", "créditos")}</b> · <b>{peso(total.m)}</b>
                  {hayRepetidas && " (las zonas que están dentro de otra elegida se cuentan una sola vez)"}
                </p>
              </>
            )}
            {excede && <p className="nota" role="alert">Elegiste más de {MAX_ZONAS} zonas. Quitá algunas para generar el PDF.</p>}
            <button type="button" className="acto-link" disabled={!elegidas.length || excede || imprimiendo} onClick={generar}>
              {imprimiendo ? "Preparando…" : elegidas.length > 1 ? `Generar PDF (${elegidas.length} fichas + resumen)` : "Generar PDF"}
            </button>
          </section>
        </div></main>
      </div>

      {imprimiendo && (
        <div className="hojas-impresion">
          {elegidas.length > 1 && (
            <div className="hoja">
              <CabeceraHoja actualizado={fmtF(actualizado)} />
              <FichaZona ficha={total} titulo="Resumen total" id="ficha-total"
                sub={`${elegidas.length} zonas seleccionadas`}
                notas={[`Zonas incluidas: ${nombresResumen}.`, hayRepetidas && "Las zonas contenidas en otra elegida (por ejemplo, una localidad dentro de un departamento) se cuentan una sola vez."]}
                actualizado={actualizado} />
              <PieHoja />
            </div>
          )}
          {fichas.map(({ z, ficha }) => (
            <div className="hoja" key={z.clave}>
              <CabeceraHoja actualizado={fmtF(actualizado)} />
              <FichaZona ficha={ficha} titulo={mostrar(z)} sub={subZona(z)} actualizado={actualizado} id={`ficha-${z.clave.replace(/\W/g, "-")}`} />
              <PieHoja />
            </div>
          ))}
        </div>
      )}
    </>
  );
}
