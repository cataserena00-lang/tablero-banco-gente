import { cargar } from "@/lib/datos";
import Tablero from "@/components/Tablero";
import type { Fila, Resumen } from "@/components/Tablero";

export const metadata = { title: "Banco de la Gente – Pendientes de entrega" };
export default function Pagina() {
  const d = "banco_gente";
  return (
    <Tablero
      resumen={cargar<Resumen>(d, "resumen")}
      departamentos={cargar<Fila[]>(d, "departamentos")}
      localidades={cargar<Fila[]>(d, "localidades")}
      barrios={cargar<Fila[]>(d, "barrios")}
      meses={cargar<Fila[]>(d, "meses")}
      actualizado={cargar<{ actualizado: string }>(d, "meta").actualizado}
    />
  );
}
