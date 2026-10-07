import { cargar } from "@/lib/datos";
import PlanificacionEntregas from "@/components/PlanificacionEntregas";
import type { Cubo, CuboCapital } from "@/components/Tablero";

export const metadata = { title: "Banco de la Gente – Planificación de entregas" };

export default function Pagina() {
  const d = "banco_gente";
  return (
    <PlanificacionEntregas
      cubo={cargar<Cubo>(d, "cubo")}
      cuboCap={cargar<CuboCapital>(d, "cubo_capital")}
      actualizado={cargar<{ actualizado: string }>(d, "meta").actualizado}
    />
  );
}
