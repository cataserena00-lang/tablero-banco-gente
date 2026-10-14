import Navegacion from "@/components/Navegacion";
import { sesionActual } from "@/lib/sesion";
import { nombreDe, tieneRol } from "@/lib/auth";
import { programasDe } from "@/lib/programas";
import { redirect } from "next/navigation";

/* Marco común de todas las pantallas del tablero: menú lateral (escritorio) o barra inferior (celular).
   El rol sale de la sesión firmada, en el servidor. */
export default async function Marco({ children }: { children: React.ReactNode }) {
  const s = await sesionActual();
  const programas = s ? programasDe(s.usuario, s.rol) : [];
  if (s && !programas.includes("bg")) redirect("/");   // sin acceso a este programa: al inicio del Ministerio
  return (
    <div className="app-marco">
      <Navegacion completo={tieneRol(s?.rol, "completo")} admin={s?.rol === "admin"} usuario={s?.usuario ?? ""} nombre={s ? nombreDe(s.usuario) : null} programa="bg" variosProgramas={programas.length > 1} />
      <div className="app-contenido">{children}</div>
    </div>
  );
}
