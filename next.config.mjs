/** @type {import('next').NextConfig} */
// Los PDF del servidor leen la tipografía (Poppins) y los logos del disco: se incluyen en el despliegue de esas rutas.
const PDF = [
  "./node_modules/@fontsource/poppins/files/poppins-latin-400-normal.woff",
  "./node_modules/@fontsource/poppins/files/poppins-latin-600-normal.woff",
  "./node_modules/@fontsource/poppins/files/poppins-latin-700-normal.woff",
  "./assets/marca/*.png",
];
// Cabeceras de seguridad básicas para todas las rutas (la CSP con nonce va aparte, en la etapa de endurecimiento del acceso).
const CABECERAS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];
export default {
  async headers() { return [{ source: "/:path*", headers: CABECERAS }]; },
  outputFileTracingIncludes: {
    "/**": ["./data/**/*"],
    "/api/personas/exportar": PDF,
    "/api/personas/[id]/exportar": PDF,
  },
};
