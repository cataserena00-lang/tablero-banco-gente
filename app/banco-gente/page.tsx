import { cargar } from "@/lib/datos";
import Tablero from "@/components/Tablero";
import type { Cubo, CuboCapital, GeoData } from "@/components/Tablero";

export const metadata = { title: "Banco de la Gente – Pendientes de entrega" };

// deptos_paths.json es un asset estático (pipelines/banco_gente/geo/); si falta, el tablero se muestra sin mapa.
function cargarGeo(d: string): GeoData | null {
  try { return cargar<GeoData>(d, "deptos_paths"); } catch { return null; }
}

export default function Pagina() {
  const d = "banco_gente";
  return (
    <Tablero
      cubo={cargar<Cubo>(d, "cubo")}
      cuboCap={cargar<CuboCapital>(d, "cubo_capital")}
      geo={cargarGeo(d)}
      actualizado={cargar<{ actualizado: string }>(d, "meta").actualizado}
    />
  );
}
