/* Se muestra si la base de pendientes todavía no tiene fechas utilizables (por ejemplo, una actualización que salió vacía):
   en lugar de romper la pantalla, avisa. Los datos buenos se recuperan con la próxima actualización. */
export default function SinDatos() {
  return (
    <main className="dash"><div className="wrap">
      <h2 className="vista-titulo">Datos en actualización</h2>
      <p className="nota">Todavía no hay datos de pendientes de entrega para mostrar. Probá de nuevo en unos minutos.</p>
    </div></main>
  );
}
