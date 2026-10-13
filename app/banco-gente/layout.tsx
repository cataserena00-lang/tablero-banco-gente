import Navegacion from "@/components/Navegacion";
import { sesionActual } from "@/lib/sesion";
import { nombreDe, tieneRol } from "@/lib/auth";

/* Marco común de todas las pantallas del tablero: menú lateral (escritorio) o barra inferior (celular).
   El rol sale de la sesión firmada, en el servidor. */
export default async function Marco({ children }: { children: React.ReactNode }) {
  const s = await sesionActual();
  return (
    <div className="app-marco">
      <Navegacion completo={tieneRol(s?.rol, "completo")} admin={s?.rol === "admin"} usuario={s?.usuario ?? ""} nombre={s ? nombreDe(s.usuario) : null} />
      <div className="app-contenido">{children}</div>
    </div>
  );
}
