import { cookies } from "next/headers";
import { COOKIE, leerSesion, tieneRol, type Rol } from "./auth";
import { puedeVerPrograma, type Programa } from "./programas";

/* Sesión del usuario en el servidor (componentes de servidor y rutas /api).
   El rol sale del token firmado, nunca del navegador, y se verifica en cada solicitud.
   Todo lo nominal (nombre, domicilio, contacto, detalle del crédito) debe pedir `exigirRol("completo")`
   y servirse desde una ruta o componente de servidor: ocultarlo solo en pantalla no alcanza. */
export async function sesionActual() {
  return leerSesion((await cookies()).get(COOKIE)?.value);
}

/** Devuelve la sesión si tiene el rol pedido ("admin" incluye todo; "completo" incluye "agregado"), o null.
 *  Si se indica `programa`, además tiene que poder ver ese programa (ver lib/programas.ts). */
export async function exigirRol(minimo: Rol, programa?: Programa) {
  const s = await sesionActual();
  if (!s) return null;
  if (!tieneRol(s.rol, minimo)) return null;
  if (programa && !puedeVerPrograma(s.usuario, s.rol, programa)) return null;
  return s;
}
