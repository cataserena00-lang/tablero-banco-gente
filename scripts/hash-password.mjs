// Uso:
//   AUTH_SECRET=xxx node scripts/hash-password.mjs "clave"           -> hash HMAC para DASHBOARD_USERS
//   node scripts/hash-password.mjs --pbkdf2 "clave"                  -> hash pbkdf2$... (no necesita AUTH_SECRET)
//                                                                       para DASHBOARD_USERS_EXTRA: usuario:pbkdf2$...
import { createHmac, pbkdf2Sync, randomBytes } from "node:crypto";
const args = process.argv.slice(2);
if (args[0] === "--pbkdf2") {
  const clave = args[1];
  if (!clave) { console.error('Uso: node scripts/hash-password.mjs --pbkdf2 "clave"'); process.exit(1); }
  const iteraciones = 100000, sal = randomBytes(16);
  console.log(`pbkdf2$${iteraciones}$${sal.toString("hex")}$${pbkdf2Sync(clave, sal, iteraciones, 32, "sha256").toString("hex")}`);
} else {
  const secret = process.env.AUTH_SECRET, clave = args[0];
  if (!secret || !clave) { console.error('Uso: AUTH_SECRET=... npm run hash -- "clave"'); process.exit(1); }
  console.log(createHmac("sha256", secret).update(clave).digest("hex"));
}
