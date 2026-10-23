import Link from "next/link";
import { redirect } from "next/navigation";
import CuentaSeguridad from "@/components/CuentaSeguridad";
import { LogoMinisterio } from "@/components/Marca";
import { sesionV2 } from "@/lib/auth2/cuenta";

export const metadata = { title: "Mi cuenta – Ministerio de Desarrollo Social" };
export const dynamic = "force-dynamic";

const PERFIL: Record<string, string> = { admin: "Administración", completo: "Perfil completo", agregado: "Datos agregados" };

export default async function Cuenta({ searchParams }: { searchParams: Promise<{ aviso?: string }> }) {
  const s = await sesionV2();
  if (!s) redirect("/");
  const { aviso } = await searchParams;
  return (
    <>
      <div className="franja" />
      <header className="top"><div className="wrap">
        <LogoMinisterio />
        <div className="titulo"><h1>Mi cuenta</h1><p>{s.nombre ?? s.usuario} · {PERFIL[s.rol]}</p></div>
        <Link href="/" className="salir" style={{ textDecoration: "none" }}>← Inicio</Link>
        <form method="post" action="/api/logout" className="salir-form"><button className="salir" type="submit">Salir</button></form>
      </div></header>
      <main className="dash"><div className="wrap">
        <CuentaSeguridad avisoRecuperacion={aviso === "recuperacion"} />
      </div></main>
    </>
  );
}
