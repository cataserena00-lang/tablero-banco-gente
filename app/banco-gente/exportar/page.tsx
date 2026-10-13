import SinDatos from "@/components/SinDatos";
import { cargar, cargarOpcional } from "@/lib/datos";
import type { DatosEstados } from "@/lib/estadosAgregados";
import ExportarFichas from "@/components/ExportarFichas";
import type { Cubo, CuboCapital } from "@/components/Tablero";

export const metadata = { title: "Banco de la Gente – Exportar fichas" };

export default function Pagina() {
  const d = "banco_gente";
  const cubo = cargar<Cubo>(d, "cubo");
  if (!cubo.f.length) return <SinDatos />;   // actualización que salió sin fechas: no romper la pantalla
  return (
    <ExportarFichas
      cubo={cubo}
      cuboCap={cargar<CuboCapital>(d, "cubo_capital")}
      estados={cargarOpcional<DatosEstados>(d, "estados")}
      actualizado={cargar<{ actualizado: string }>(d, "meta").actualizado}
    />
  );
}
