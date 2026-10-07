import { cargar } from "@/lib/datos";
import ExportarFichas from "@/components/ExportarFichas";
import type { Cubo, CuboCapital } from "@/components/Tablero";

export const metadata = { title: "Banco de la Gente – Exportar fichas" };

export default function Pagina() {
  const d = "banco_gente";
  return (
    <ExportarFichas
      cubo={cargar<Cubo>(d, "cubo")}
      cuboCap={cargar<CuboCapital>(d, "cubo_capital")}
      actualizado={cargar<{ actualizado: string }>(d, "meta").actualizado}
    />
  );
}
