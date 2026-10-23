import Navegacion from "@/components/Navegacion";
import { sesionActual } from "@/lib/sesion";
import { tieneRol } from "@/lib/auth";
import { modoV2 } from "@/lib/auth2/config";
import { redirect } from "next/navigation";

/* Marco de Córdoba me capacita (mismo menú que Banco de la Gente, con su propia marca y colores).
   Quien no tiene acceso a este programa vuelve al inicio del Ministerio; el servidor lo vuelve a verificar en cada ruta /api. */
export default async function Marco({ children }: { children: React.ReactNode }) {
  const s = await sesionActual();
  if (!s) redirect("/login");   // el middleware ya lo filtra; esto es una segunda barrera en el servidor
  const programas = s?.programas ?? [];
  if (!programas.includes("cmc")) redirect("/");
  return (
    <div className="app-marco tema-cmc">
      <Navegacion completo={tieneRol(s?.rol, "completo")} admin={s?.rol === "admin"} usuario={s?.usuario ?? ""} nombre={s?.nombre ?? null} programa="cmc" variosProgramas={programas.length > 1} cuenta={modoV2()} />
      <div className="app-contenido">{children}</div>
    </div>
  );
}
