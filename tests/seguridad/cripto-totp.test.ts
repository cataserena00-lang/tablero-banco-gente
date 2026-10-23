import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { cifrar, descifrar, hashClave, verificarClave } from "../../lib/auth2/cripto";
import { codigoDelPaso, desdeBase32, base32, verificarCodigo, uriOtpauth, pasoActual } from "../../lib/auth2/totp";
import { claveTemporal, revisarClave } from "../../lib/auth2/claves";
import { origenValido } from "../../lib/auth2/origen";

process.env.CLAVE_CIFRADO = randomBytes(32).toString("base64");

test("contraseñas: scrypt, no se guardan en claro y no se confunden", async () => {
  const h = await hashClave("Una clave larga y única 2026");
  assert.match(h, /^scrypt\$131072\$8\$1\$/);
  assert.ok(!h.includes("clave larga"));
  assert.equal(await verificarClave("Una clave larga y única 2026", h), true);
  assert.equal(await verificarClave("una clave larga y única 2026", h), false);
  assert.equal(await verificarClave("x", "formato-raro"), false);
  assert.notEqual(h, await hashClave("Una clave larga y única 2026"));   // la sal cambia cada vez
});

test("cifrado de secretos: ida y vuelta, y detecta cualquier alteración", () => {
  const c = cifrar("JBSWY3DPEHPK3PXP");
  assert.ok(!c.includes("JBSWY3DP"));
  assert.equal(descifrar(c), "JBSWY3DPEHPK3PXP");
  const partes = c.split("."); partes[3] = partes[3].slice(0, -2) + (partes[3].endsWith("AA") ? "BB" : "AA");
  assert.throws(() => descifrar(partes.join(".")));
  const sinClave = process.env.CLAVE_CIFRADO; delete process.env.CLAVE_CIFRADO;
  assert.throws(() => cifrar("x"), /CLAVE_CIFRADO/);                        // sin la clave falla, no usa un valor de repuesto
  process.env.CLAVE_CIFRADO = Buffer.alloc(8).toString("base64");
  assert.throws(() => cifrar("x"), /32 bytes/);
  process.env.CLAVE_CIFRADO = sinClave;
});

test("TOTP: vectores del RFC 6238 (SHA-1) y tolerancia de ±1 paso", () => {
  const secreto = base32(Buffer.from("12345678901234567890"));
  assert.equal(codigoDelPaso(secreto, 1), "287082");                         // t = 59 s (el RFC da 94287082)
  assert.equal(codigoDelPaso(secreto, Math.floor(1111111109 / 30)), "081804"); // t = 1111111109 (08081804... → 081804)
  assert.deepEqual([...desdeBase32(base32(Buffer.from([1, 2, 3, 250])))], [1, 2, 3, 250]);
  const ahora = 1_700_000_000_000, paso = pasoActual(ahora);
  assert.equal(verificarCodigo(secreto, codigoDelPaso(secreto, paso), null, ahora), paso);
  assert.equal(verificarCodigo(secreto, codigoDelPaso(secreto, paso - 1), null, ahora), paso - 1);
  assert.equal(verificarCodigo(secreto, codigoDelPaso(secreto, paso + 1), null, ahora), paso + 1);
  assert.equal(verificarCodigo(secreto, codigoDelPaso(secreto, paso - 2), null, ahora), null);   // demasiado viejo
  assert.equal(verificarCodigo(secreto, codigoDelPaso(secreto, paso), paso, ahora), null);        // ya usado: no se repite
  assert.equal(verificarCodigo(secreto, "12345", null, ahora), null);
  assert.equal(verificarCodigo(secreto, "abcdef", null, ahora), null);
  assert.match(uriOtpauth("ABC", "ana@x", "Tablero"), /^otpauth:\/\/totp\/Tablero:ana%40x\?secret=ABC&issuer=Tablero/);
});

test("política de contraseñas", () => {
  assert.match(revisarClave("corta", "ana")!, /al menos 12/);
  assert.match(revisarClave("contraseña123", "ana")!, /común/);
  assert.match(revisarClave("aaaaaaaaaaaaaaaa", "ana")!, /pocos caracteres/);
  assert.match(revisarClave("123456789012345", "ana")!, /solo números/);
  assert.match(revisarClave("Mi-cuil-20123456789-ok", "20-12345678-9".replace(/\D/g, "").slice(0, 11))!, /usuario|CUIL/);
  assert.equal(revisarClave("Cafe-con-leche-del-lunes", "20123456789"), null);
  assert.match(claveTemporal(), /^[A-Za-z2-9]{4}(-[A-Za-z2-9]{4}){3}$/);
  assert.notEqual(claveTemporal(), claveTemporal());
});

test("CSRF: solo se aceptan pedidos del mismo sitio", () => {
  const pedido = (h: Record<string, string>) => new Request("https://tablero.example/api/x", { method: "POST", headers: h });
  assert.equal(origenValido(pedido({ origin: "https://tablero.example", host: "tablero.example" })), true);
  assert.equal(origenValido(pedido({ origin: "https://malo.example", host: "tablero.example" })), false);
  assert.equal(origenValido(pedido({ origin: "no-es-una-url", host: "tablero.example" })), false);
  assert.equal(origenValido(pedido({ host: "tablero.example", "sec-fetch-site": "same-origin" })), true);
  assert.equal(origenValido(pedido({ host: "tablero.example", "sec-fetch-site": "cross-site" })), false);
  assert.equal(origenValido(pedido({ host: "tablero.example" })), false);   // sin ninguna señal: se rechaza
});
