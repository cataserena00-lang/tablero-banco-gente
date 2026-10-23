import Link from "next/link";
import { redirect } from "next/navigation";
import AdminUsuarios from "@/components/AdminUsuarios";
import { LogoMinisterio } from "@/components/Marca";
import { modoV2 } from "@/lib/auth2/config";
import { exigirRol } from "@/lib/sesion";

export const metadata = { title: "Usuarios y seguridad – Ministerio de Desarrollo Social" };
export const dynamic = "force-dynamic";

// Administración de usuarios: SOLO perfil admin (se verifica acá y en /api/admin/*, en el servidor, en cada solicitud).
export default async function Pagina() {
  if (!(await exigirRol("admin")) || !modoV2()) redirect("/");
  return (
    <>
      <div className="franja" />
      <header className="top"><div className="wrap">
        <LogoMinisterio />
        <div className="titulo"><h1>Usuarios y seguridad</h1><p>Altas, perfiles, programas y autenticadores</p></div>
        <Link href="/" className="salir" style={{ textDecoration: "none" }}>← Inicio</Link>
        <form method="post" action="/api/logout" className="salir-form"><button className="salir" type="submit">Salir</button></form>
      </div></header>
      <main className="dash"><div className="wrap"><AdminUsuarios /></div></main>
    </>
  );
}
