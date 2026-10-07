import Navegacion from "@/components/Navegacion";
import { sesionActual } from "@/lib/sesion";

/* Marco común de todas las pantallas del tablero: menú lateral (escritorio) o barra inferior (celular).
   El rol sale de la sesión firmada, en el servidor. */
export default async function Marco({ children }: { children: React.ReactNode }) {
  const s = await sesionActual();
  return (
    <div className="app-marco">
      <Navegacion completo={s?.rol === "completo"} usuario={s?.usuario ?? ""} />
      <div className="app-contenido">{children}</div>
    </div>
  );
}
