import { LogoBanco } from "@/components/Marca";
import Actividad from "@/components/Actividad";
import { exigirRol } from "@/lib/sesion";
import { baseConfigurada } from "@/lib/personas";

export const metadata = { title: "Banco de la Gente – Actividad de usuarios" };
export const dynamic = "force-dynamic";

// Solo el perfil admin. El rol se verifica en el servidor; si no corresponde, ni siquiera se envía la vista
// (y /api/actividad vuelve a verificarlo en cada solicitud).
export default async function Pagina() {
  const s = await exigirRol("admin");
  return (
    <>
      <div className="franja" />
      <header className="top"><div className="wrap">
        <LogoBanco />
        <div className="titulo"><h1>Banco de la Gente</h1><p>Actividad de usuarios · ingresos y exportables</p></div>
        <form method="post" action="/api/logout" className="salir-form"><button className="salir" type="submit">Salir</button></form>
      </div></header>
      <main className="dash"><div className="wrap">
        {s ? (
          <>
            <h2 className="vista-titulo">Actividad de usuarios</h2>
            {baseConfigurada()
              ? <Actividad />
              : <p className="nota">El registro de actividad vive en la base de Neon, que todavía no está conectada (falta <code>DATABASE_URL_LECTURA</code> en Vercel).</p>}
          </>
        ) : (
          <>
            <h2 className="vista-titulo">Sin acceso</h2>
            <p className="nota">Esta solapa es solo para el perfil de administración.</p>
          </>
        )}
      </div></main>
    </>
  );
}
