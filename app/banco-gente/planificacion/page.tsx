import { cargar, cargarOpcional } from "@/lib/datos";
import type { DatosEstados } from "@/lib/estadosAgregados";
import PlanificacionEntregas from "@/components/PlanificacionEntregas";
import type { Cubo, CuboCapital } from "@/components/Tablero";

export const metadata = { title: "Banco de la Gente – Planificación de entregas" };

export default function Pagina() {
  const d = "banco_gente";
  return (
    <PlanificacionEntregas
      cubo={cargar<Cubo>(d, "cubo")}
      cuboCap={cargar<CuboCapital>(d, "cubo_capital")}
      estados={cargarOpcional<DatosEstados>(d, "estados")}
      actualizado={cargar<{ actualizado: string }>(d, "meta").actualizado}
    />
  );
}
