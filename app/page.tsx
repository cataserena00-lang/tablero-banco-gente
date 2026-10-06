import Link from "next/link";
import { cargar } from "@/lib/datos";
export default function Inicio() {
  const meta = cargar<{ actualizado: string }>("banco_gente", "meta");
  return (
    <main className="wrap">
      <header><h1>Tableros</h1>
        <form method="post" action="/api/logout"><button className="sec">Salir</button></form></header>
      <div className="grid">
        <Link href="/banco-gente" className="card tile">
          <h2>Banco de la Gente</h2>
          <p>Créditos aprobados pendientes de entrega</p>
          <small>Actualizado: {new Date(meta.actualizado).toLocaleDateString("es-AR")}</small>
        </Link>
      </div>
    </main>
  );
}
