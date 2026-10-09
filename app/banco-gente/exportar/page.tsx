import { cargar, cargarOpcional } from "@/lib/datos";
import type { DatosEstados } from "@/lib/estadosAgregados";
import ExportarFichas from "@/components/ExportarFichas";
import type { Cubo, CuboCapital } from "@/components/Tablero";

export const metadata = { title: "Banco de la Gente – Exportar fichas" };

export default function Pagina() {
  const d = "banco_gente";
  return (
    <ExportarFichas
      cubo={cargar<Cubo>(d, "cubo")}
      cuboCap={cargar<CuboCapital>(d, "cubo_capital")}
      estados={cargarOpcional<DatosEstados>(d, "estados")}
      actualizado={cargar<{ actualizado: string }>(d, "meta").actualizado}
    />
  );
}
