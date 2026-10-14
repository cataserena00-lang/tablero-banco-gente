import SinDatos from "@/components/SinDatos";
import ExportarCmc from "@/components/cmc/ExportarCmc";
import { cargarOpcional } from "@/lib/datos";
import { sesionActual } from "@/lib/sesion";
import { tieneRol } from "@/lib/auth";
import type { DatosCmc } from "@/lib/cmc";

export const metadata = { title: "Córdoba me capacita – Exportar" };
export const dynamic = "force-dynamic";

export default async function Pagina() {
  const datos = cargarOpcional<DatosCmc>("cba_me_capacita", "cursos");
  if (!datos || !datos.cursos.length) return <SinDatos />;
  return <ExportarCmc datos={datos} verPersonas={tieneRol((await sesionActual())?.rol, "completo")} />;
}
