import { redirect } from "next/navigation";

// La actividad de usuarios ya no está dentro de Banco de la Gente: vive en el inicio del Ministerio (/actividad), solo para el perfil admin.
export default function Pagina() {
  redirect("/actividad");
}
