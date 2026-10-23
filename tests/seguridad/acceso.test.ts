import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { pbkdf2Sync, randomBytes } from "node:crypto";
import { iniciarBaseLocal } from "../../lib/auth2/dbLocal";
import { consulta } from "../../lib/auth2/db";
import { hashClave } from "../../lib/auth2/cripto";
import { codigoDelPaso, pasoActual } from "../../lib/auth2/totp";
import { confirmarAlta, secretoParaAlta, verificarSegundoFactor, verificarUsuarioYClave, normalizarCodigoRecuperacion } from "../../lib/auth2/flujo";
import { buscarPorId, buscarPorUsuario, crearUsuario, actualizarUsuario, resetear2fa } from "../../lib/auth2/usuarios";
import {
  cerrarSesion, cerrarSesionesDe, completarSesion, confiarEnDispositivo, crearSesion, dispositivoValido, leerSesionDb, quitarDispositivos,
} from "../../lib/auth2/sesiones";
import { descifrar } from "../../lib/auth2/cripto";

process.env.CLAVE_CIFRADO = randomBytes(32).toString("base64");
process.env.AUTH_SECRET = "secreto-de-prueba";
// Usuario "viejo" de las variables de Vercel (formato pbkdf2): se migra al primer ingreso correcto
const sal = randomBytes(16);
const pbkdf2 = `pbkdf2.1000.${sal.toString("hex")}.${pbkdf2Sync("clave-vieja", sal, 1000, 32, "sha256").toString("hex")}`;
process.env.DASHBOARD_USERS_EXTRA = `20111111111:${pbkdf2}|completo|Ana Prueba,completo_1:${pbkdf2}|completo|Cuenta de prueba`;
process.env.DASHBOARD_PROGRAMAS = "20111111111:bg+cmc";

let base: Awaited<ReturnType<typeof iniciarBaseLocal>>;
before(async () => { base = await iniciarBaseLocal("memoria"); });
after(async () => { await base.cerrar(); });

const nuevoUsuario = async (usuario: string, rol: "admin" | "completo" | "agregado" = "agregado") =>
  (await crearUsuario({ usuario, rol, programas: ["bg"], claveHash: await hashClave("Clave-de-prueba-1"), origen: "panel" }))!;

test("ingreso: clave correcta, incorrecta, usuario inexistente y desactivado", async () => {
  const u = await nuevoUsuario("ingreso.uno");
  assert.equal((await verificarUsuarioYClave("Ingreso.Uno", "Clave-de-prueba-1"))?.id, u.id);   // sin distinguir mayúsculas
  assert.equal(await verificarUsuarioYClave("ingreso.uno", "otra"), null);
  assert.equal(await verificarUsuarioYClave("no.existe", "Clave-de-prueba-1"), null);
  await actualizarUsuario(u.id, { activo: false });
  assert.equal(await verificarUsuarioYClave("ingreso.uno", "Clave-de-prueba-1"), null);
});

test("migración desde las variables de Vercel: perezosa, con la misma clave y obligando a cambiarla", async () => {
  assert.equal(await buscarPorUsuario("20111111111"), null);
  assert.equal(await verificarUsuarioYClave("20-11111111-1", "clave-mala"), null);
  assert.equal(await buscarPorUsuario("20111111111"), null);                       // un intento fallido no migra
  const u = await verificarUsuarioYClave("20-11111111-1", "clave-vieja");
  assert.ok(u && u.debe_cambiar_clave && u.origen === "vercel" && u.rol === "completo" && u.nombre === "Ana Prueba");
  assert.deepEqual(u.programas, ["bg", "cmc"]);
  assert.ok(u.clave_hash.startsWith("scrypt$"));                                   // ya no queda el hash viejo
  assert.equal((await verificarUsuarioYClave("20111111111", "clave-vieja"))?.id, u.id);   // después se usa la base
  assert.equal(await verificarUsuarioYClave("completo_1", "clave-vieja"), null);   // las cuentas de prueba dadas de baja no se migran
  assert.equal(await buscarPorUsuario("completo_1"), null);
});

test("sesiones: etapas, vencimiento por inactividad, vencimiento absoluto y cierre", async () => {
  const u = await nuevoUsuario("sesion.uno", "completo");
  const pendiente = await crearSesion(u.id, "clave");
  assert.equal((await leerSesionDb(pendiente.token))?.etapa, "clave");
  const t = await crearSesion(u.id, "completa");
  const s = (await leerSesionDb(t.token))!;
  assert.equal(s.etapa, "completa"); assert.equal(s.usuario, "sesion.uno"); assert.equal(s.rol, "completo");
  assert.equal(await leerSesionDb(undefined), null);
  assert.equal(await leerSesionDb("x".repeat(43)), null);                           // token inventado
  // inactividad: 3 horas sin uso
  await consulta("UPDATE sesiones SET ultima_actividad = now() - interval '3 hours' WHERE id = $1", [s.sesionId]);
  assert.equal(await leerSesionDb(t.token), null);
  // vencimiento absoluto
  const t2 = await crearSesion(u.id, "completa");
  await consulta("UPDATE sesiones SET expira = now() - interval '1 minute' WHERE usuario_id = $1 AND etapa = 'completa'", [u.id]);
  assert.equal(await leerSesionDb(t2.token), null);
  // cierre explícito, cierre de las demás y baja del usuario
  const a = await crearSesion(u.id, "completa"), b = await crearSesion(u.id, "completa");
  const sa = (await leerSesionDb(a.token))!;
  await cerrarSesionesDe(u.id, sa.sesionId);
  assert.ok(await leerSesionDb(a.token)); assert.equal(await leerSesionDb(b.token), null);
  await cerrarSesion(sa.sesionId); assert.equal(await leerSesionDb(a.token), null);
  const c = await crearSesion(u.id, "completa");
  await actualizarUsuario(u.id, { activo: false });
  assert.equal(await leerSesionDb(c.token), null);                                  // al desactivar al usuario, la sesión deja de valer al instante
  await actualizarUsuario(u.id, { activo: true });
});

test("una sesión a medias (solo clave) vence a los 15 minutos y no sirve como sesión completa", async () => {
  const u = await nuevoUsuario("sesion.dos");
  const p = await crearSesion(u.id, "clave");
  const s = (await leerSesionDb(p.token))!;
  assert.equal(s.etapa, "clave");
  await consulta("UPDATE sesiones SET expira = now() - interval '1 second' WHERE id = $1", [s.sesionId]);
  assert.equal(await leerSesionDb(p.token), null);
  const q = await crearSesion(u.id, "clave"); const sq = (await leerSesionDb(q.token))!;
  await completarSesion(sq.sesionId); assert.equal((await leerSesionDb(q.token))?.etapa, "completa");
});

test("dispositivos de confianza: atados al usuario, máximo 5, revocables", async () => {
  const u = await nuevoUsuario("disp.uno"), v = await nuevoUsuario("disp.dos");
  const d = await confiarEnDispositivo(u.id, "Navegador de prueba");
  assert.equal(await dispositivoValido(u.id, d.token), true);
  assert.equal(await dispositivoValido(v.id, d.token), false);                      // de otro usuario no sirve
  assert.equal(await dispositivoValido(u.id, "x".repeat(43)), false);
  const tokens = [d.token]; for (let i = 0; i < 6; i++) tokens.push((await confiarEnDispositivo(u.id)).token);
  const n = (await consulta<{ n: number }>("SELECT count(*)::int AS n FROM dispositivos_confiables WHERE usuario_id = $1", [u.id]))[0].n;
  assert.equal(n, 5);
  assert.equal(await dispositivoValido(u.id, tokens[0]), false);                    // el más viejo se descartó
  await consulta("UPDATE dispositivos_confiables SET expira = now() - interval '1 day' WHERE usuario_id = $1", [u.id]);
  assert.equal(await dispositivoValido(u.id, tokens[6]), false);                    // vencido
  const e = await confiarEnDispositivo(u.id); await quitarDispositivos(u.id);
  assert.equal(await dispositivoValido(u.id, e.token), false);
  const guardado = (await consulta<{ token_hash: string }>("SELECT token_hash FROM dispositivos_confiables LIMIT 1"));
  assert.ok(guardado.every(r => r.token_hash.length === 64));                       // solo se guarda el hash
});

test("segundo factor: alta, códigos, antirrepetición, recuperación de un solo uso y freno", async () => {
  const u0 = await nuevoUsuario("fa.uno", "completo");
  const secreto = await secretoParaAlta(u0);
  assert.equal(await secretoParaAlta((await buscarPorId(u0.id))!), secreto);        // recargar la pantalla no cambia el secreto
  const cifrado = (await buscarPorId(u0.id))!.totp_secreto!;
  assert.ok(!cifrado.includes(secreto) && descifrar(cifrado) === secreto);          // en la base está cifrado
  assert.equal(await confirmarAlta((await buscarPorId(u0.id))!, "000000"), null);
  const paso = pasoActual();
  const codigos = (await confirmarAlta((await buscarPorId(u0.id))!, codigoDelPaso(secreto, paso)))!;
  assert.equal(codigos.length, 10);
  const u = (await buscarPorId(u0.id))!;
  assert.equal(u.totp_confirmado, true);
  assert.equal(await verificarSegundoFactor(u, codigoDelPaso(secreto, paso)), "incorrecto");     // el código del alta ya se usó
  assert.equal(await verificarSegundoFactor(u, codigoDelPaso(secreto, paso + 1)), "ok");         // el siguiente sí
  const u2 = (await buscarPorId(u0.id))!;
  assert.equal(await verificarSegundoFactor(u2, codigoDelPaso(secreto, paso + 1)), "incorrecto"); // y tampoco se repite
  assert.equal(await verificarSegundoFactor(u2, codigos[0]), "recuperacion");
  assert.equal(await verificarSegundoFactor(u2, codigos[0].toLowerCase().replace("-", " ")), "incorrecto");   // un código de recuperación se usa una sola vez
  assert.equal(normalizarCodigoRecuperacion("ab12c-de34f"), "AB12CDE34F");
  // freno: 10 códigos incorrectos seguidos y después hay que esperar
  for (let i = 0; i < 8; i++) await verificarSegundoFactor(u2, "111111");   // con el error del código de recuperación repetido ya son 9
  assert.equal(await verificarSegundoFactor(u2, "111111"), "incorrecto");
  assert.equal(await verificarSegundoFactor(u2, codigos[1]), "bloqueado");          // aun con un código bueno, mientras dura la pausa
  await consulta("UPDATE intentos_2fa SET creado = now() - interval '1 hour' WHERE usuario_id = $1", [u.id]);
  assert.equal(await verificarSegundoFactor(u2, codigos[1]), "recuperacion");
  // reiniciar el autenticador (acción del admin): se pide el alta de nuevo
  await resetear2fa(u.id);
  const r = (await buscarPorId(u.id))!;
  assert.ok(!r.totp_confirmado && r.totp_secreto === null);
});

test("el hash de la contraseña y el secreto nunca viajan en las consultas de lista", async () => {
  const { listarUsuarios } = await import("../../lib/auth2/usuarios");
  const lista = await listarUsuarios();
  assert.ok(lista.length > 0);
  for (const f of lista) { assert.ok(!("clave_hash" in f)); assert.ok(!("totp_secreto" in f)); }
});
