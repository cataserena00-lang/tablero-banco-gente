import { cargar, cargarOpcional } from "@/lib/datos";
import { sesionActual } from "@/lib/sesion";
import { tieneRol } from "@/lib/auth";
import type { DatosEstados } from "@/lib/estadosAgregados";
import Tablero from "@/components/Tablero";
import type { Cubo, CuboCapital, CircuitosGeo, GeoData } from "@/components/Tablero";

export const metadata = { title: "Banco de la Gente – Pendientes de entrega" };

// Los mapas (deptos_paths.json / circuitos.geojson) son assets estáticos; si faltan, el tablero se muestra sin ellos.
function cargarGeo<T>(d: string, archivo: string, ext = "json"): T | null {
  try { return cargar<T>(d, archivo, ext); } catch { return null; }
}

export default async function Pagina() {
  const d = "banco_gente";
  const verPersonas = tieneRol((await sesionActual())?.rol, "completo");   // el listado de personas solo se ofrece al perfil completo
  return (
    <Tablero
      cubo={cargar<Cubo>(d, "cubo")}
      cuboCap={cargar<CuboCapital>(d, "cubo_capital")}
      geo={cargarGeo<GeoData>(d, "deptos_paths")}
      circ={cargarGeo<CircuitosGeo>(d, "circuitos", "geojson")}
      estados={cargarOpcional<DatosEstados>(d, "estados")}
      verPersonas={verPersonas}
      actualizado={cargar<{ actualizado: string }>(d, "meta").actualizado}
    />
  );
}
