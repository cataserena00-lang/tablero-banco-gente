// Uso: AUTH_SECRET=xxx node scripts/hash-password.mjs "clave"
import { createHmac } from "node:crypto";
const secret = process.env.AUTH_SECRET, clave = process.argv[2];
if (!secret || !clave) { console.error('Uso: AUTH_SECRET=... npm run hash -- "clave"'); process.exit(1); }
console.log(createHmac("sha256", secret).update(clave).digest("hex"));
