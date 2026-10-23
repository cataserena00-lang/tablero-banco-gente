import { LARGO_MINIMO_CLAVE } from "./config";

/* Reglas de la contraseña: mínimo 12 caracteres y que no sea una de las más comunes ni se parezca al usuario. */

const COMUNES = new Set(`123456789012 1234567890123 password123 password1234 contraseña123 contrasenia123 contraseña1234 qwertyuiopas qwertyuiop12 abcdefghijkl
administrador administrador1 administrador123 bienvenido123 bienvenida123 cordoba12345 cordoba123456 cordoba2024 cordoba2025 cordoba2026 cordoba2027
bancodelagente bancodelagente1 bancodelagente123 bancodelagente2025 bancodelagente2026 cbamecapacita cbamecapacita1 cbamecapacita2026 ministerio123
ministerio1234 ministerio2025 ministerio2026 desarrollosocial desarrollosocial1 desarrollosocial123 promocionempleo tablero12345 tablero123456
tablero2026 tablero2025 passwordpassword passw0rd12345 p4ssw0rd1234 qwerty123456 qwertyuiop123 asdfghjkl123 asdfghjklñ12 zxcvbnm12345 iloveyou1234
changeme1234 changeme12345 welcome12345 letmein12345 admin1234567 admin12345678 administrator1 contrasenia1234 clave1234567 clave12345678 clave123456789
mipassword123 micontraseña1 micontrasena1 argentina1234 argentina2026 argentina12345 boca12345678 riverplate123 independiente1 talleres12345 belgrano12345
futbol1234567 123456123456 111111111111 000000000000 abc123abc123 1q2w3e4r5t6y 1qaz2wsx3edc q1w2e3r4t5y6 qazwsxedcrfv 1234qwer1234 123123123123 654321654321`.split(/\s+/));

/** Devuelve el motivo por el que la clave no sirve, o null si está bien. */
export function revisarClave(clave: string, usuario: string): string | null {
  if (clave.length < LARGO_MINIMO_CLAVE) return `Tiene que tener al menos ${LARGO_MINIMO_CLAVE} caracteres.`;
  if (clave.length > 128) return "Es demasiado larga (máximo 128 caracteres).";
  const plano = clave.toLowerCase().normalize("NFKD").replace(/\p{M}/gu, "");
  if (COMUNES.has(clave.toLowerCase()) || COMUNES.has(plano)) return "Es una contraseña muy común. Elegí otra.";
  if (new Set(clave).size < 5) return "Tiene muy pocos caracteres distintos. Elegí otra.";
  if (/^\d+$/.test(clave)) return "No puede ser solo números. Sumale letras.";
  const u = usuario.toLowerCase().replace(/\D/g, "") || usuario.toLowerCase();
  if (u.length >= 6 && plano.includes(u)) return "No puede contener tu usuario o tu CUIL.";
  return null;
}

/** Contraseña temporal para un usuario nuevo: legible, sin caracteres que se confundan. */
export function claveTemporal(): string {
  const A = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const b = crypto.getRandomValues(new Uint8Array(16));
  let s = ""; for (const x of b) s += A[x % A.length];
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}`;
}
