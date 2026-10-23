/* Acceso v2: usuarios y sesiones en la base de Neon, con segundo factor (código del autenticador) obligatorio para todos.
   Se activa con la variable AUTH_MODO=v2 (sin ella sigue funcionando el acceso anterior, por si hay que volver atrás). */

export const modoV2 = () => process.env.AUTH_MODO === "v2";

export const COOKIE_SESION = "__Host-sesion";
export const COOKIE_DISPOSITIVO = "__Host-dispositivo";

const MIN = 60 * 1000, HORA = 60 * MIN, DIA = 24 * HORA;
export const DURACION_SESION_MS = 12 * HORA;        // vencimiento absoluto
export const INACTIVIDAD_MS = 2 * HORA;              // vencimiento por inactividad
export const PASO_PENDIENTE_MS = 15 * MIN;           // tiempo para completar clave + código después de poner la clave
export const DISPOSITIVO_MS = 30 * DIA;              // «confiar en este dispositivo»
export const MAX_DISPOSITIVOS = 5;
export const ACTUALIZAR_ACTIVIDAD_MS = MIN;          // no se escribe la actividad más de una vez por minuto

// Freno al adivinar el código del autenticador (6 dígitos): tras este número de códigos incorrectos hay que esperar unos minutos.
// No hay bloqueo por errores en la contraseña: sin el código del autenticador, la contraseña sola no da acceso.
export const MAX_ERRORES_CODIGO = 10;
export const VENTANA_ERRORES_CODIGO_MS = 15 * MIN;

export const LARGO_MINIMO_CLAVE = 12;
export const EMISOR_TOTP = "Tablero del Ministerio";

/** Usuarios de prueba que ya no existen: no se migran desde las variables de Vercel aunque sigan escritos ahí. */
export const USUARIOS_DADOS_DE_BAJA = new Set(["completo_1", "completo_2", "agregado_1", "agregado_2"]);
