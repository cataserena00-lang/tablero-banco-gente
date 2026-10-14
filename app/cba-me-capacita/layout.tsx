import Navegacion from "@/components/Navegacion";
import { sesionActual } from "@/lib/sesion";
import { nombreDe, tieneRol } from "@/lib/auth";
import { programasDe } from "@/lib/programas";
import { redirect } from "next/navigation";

/* Marco de Córdoba me capacita (mismo menú que Banco de la Gente, con su propia marca y colores).
   Quien no tiene acceso a este programa vuelve al inicio del Ministerio; el servidor lo vuelve a verificar en cada ruta /api. */
export default async function Marco({ children }: { children: React.ReactNode }) {
  const s = await sesionActual();
  const programas = s ? programasDe(s.usuario, s.rol) : [];
  if (s && !programas.includes("cmc")) redirect("/");
  return (
    <div className="app-marco tema-cmc">
      <Navegacion completo={tieneRol(s?.rol, "completo")} admin={s?.rol === "admin"} usuario={s?.usuario ?? ""} nombre={s ? nombreDe(s.usuario) : null} programa="cmc" variosProgramas={programas.length > 1} />
      <div className="app-contenido">{children}</div>
    </div>
  );
}
