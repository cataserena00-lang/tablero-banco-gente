import { SALVEDAD_DATOS } from "@/lib/cmc";

/* Salvedad sobre los datos de 2025: siempre visible arriba del tablero y dentro de todos los reportes. */
export default function AvisoDatos() {
  return (
    <aside className="aviso-datos" role="note" aria-label="Aclaración sobre los datos">
      <b>{SALVEDAD_DATOS.titulo}</b>
      <p>{SALVEDAD_DATOS.texto}</p>
    </aside>
  );
}
