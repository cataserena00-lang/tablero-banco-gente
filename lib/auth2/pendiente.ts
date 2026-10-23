import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_SESION } from "./config";
import { leerSesionDb, type SesionDb } from "./sesiones";
import { buscarPorId, type Usuario } from "./usuarios";
import { proximoPaso, type PasoLogin } from "./flujo";

/** Sesión a medio camino (puso la clave, falta cambiarla o el código del autenticador). Para las pantallas /login/* y sus rutas. */
export async function sesionPendiente(): Promise<{ sesion: SesionDb; usuario: Usuario } | null> {
  const token = (await cookies()).get(COOKIE_SESION)?.value;
  const sesion = await leerSesionDb(token, false);
  if (!sesion || sesion.etapa !== "clave") return null;
  const usuario = await buscarPorId(sesion.usuarioId);
  return usuario && usuario.activo ? { sesion, usuario } : null;
}

/** Para una pantalla de /login/*: exige la sesión pendiente y que sea el paso que corresponde (si no, manda al que toca). */
export async function exigirPaso(paso: PasoLogin) {
  const p = await sesionPendiente();
  if (!p) redirect("/login");
  const siguiente = proximoPaso(p.usuario);
  if (siguiente !== paso) redirect(siguiente);
  return p;
}
