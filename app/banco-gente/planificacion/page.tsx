import { cargar, cargarOpcional } from "@/lib/datos";
import { sesionActual } from "@/lib/sesion";
import { tieneRol } from "@/lib/auth";
import type { DatosEstados } from "@/lib/estadosAgregados";
import PlanificacionEntregas from "@/components/PlanificacionEntregas";
import type { Cubo, CuboCapital } from "@/components/Tablero";

export const metadata = { title: "Banco de la Gente – Planificación de entregas" };

export default async function Pagina() {
  const d = "banco_gente";
  const verPersonas = tieneRol((await sesionActual())?.rol, "completo");   // el listado de personas solo se ofrece al perfil completo
  return (
    <PlanificacionEntregas
      cubo={cargar<Cubo>(d, "cubo")}
      cuboCap={cargar<CuboCapital>(d, "cubo_capital")}
      estados={cargarOpcional<DatosEstados>(d, "estados")}
      verPersonas={verPersonas}
      actualizado={cargar<{ actualizado: string }>(d, "meta").actualizado}
    />
  );
}
