import SinDatos from "@/components/SinDatos";
import TableroCmc from "@/components/cmc/TableroCmc";
import type { GeoData } from "@/components/Tablero";
import { cargar, cargarOpcional } from "@/lib/datos";
import { sesionActual } from "@/lib/sesion";
import { tieneRol } from "@/lib/auth";
import type { DatosCmc } from "@/lib/cmc";

export const metadata = { title: "Córdoba me capacita – Cursos y participantes" };
export const dynamic = "force-dynamic";

export default async function Pagina() {
  const datos = cargarOpcional<DatosCmc>("cba_me_capacita", "cursos");
  if (!datos || !datos.cursos.length) return <SinDatos />;
  const verPersonas = tieneRol((await sesionActual())?.rol, "completo");
  return <TableroCmc datos={datos} geo={cargarOpcional<GeoData>("banco_gente", "deptos_paths")} verPersonas={verPersonas} />;
}
