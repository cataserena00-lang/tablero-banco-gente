import { auditar } from "@/lib/auth2/auditoria";
import { guardia, json } from "@/lib/auth2/cuenta";
import { cerrarSesionesDe, quitarDispositivos } from "@/lib/auth2/sesiones";
import { actualizarUsuario, buscarPorId, resetear2fa } from "@/lib/auth2/usuarios";
import type { Rol } from "@/lib/auth";
import { PROGRAMAS, type Programa } from "@/lib/programas";

export const dynamic = "force-dynamic";
const ROLES: Rol[] = ["admin", "completo", "agregado"];
const CODIGOS = PROGRAMAS.map(p => p.id) as string[];

type Ctx = { params: Promise<{ id: string }> };

// Cambios sobre un usuario: perfil, programas, nombre, activar/desactivar (PATCH) y acciones (POST): reiniciar el autenticador, cerrar sesiones, quitar dispositivos.
// Solo admin. Un admin no puede quitarse a sí mismo el perfil ni desactivarse (evita quedar sin acceso).
export async function PATCH(req: Request, { params }: Ctx) {
  const g = await guardia(req, true);
  if ("error" in g) return g.error;
  const u = await buscarPorId(Number((await params).id));
  if (!u) return json({ ok: false, mensaje: "No existe el usuario." }, 404);
  const c = await req.json().catch(() => ({})) as { nombre?: string; rol?: string; programas?: string[]; activo?: boolean };
  const esYo = u.id === g.s.usuarioId;
  const rol = ROLES.find(r => r === c.rol);
  if (esYo && ((rol && rol !== u.rol) || c.activo === false)) return json({ ok: false, mensaje: "No podés cambiarte el perfil ni desactivarte a vos mismo." }, 400);
  const programas = c.programas ? ([...new Set(c.programas.map(String).map(x => (x === "ppp" ? "pe" : x)).filter(x => CODIGOS.includes(x)))] as Programa[]) : undefined;
  await actualizarUsuario(u.id, {
    nombre: c.nombre !== undefined ? c.nombre.trim().slice(0, 80) || null : undefined, rol,
    programas: programas ? (programas.length ? programas : ["bg"]) : undefined, activo: c.activo,
  });
  if (c.activo === false || (rol && rol !== u.rol)) { await cerrarSesionesDe(u.id); await quitarDispositivos(u.id); }   // el cambio de perfil o la baja rigen de inmediato
  await auditar(g.s.usuario, g.s.rol, "admin_usuario_editado", { objetivo: u.usuario, cambios: Object.keys(c).filter(k => (c as Record<string, unknown>)[k] !== undefined) });
  return json({ ok: true });
}

export async function POST(req: Request, { params }: Ctx) {
  const g = await guardia(req, true);
  if ("error" in g) return g.error;
  const u = await buscarPorId(Number((await params).id));
  if (!u) return json({ ok: false, mensaje: "No existe el usuario." }, 404);
  const { accion } = await req.json().catch(() => ({})) as { accion?: string };
  if (accion === "reiniciar-2fa") {
    await resetear2fa(u.id); await quitarDispositivos(u.id); await cerrarSesionesDe(u.id);
    await auditar(g.s.usuario, g.s.rol, "admin_2fa_reiniciado", { objetivo: u.usuario });
  } else if (accion === "cerrar-sesiones") {
    await cerrarSesionesDe(u.id, u.id === g.s.usuarioId ? g.s.sesionId : undefined);
    await auditar(g.s.usuario, g.s.rol, "admin_sesiones_cerradas", { objetivo: u.usuario });
  } else if (accion === "quitar-dispositivos") {
    await quitarDispositivos(u.id);
    await auditar(g.s.usuario, g.s.rol, "admin_dispositivos_quitados", { objetivo: u.usuario });
  } else return json({ ok: false, mensaje: "Acción desconocida." }, 400);
  return json({ ok: true });
}
