/* Avisa al servidor que se generó un exportable en el navegador (fichas, panorama), para que quede registrado quién y qué.
   No frena la exportación si falla. Solo se envían datos de una lista cerrada (ver POST /api/actividad). */
export function avisarExportable(d: { tipo: "ficha" | "fichas" | "panorama"; zonas?: string[]; contenido?: string; cantidad?: number }) {
  try {
    fetch("/api/actividad", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d), keepalive: true }).catch(() => {});
  } catch { /* sin red: no pasa nada */ }
}
