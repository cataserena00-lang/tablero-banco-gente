import { cargar } from "@/lib/datos";
import { exigirRol } from "@/lib/sesion";
import Tablero from "@/components/Tablero";
import type { Cubo, CuboCapital, CircuitosGeo, GeoData } from "@/components/Tablero";

export const metadata = { title: "Banco de la Gente – Pendientes de entrega" };

// Los mapas (deptos_paths.json / circuitos.geojson) son assets estáticos; si faltan, el tablero se muestra sin ellos.
function cargarGeo<T>(d: string, archivo: string, ext = "json"): T | null {
  try { return cargar<T>(d, archivo, ext); } catch { return null; }
}

export default async function Pagina() {
  const d = "banco_gente";
  const completo = (await exigirRol("completo")) !== null;
  return (
    <Tablero
      cubo={cargar<Cubo>(d, "cubo")}
      cuboCap={cargar<CuboCapital>(d, "cubo_capital")}
      geo={cargarGeo<GeoData>(d, "deptos_paths")}
      circ={cargarGeo<CircuitosGeo>(d, "circuitos", "geojson")}
      actualizado={cargar<{ actualizado: string }>(d, "meta").actualizado}
      completo={completo}
    />
  );
}
