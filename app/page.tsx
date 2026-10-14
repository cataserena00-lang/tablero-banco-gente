import Link from "next/link";
import { redirect } from "next/navigation";
import { cargarOpcional } from "@/lib/datos";
import { sesionActual } from "@/lib/sesion";
import { nombreDe } from "@/lib/auth";
import { PROGRAMAS, programasDe, type Programa } from "@/lib/programas";
import { LogoCmc, LogoBanco, LogoMinisterio, LogoPrimerPaso } from "@/components/Marca";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ministerio de Desarrollo Social y Promoción del Empleo" };

const LOGOS: Record<Programa, React.ReactNode> = {
  bg: <LogoBanco />,
  cmc: <LogoCmc />,
  pe: <LogoPrimerPaso />,
};
const CARPETAS: Partial<Record<Programa, string>> = { bg: "banco_gente", cmc: "cba_me_capacita" };

// Inicio del Ministerio: cada persona ve las tarjetas de los programas a los que tiene acceso (lib/programas.ts).
// Con un solo programa se va directo a ese tablero.
export default async function Inicio() {
  const s = await sesionActual();
  if (!s) redirect("/login");
  const visibles = PROGRAMAS.filter(p => programasDe(s.usuario, s.rol).includes(p.id));
  const activos = visibles.filter(p => p.disponible);
  if (activos.length === 1 && visibles.length === 1) redirect(activos[0].ruta);
  const nombre = nombreDe(s.usuario);
  return (
    <main className="wrap inicio-min">
      <header className="inicio-cab">
        <LogoMinisterio />
        <form method="post" action="/api/logout"><button className="salir" type="submit">Salir</button></form>
      </header>
      <section className="inicio-saludo">
        <p>{nombre ? <>Bienvenido/a, <b>{nombre}</b></> : "Bienvenido/a"}</p>
        <h1>Tableros de gestión</h1>
        <p className="sub">Elegí el programa que querés consultar.</p>
      </section>
      <div className="prog-grid">
        {visibles.map(p => {
          const carpeta = CARPETAS[p.id];
          const meta = carpeta ? cargarOpcional<{ actualizado: string }>(carpeta, "meta") : null;
          const cuerpo = (
            <>
              <div className="prog-logo">{LOGOS[p.id]}</div>
              <h2>{p.nombre}</h2>
              <p>{p.descripcion}</p>
              {meta?.actualizado && <small>Actualizado: {new Date(meta.actualizado).toLocaleDateString("es-AR")}</small>}
            </>
          );
          return p.disponible
            ? <Link key={p.id} href={p.ruta} className={`card prog-card prog-${p.id}`}>{cuerpo}</Link>
            : <div key={p.id} className={`card prog-card prog-${p.id} prog-pronto`} aria-disabled="true">{cuerpo}</div>;
        })}
        {s.rol === "admin" && (
          <Link href="/actividad" className="card prog-card prog-admin">
            <div className="prog-logo"><span className="prog-sin-logo">Administración</span></div>
            <h2>Actividad de usuarios</h2>
            <p>Ingresos, búsquedas y exportables de cada usuario en todos los programas. Solo lo ves vos.</p>
          </Link>
        )}
      </div>
    </main>
  );
}
