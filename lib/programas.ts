import type { Rol } from "./auth";

/* Programas del Ministerio (el tercero, de empleo, es el Programa Primer Paso; su código sigue siendo «pe», y en DASHBOARD_PROGRAMAS también vale «ppp»)
   Programas del Ministerio de Desarrollo Social y Promoción del Empleo que se ven en el tablero.
   Funciona en Edge y Node (solo lee variables de entorno).

   Quién ve qué: DASHBOARD_PROGRAMAS = "usuario:bg+cmc,otro:cmc,..." (los códigos van separados por «+»).
   - Un usuario sin entrada en la variable ve solo Banco de la Gente (así siguen los usuarios que ya existían).
   - El perfil admin ve todos los programas, siempre.
   El servidor lo verifica en cada solicitud (páginas y rutas /api): ocultar la tarjeta no alcanza. */
export type Programa = "bg" | "cmc" | "pe";

export interface InfoPrograma { id: Programa; nombre: string; ruta: string; descripcion: string; disponible: boolean }
export const PROGRAMAS: InfoPrograma[] = [
  { id: "bg", nombre: "Banco de la Gente", ruta: "/banco-gente", descripcion: "Créditos aprobados y pendientes de entrega", disponible: true },
  { id: "cmc", nombre: "Córdoba me capacita", ruta: "/cba-me-capacita", descripcion: "Cursos, capacitadores y participantes", disponible: true },
  { id: "pe", nombre: "Programa Primer Paso", ruta: "/primer-paso", descripcion: "Próximamente", disponible: false },
];
const TODOS: Programa[] = PROGRAMAS.map(p => p.id);
const POR_DEFECTO: Programa[] = ["bg"];

const esPrograma = (v: string): v is Programa => (TODOS as string[]).includes(v);

/** Programas que puede ver el usuario (admin: todos; sin entrada en DASHBOARD_PROGRAMAS: solo Banco de la Gente). */
export function programasDe(usuario: string, rol?: Rol): Programa[] {
  if (rol === "admin") return TODOS;
  for (const par of (process.env.DASHBOARD_PROGRAMAS ?? "").split(",").map(x => x.trim()).filter(Boolean)) {
    const i = par.indexOf(":");
    if (i < 0 || par.slice(0, i) !== usuario) continue;
    const lista = par.slice(i + 1).split("+").map(x => x.trim().toLowerCase()).map(x => (x === "ppp" ? "pe" : x)).filter(esPrograma);
    return lista.length ? [...new Set(lista)] : POR_DEFECTO;
  }
  return POR_DEFECTO;
}
export const puedeVerPrograma = (usuario: string, rol: Rol | undefined, programa: Programa) =>
  programasDe(usuario, rol).includes(programa);
