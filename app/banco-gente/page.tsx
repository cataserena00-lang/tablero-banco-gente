import { cargar } from "@/lib/datos";
import Tablero from "@/components/Tablero";
import type { Cubo, CuboCapital, GeoData } from "@/components/Tablero";

export const metadata = { title: "Banco de la Gente – Pendientes de entrega" };

export default function Pagina() {
  const d = "banco_gente";
  return (
    <Tablero
      cubo={cargar<Cubo>(d, "cubo")}
      cuboCap={cargar<CuboCapital>(d, "cubo_capital")}
      geo={cargar<GeoData>(d, "deptos_paths")}
      actualizado={cargar<{ actualizado: string }>(d, "meta").actualizado}
    />
  );
}
