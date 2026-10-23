// Se ejecuta una vez al arrancar el servidor. Solo en desarrollo local con AUTH_PGLITE_DIR levanta la base en memoria del acceso v2.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.AUTH_PGLITE_DIR && !process.env.VERCEL) {
    const { iniciarBaseLocal } = await import("./lib/auth2/dbLocal");
    await iniciarBaseLocal(process.env.AUTH_PGLITE_DIR);
  }
}
