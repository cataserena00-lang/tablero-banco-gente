import Navegacion from "@/components/Navegacion";
import { sesionActual } from "@/lib/sesion";
import { tieneRol } from "@/lib/auth";
import { modoV2 } from "@/lib/auth2/config";
import { redirect } from "next/navigation";

/* Marco común de todas las pantallas del tablero: menú lateral (escritorio) o barra inferior (celular).
   El rol sale de la sesión firmada, en el servidor. */
export default async function Marco({ children }: { children: React.ReactNode }) {
  const s = await sesionActual();
  if (!s) redirect("/login");   // el middleware ya lo filtra; esto es una segunda barrera en el servidor
  const programas = s?.programas ?? [];
  if (!programas.includes("bg")) redirect("/");   // sin acceso a este programa: al inicio del Ministerio
  return (
    <div className="app-marco">
      <Navegacion completo={tieneRol(s?.rol, "completo")} admin={s?.rol === "admin"} usuario={s?.usuario ?? ""} nombre={s?.nombre ?? null} programa="bg" variosProgramas={programas.length > 1} cuenta={modoV2()} />
      <div className="app-contenido">{children}</div>
    </div>
  );
}
