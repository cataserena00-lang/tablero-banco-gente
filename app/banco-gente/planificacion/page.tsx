import { cargar } from "@/lib/datos";
import { exigirRol } from "@/lib/sesion";
import PlanificacionEntregas from "@/components/PlanificacionEntregas";
import type { Cubo, CuboCapital } from "@/components/Tablero";

export const metadata = { title: "Banco de la Gente – Planificación de entregas" };

export default async function Pagina() {
  const d = "banco_gente";
  const completo = (await exigirRol("completo")) !== null;
  return (
    <PlanificacionEntregas
      cubo={cargar<Cubo>(d, "cubo")}
      cuboCap={cargar<CuboCapital>(d, "cubo_capital")}
      actualizado={cargar<{ actualizado: string }>(d, "meta").actualizado}
      completo={completo}
    />
  );
}
