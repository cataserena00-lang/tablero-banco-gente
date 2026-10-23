import { auditar } from "@/lib/auth2/auditoria";
import { guardia, json } from "@/lib/auth2/cuenta";
import { revisarClave } from "@/lib/auth2/claves";
import { hashClave, verificarClave } from "@/lib/auth2/cripto";
import { codigosNuevos, guardarCodigosNuevos } from "@/lib/auth2/flujo";
import { verificarCodigo } from "@/lib/auth2/totp";
import { descifrar } from "@/lib/auth2/cripto";
import { cerrarSesionesDe, listarDispositivos, quitarDispositivo, quitarDispositivos } from "@/lib/auth2/sesiones";
import { buscarPorId, cambiarClave, codigosRestantes, registrarPaso } from "@/lib/auth2/usuarios";

export const dynamic = "force-dynamic";

// Acciones de la propia persona sobre su cuenta: cambiar la contraseña, ver y quitar dispositivos de confianza, cerrar otras sesiones y pedir códigos de recuperación nuevos.
async function manejar(req: Request, { params }: { params: Promise<{ accion: string }> }) {
  const g = await guardia(req);
  if ("error" in g) return g.error;
  const { s } = g, { accion } = await params;
  const u = await buscarPorId(s.usuarioId);
  if (!u) return json({ error: "sesion" }, 401);
  const cuerpo = req.method === "POST" ? (await req.json().catch(() => ({}))) as Record<string, unknown> : {};

  if (accion === "dispositivos" && req.method === "GET") return json({ dispositivos: await listarDispositivos(u.id), codigosRestantes: await codigosRestantes(u.id) });
  if (req.method !== "POST") return json({ error: "metodo" }, 405);

  if (accion === "clave") {
    const actual = String(cuerpo.actual ?? ""), nueva = String(cuerpo.nueva ?? "");
    if (!(await verificarClave(actual, u.clave_hash))) return json({ ok: false, mensaje: "La contraseña actual no es correcta." }, 400);
    const motivo = revisarClave(nueva, u.usuario);
    if (motivo) return json({ ok: false, mensaje: motivo }, 400);
    await cambiarClave(u.id, await hashClave(nueva));
    await quitarDispositivos(u.id);
    await cerrarSesionesDe(u.id, s.sesionId);
    await auditar(u.usuario, u.rol, "clave_cambiada");
    return json({ ok: true });
  }
  if (accion === "quitar-dispositivos") {
    if (typeof cuerpo.id === "number") await quitarDispositivo(u.id, cuerpo.id); else await quitarDispositivos(u.id);
    await auditar(u.usuario, u.rol, "cuenta_dispositivos_quitados");
    return json({ ok: true });
  }
  if (accion === "cerrar-otras-sesiones") { await cerrarSesionesDe(u.id, s.sesionId); return json({ ok: true }); }
  if (accion === "codigos") {
    if (!u.totp_secreto) return json({ ok: false, mensaje: "Todavía no configuraste el autenticador." }, 400);
    const paso = verificarCodigo(descifrar(u.totp_secreto), String(cuerpo.codigo ?? ""), u.totp_ultimo_paso);
    if (paso === null) return json({ ok: false, mensaje: "El código no es correcto." }, 400);
    await registrarPaso(u.id, paso);
    const codigos = codigosNuevos();
    await guardarCodigosNuevos(u.id, codigos);
    await auditar(u.usuario, u.rol, "cuenta_codigos_nuevos");
    return json({ ok: true, codigos });
  }
  return json({ error: "accion" }, 404);
}
export { manejar as GET, manejar as POST };
