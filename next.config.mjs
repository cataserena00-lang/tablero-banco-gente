/** @type {import('next').NextConfig} */
// Los PDF del servidor leen la tipografía (Poppins) y los logos del disco: se incluyen en el despliegue de esas rutas.
const PDF = [
  "./node_modules/@fontsource/poppins/files/poppins-latin-400-normal.woff",
  "./node_modules/@fontsource/poppins/files/poppins-latin-600-normal.woff",
  "./node_modules/@fontsource/poppins/files/poppins-latin-700-normal.woff",
  "./assets/marca/*.png",
];
export default {
  outputFileTracingIncludes: {
    "/**": ["./data/**/*"],
    "/api/personas/exportar": PDF,
    "/api/personas/[id]/exportar": PDF,
  },
};
