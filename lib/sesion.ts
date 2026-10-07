import { cookies } from "next/headers";
import { COOKIE, leerSesion, type Rol } from "./auth";

/* Sesión del usuario en el servidor (componentes de servidor y rutas /api).
   El rol sale del token firmado, nunca del navegador, y se verifica en cada solicitud.
   Todo lo nominal (nombre, domicilio, contacto, detalle del crédito) debe pedir `exigirRol("completo")`
   y servirse desde una ruta o componente de servidor: ocultarlo solo en pantalla no alcanza. */
export async function sesionActual() {
  return leerSesion((await cookies()).get(COOKIE)?.value);
}

/** Devuelve la sesión si tiene el rol pedido ("completo" incluye todo; "agregado" lo tiene cualquier usuario), o null. */
export async function exigirRol(minimo: Rol) {
  const s = await sesionActual();
  if (!s) return null;
  return minimo === "completo" && s.rol !== "completo" ? null : s;
}
