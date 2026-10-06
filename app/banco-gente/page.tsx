import { cargar } from "@/lib/datos";
import Tablero from "@/components/Tablero";
import type { Cubo, CuboCapital, CircuitosGeo, GeoData } from "@/components/Tablero";

export const metadata = { title: "Banco de la Gente – Pendientes de entrega" };

// Los mapas (deptos_paths / circuitos_paths) son assets estáticos que copia el pipeline; si faltan, el tablero se muestra sin ellos.
function cargarGeo<T>(d: string, archivo: string): T | null {
  try { return cargar<T>(d, archivo); } catch { return null; }
}

export default function Pagina() {
  const d = "banco_gente";
  return (
    <Tablero
      cubo={cargar<Cubo>(d, "cubo")}
      cuboCap={cargar<CuboCapital>(d, "cubo_capital")}
      geo={cargarGeo<GeoData>(d, "deptos_paths")}
      circ={cargarGeo<CircuitosGeo>(d, "circuitos_paths")}
      actualizado={cargar<{ actualizado: string }>(d, "meta").actualizado}
    />
  );
}
