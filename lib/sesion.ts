import { cache } from "react";
import { cookies } from "next/headers";
import { COOKIE, leerSesion, nombreDe, tieneRol, type Rol } from "./auth";
import { programasDe, type Programa } from "./programas";
import { COOKIE_SESION, modoV2 } from "./auth2/config";
import { leerSesionDb } from "./auth2/sesiones";

/* Sesión del usuario en el servidor (componentes de servidor y rutas /api).
   El rol sale de la sesión verificada (con el acceso v2, de la base de datos en cada solicitud), nunca del navegador.
   Todo lo nominal (nombre, domicilio, contacto, detalle del crédito) debe pedir `exigirRol("completo")`
   y servirse desde una ruta o componente de servidor: ocultarlo solo en pantalla no alcanza. */
// Dentro de un mismo pedido (layout, página y rutas) la sesión se consulta una sola vez.
const leerDb = cache((token: string | undefined) => leerSesionDb(token));

export interface Sesion { usuario: string; rol: Rol; nombre: string | null; programas: Programa[] }

export async function sesionActual(): Promise<Sesion | null> {
  const c = await cookies();
  if (modoV2()) {
    const s = await leerDb(c.get(COOKIE_SESION)?.value);
    return s && s.etapa === "completa" ? { usuario: s.usuario, rol: s.rol, nombre: s.nombre, programas: s.rol === "admin" ? programasDe(s.usuario, "admin") : s.programas } : null;
  }
  const s = await leerSesion(c.get(COOKIE)?.value);
  return s ? { usuario: s.usuario, rol: s.rol, nombre: nombreDe(s.usuario), programas: programasDe(s.usuario, s.rol) } : null;
}

/** Devuelve la sesión si tiene el rol pedido ("admin" incluye todo; "completo" incluye "agregado"), o null.
 *  Si se indica `programa`, además tiene que poder ver ese programa (ver lib/programas.ts). */
export async function exigirRol(minimo: Rol, programa?: Programa) {
  const s = await sesionActual();
  if (!s) return null;
  if (!tieneRol(s.rol, minimo)) return null;
  if (programa && !s.programas.includes(programa)) return null;
  return s;
}
