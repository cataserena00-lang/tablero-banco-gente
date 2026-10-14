import Link from "next/link";
import { redirect } from "next/navigation";
import Actividad from "@/components/Actividad";
import { LogoMinisterio } from "@/components/Marca";
import { exigirRol } from "@/lib/sesion";
import { baseConfigurada } from "@/lib/personas";

export const metadata = { title: "Actividad de usuarios – Ministerio de Desarrollo Social" };
export const dynamic = "force-dynamic";

// Actividad de los usuarios en todos los programas (ingresos, búsquedas y exportables). Solo el perfil admin: el rol se verifica en el servidor y,
// si no corresponde, se vuelve al inicio sin enviar la vista (y /api/actividad vuelve a verificarlo en cada solicitud).
export default async function Pagina() {
  if (!(await exigirRol("admin"))) redirect("/");
  return (
    <>
      <div className="franja" />
      <header className="top"><div className="wrap">
        <LogoMinisterio />
        <div className="titulo"><h1>Actividad de usuarios</h1><p>Ingresos, búsquedas y exportables en todos los programas</p></div>
        <Link href="/" className="salir" style={{ textDecoration: "none" }}>← Inicio</Link>
        <form method="post" action="/api/logout" className="salir-form"><button className="salir" type="submit">Salir</button></form>
      </div></header>
      <main className="dash"><div className="wrap">
        {baseConfigurada()
          ? <Actividad />
          : <p className="nota">El registro de actividad vive en la base de Neon, que todavía no está conectada (falta <code>DATABASE_URL_LECTURA</code> en Vercel).</p>}
      </div></main>
    </>
  );
}
