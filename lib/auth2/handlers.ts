import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_DISPOSITIVO, COOKIE_SESION } from "./config";
import { auditar } from "./auditoria";
import { hashClave } from "./cripto";
import { claveTemporal, revisarClave } from "./claves";
import { confirmarAlta, proximoPaso, verificarSegundoFactor, verificarUsuarioYClave } from "./flujo";
import { origenValido } from "./origen";
import { sesionPendiente } from "./pendiente";
import { cerrarSesion, cerrarSesionesDe, completarSesion, confiarEnDispositivo, crearSesion, dispositivoValido, leerSesionDb, quitarDispositivos } from "./sesiones";
import { cambiarClave, marcarIngreso } from "./usuarios";

/* Rutas del ingreso v2 (clave, cambio de clave, alta y verificación del autenticador, salida). Cada una:
   1) verifica que el pedido viene de esta misma página (CSRF); 2) trabaja sobre la sesión pendiente o completa de la base. */

const opcionesCookie = (maxAge: number) => ({ httpOnly: true, secure: true, sameSite: "lax" as const, path: "/", maxAge });
const ir = (req: Request, ruta: string) => NextResponse.redirect(new URL(ruta, req.url), 303);
const prohibido = () => new NextResponse("Pedido no válido", { status: 403 });
const agente = (req: Request) => req.headers.get("user-agent");

export async function loginV2(req: Request) {
  if (!origenValido(req)) return prohibido();
  const f = await req.formData();
  const tipeado = String(f.get("usuario") ?? ""), clave = String(f.get("clave") ?? "");
  let usuario;
  try { usuario = await verificarUsuarioYClave(tipeado, clave); }
  catch (e) { console.error("Error al verificar el ingreso", (e as Error)?.name, (e as Error)?.message?.slice(0, 80)); return ir(req, "/login?error=2"); }
  if (!usuario) { await auditar(tipeado.trim().slice(0, 40) || "-", null, "ingreso_fallido"); return ir(req, "/login?error=1"); }
  const jar = await cookies();
  const confiable = usuario.totp_confirmado && !usuario.debe_cambiar_clave && await dispositivoValido(usuario.id, jar.get(COOKIE_DISPOSITIVO)?.value);
  if (confiable) {
    const { token, maxAgeS } = await crearSesion(usuario.id, "completa", agente(req));
    await marcarIngreso(usuario.id);
    await auditar(usuario.usuario, usuario.rol, "ingreso", { dispositivoDeConfianza: true });
    const res = ir(req, "/"); res.cookies.set(COOKIE_SESION, token, opcionesCookie(maxAgeS)); return res;
  }
  const { token, maxAgeS } = await crearSesion(usuario.id, "clave", agente(req));
  const res = ir(req, proximoPaso(usuario));
  res.cookies.set(COOKIE_SESION, token, opcionesCookie(maxAgeS));
  return res;
}

export async function cambiarClaveInicial(req: Request) {
  if (!origenValido(req)) return prohibido();
  const p = await sesionPendiente();
  if (!p || !p.usuario.debe_cambiar_clave) return ir(req, "/login");
  const f = await req.formData();
  const nueva = String(f.get("nueva") ?? ""), repetir = String(f.get("repetir") ?? "");
  const falla = (m: string) => ir(req, "/login/cambiar-clave?m=" + encodeURIComponent(m));
  if (nueva !== repetir) return falla("Las dos contraseñas no coinciden.");
  const motivo = revisarClave(nueva, p.usuario.usuario);
  if (motivo) return falla(motivo);
  await cambiarClave(p.usuario.id, await hashClave(nueva));
  await quitarDispositivos(p.usuario.id);
  await cerrarSesionesDe(p.usuario.id, p.sesion.sesionId);
  await auditar(p.usuario.usuario, p.usuario.rol, "clave_cambiada", { inicial: true });
  return ir(req, proximoPaso({ debe_cambiar_clave: false, totp_confirmado: p.usuario.totp_confirmado }));
}

export async function configurarAutenticador(req: Request) {
  if (!origenValido(req)) return prohibido();
  const p = await sesionPendiente();
  if (!p || p.usuario.debe_cambiar_clave || p.usuario.totp_confirmado) return NextResponse.json({ ok: false, error: "sesion" }, { status: 401 });
  const cuerpo = await req.json().catch(() => ({})) as { codigo?: string };
  const codigos = await confirmarAlta(p.usuario, String(cuerpo.codigo ?? ""));
  if (!codigos) return NextResponse.json({ ok: false, error: "codigo" }, { status: 400 });
  await completarSesion(p.sesion.sesionId);
  await marcarIngreso(p.usuario.id);
  await auditar(p.usuario.usuario, p.usuario.rol, "autenticador_alta");
  await auditar(p.usuario.usuario, p.usuario.rol, "ingreso", { primerIngreso: true });
  return NextResponse.json({ ok: true, codigos }, { headers: { "Cache-Control": "no-store" } });
}

export async function verificarCodigoIngreso(req: Request) {
  if (!origenValido(req)) return prohibido();
  const p = await sesionPendiente();
  if (!p || p.usuario.debe_cambiar_clave || !p.usuario.totp_confirmado) return ir(req, "/login");
  const f = await req.formData();
  const r = await verificarSegundoFactor(p.usuario, String(f.get("codigo") ?? ""));
  if (r === "bloqueado") { await auditar(p.usuario.usuario, p.usuario.rol, "codigo_bloqueado"); return ir(req, "/login/verificar?error=2"); }
  if (r === "incorrecto") { await auditar(p.usuario.usuario, p.usuario.rol, "codigo_incorrecto"); return ir(req, "/login/verificar?error=1"); }
  await completarSesion(p.sesion.sesionId);
  await marcarIngreso(p.usuario.id);
  await auditar(p.usuario.usuario, p.usuario.rol, "ingreso", r === "recuperacion" ? { codigoDeRecuperacion: true } : null);
  const res = ir(req, r === "recuperacion" ? "/cuenta?aviso=recuperacion" : "/");
  if (f.get("confiar") === "1") {
    const d = await confiarEnDispositivo(p.usuario.id, agente(req));
    res.cookies.set(COOKIE_DISPOSITIVO, d.token, opcionesCookie(d.maxAgeS));
    await auditar(p.usuario.usuario, p.usuario.rol, "dispositivo_confiado");
  }
  return res;
}

export async function salirV2(req: Request) {
  const token = (await cookies()).get(COOKIE_SESION)?.value;
  const s = await leerSesionDb(token, false);
  if (s) { await cerrarSesion(s.sesionId); await auditar(s.usuario, s.rol, "cierre_sesion"); }
  const res = ir(req, "/login");
  res.cookies.set(COOKIE_SESION, "", opcionesCookie(0));
  return res;
}

export { claveTemporal };
