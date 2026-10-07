"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Cubo, CuboCapital } from "./Tablero";
import FichaZona, { plural } from "./FichaZona";
import { LogoBanco } from "./Marca";
import { fmtF, miles, nombreDep, peso } from "@/lib/formato";
import {
  BARRIO_VACIO, fichaBarrio, fichaLocalidad, fichaSinAsignar, notaBarrio, subBarrio,
  urlPersonas, zonasCapital, zonasInterior, type Ficha,
} from "@/lib/acto";

type Ambito = "capital" | "interior";
type Sel = { t: "barrio"; idx: number } | { t: "loc"; dep: number; loc: number } | { t: "sin" };

const MAX_LISTA = 10;
const plano = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const nombreBarrio = (b: string) => (b === "" ? BARRIO_VACIO : nombreDep(b));

export default function PlanificacionEntregas({ cubo, cuboCap, actualizado, completo = false }: {
  cubo: Cubo; cuboCap: CuboCapital; actualizado: string;
  completo?: boolean;   // perfil completo: la ficha de una localidad ofrece ir a la vista de personas
}) {
  const [ambito, setAmbito] = useState<Ambito>("capital");
  const [busq, setBusq] = useState("");
  const [depFiltro, setDepFiltro] = useState("");
  const [sel, setSel] = useState<Sel | null>(null);
  const tituloRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => { if (sel) tituloRef.current?.focus(); }, [sel]);

  const barrios = useMemo(() => zonasCapital(cuboCap), [cuboCap]);
  const locs = useMemo(() => zonasInterior(cubo), [cubo]);
  const sinAsignar = useMemo(() => fichaSinAsignar(cubo), [cubo]);
  const deptos = useMemo(() => {
    const m = new Map<string, string>();
    for (const z of locs) m.set(String(z.dep), z.depto);
    return [...m].sort((a, b) => nombreDep(a[1]).localeCompare(nombreDep(b[1]), "es"));
  }, [locs]);

  const q = plano(busq.trim());
  const candidatos = useMemo(() => {
    if (ambito === "capital") return barrios.filter(z => !q || plano(nombreBarrio(z.nombre)).includes(q));
    return locs.filter(z => (!depFiltro || String(z.dep) === depFiltro) && (!q || plano(z.nombre).includes(q)));
  }, [ambito, barrios, locs, depFiltro, q]);
  const visibles = candidatos.slice(0, MAX_LISTA);

  const ficha: Ficha | null = useMemo(() => {
    if (!sel) return null;
    if (sel.t === "barrio") return fichaBarrio(cuboCap, sel.idx);
    if (sel.t === "loc") return fichaLocalidad(cubo, sel.dep, sel.loc);
    return sinAsignar;
  }, [sel, cubo, cuboCap, sinAsignar]);

  const encabezado = useMemo(() => {
    if (!sel) return null;
    if (sel.t === "barrio") {
      return { titulo: nombreBarrio(cuboCap.bar[sel.idx]), sub: subBarrio(cuboCap, sel.idx), nota: notaBarrio(cuboCap.bar[sel.idx]) };
    }
    if (sel.t === "loc") {
      return { titulo: nombreDep(cubo.loc[sel.loc]), sub: `Localidad · Departamento ${nombreDep(cubo.dep[sel.dep])}`, nota: null };
    }
    return {
      titulo: "Sin asignar (Capital)",
      sub: "Departamento Capital, localidad distinta de Córdoba",
      nota: "Créditos del departamento Capital que no figuran en la ciudad de Córdoba ni tienen barrio asignado. Quedan fuera de las fichas por barrio.",
    };
  }, [sel, cubo, cuboCap]);

  const cambiarAmbito = (a: Ambito) => { setAmbito(a); setBusq(""); setDepFiltro(""); setSel(null); };
  const esActual = (z: { idx: number } | { dep: number; loc: number }) =>
    !!sel && (("idx" in z && sel.t === "barrio" && sel.idx === z.idx) ||
      ("loc" in z && sel.t === "loc" && sel.dep === z.dep && sel.loc === z.loc));

  return (
    <>
      <div className="franja" />
      <header className="top"><div className="wrap">
        <LogoBanco />
        <div className="titulo"><h1>Banco de la Gente</h1><p>Planificación de entregas · créditos aprobados pendientes de entrega</p></div>
        <div className="actualiz">Datos actualizados el<b>{fmtF(actualizado)}</b></div>
        <form method="post" action="/api/logout" className="salir-form"><button className="salir" type="submit">Salir</button></form>
      </div></header>

      <main className="dash"><div className="wrap">
        <h2 className="vista-titulo">Planificación de entregas</h2>
        <p className="acto-intro">
          Elegí el barrio (Capital) o la localidad (interior) para abrir su ficha de zona: créditos pendientes de entrega, monto, líneas y antigüedad de la aprobación.
        </p>

        <section className="card acto-selector" aria-label="Elegir zona">
          <div className="seg" role="group" aria-label="Ámbito">
            <button type="button" aria-pressed={ambito === "capital"} onClick={() => cambiarAmbito("capital")}>Capital · por barrio</button>
            <button type="button" aria-pressed={ambito === "interior"} onClick={() => cambiarAmbito("interior")}>Interior · por localidad</button>
          </div>

          <div className="acto-buscar">
            {ambito === "interior" && (
              <div>
                <label htmlFor="acto-dep">Departamento</label>
                <select id="acto-dep" value={depFiltro} onChange={e => setDepFiltro(e.target.value)}>
                  <option value="">Todos los departamentos</option>
                  {deptos.map(([id, nombre]) => <option key={id} value={id}>{nombreDep(nombre)}</option>)}
                </select>
              </div>
            )}
            <div>
              <label htmlFor="acto-busq">{ambito === "capital" ? "Buscar barrio" : "Buscar localidad"}</label>
              <input id="acto-busq" type="search" value={busq} autoComplete="off" onChange={e => setBusq(e.target.value)}
                placeholder={ambito === "capital" ? "Ej.: Alta Córdoba" : "Ej.: La Calera"} />
            </div>
          </div>

          <p className="nota acto-cuenta" aria-live="polite">
            {candidatos.length === 0
              ? "No hay coincidencias."
              : `${q ? "Coincidencias" : "Con más créditos"}: ${Math.min(MAX_LISTA, candidatos.length)} de ${miles(candidatos.length)}. ${candidatos.length > MAX_LISTA ? "Seguí escribiendo para acotar." : ""}`}
          </p>

          <ul className="acto-lista">
            {visibles.map(z => {
              const clave = "idx" in z ? `b${z.idx}` : `l${z.dep}-${z.loc}`;
              const nombre = "idx" in z ? nombreBarrio(z.nombre) : nombreDep(z.nombre);
              const sub = "depto" in z && !depFiltro ? nombreDep(z.depto) : null;
              return (
                <li key={clave}>
                  <button type="button" aria-pressed={esActual(z)}
                    onClick={() => setSel("idx" in z ? { t: "barrio", idx: z.idx } : { t: "loc", dep: z.dep, loc: z.loc })}>
                    <span className="acto-zona">{nombre}{sub && <small>{sub}</small>}</span>
                    <span className="acto-cifras">{plural(z.n, "crédito", "créditos")} · {peso(z.m)}</span>
                  </button>
                </li>
              );
            })}
          </ul>

          {ambito === "capital" && sinAsignar.n > 0 && (
            <div className="acto-aparte">
              <button type="button" aria-pressed={sel?.t === "sin"} onClick={() => setSel({ t: "sin" })}>
                <span className="acto-zona">Sin asignar (Capital, otra localidad)</span>
                <span className="acto-cifras">{plural(sinAsignar.n, "crédito", "créditos")} · {peso(sinAsignar.m)}</span>
              </button>
            </div>
          )}
        </section>

        {!ficha || !encabezado ? (
          <p className="nota acto-vacio">Todavía no elegiste una zona.</p>
        ) : (
          <FichaZona ficha={ficha} titulo={encabezado.titulo} sub={encabezado.sub} notas={[encabezado.nota]}
            actualizado={actualizado} titleRef={tituloRef} id="acto-titulo"
            enlacePersonas={completo && sel?.t === "loc" ? urlPersonas(cubo.dep[sel.dep], cubo.loc[sel.loc]) : undefined} />
        )}
      </div></main>
    </>
  );
}
