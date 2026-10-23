/* Protección CSRF para los pedidos que modifican algo: el pedido tiene que venir de esta misma página (cabecera Origin igual al host).
   Se suma a la cookie SameSite. Los pedidos sin Origin solo se aceptan si el navegador declara que son del mismo sitio. */
export function origenValido(req: Request): boolean {
  const origen = req.headers.get("origin");
  const host = req.headers.get("host");
  if (origen) {
    try { return !!host && new URL(origen).host === host; } catch { return false; }
  }
  const sitio = req.headers.get("sec-fetch-site");
  return sitio === "same-origin" || sitio === "none";
}
