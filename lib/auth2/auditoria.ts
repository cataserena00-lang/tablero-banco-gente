import { consulta } from "./db";

/* Registro de hechos de seguridad en la tabla `accesos` (la misma que lee la solapa de actividad del admin): ingresos, intentos fallidos,
   códigos incorrectos, cambios de clave, altas y bajas de usuarios. Nunca guarda claves ni códigos. No frena la operación si falla. */
export async function auditar(usuario: string, rol: string | null, accion: string, detalle?: Record<string, unknown> | null) {
  try {
    await consulta("INSERT INTO accesos (usuario, rol, accion, detalle) VALUES ($1, $2, $3, $4::jsonb)",
      [usuario.slice(0, 80), rol ?? "-", accion, JSON.stringify(detalle ?? null)]);
  } catch (e) {
    console.error("No se pudo registrar el hecho de seguridad", (e as Error)?.name);
  }
}
