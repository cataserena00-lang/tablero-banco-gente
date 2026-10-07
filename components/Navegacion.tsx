"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import logoBanco from "@/assets/marca/banco-de-la-gente.png";

/* Navegación del tablero: menú lateral colapsable en escritorio y barra inferior en celular.
   Se muestra igual en todas las pantallas de /banco-gente (ver app/banco-gente/layout.tsx).
   «Vista de personas» solo se ofrece al perfil completo; el servidor igual verifica el rol en cada solicitud. */

const ICONOS: Record<string, ReactNode> = {
  panorama: <><rect x="3" y="3" width="6" height="6" rx="1.5" /><rect x="11" y="3" width="6" height="6" rx="1.5" /><rect x="3" y="11" width="6" height="6" rx="1.5" /><rect x="11" y="11" width="6" height="6" rx="1.5" /></>,
  plan: <><rect x="3" y="4" width="14" height="13" rx="2" /><path d="M3 8h14M7 2v4M13 2v4M7 12l2 2 4-4" /></>,
  exportar: <><path d="M6 2h6l4 4v12H6z" /><path d="M12 2v4h4M9 11h5M9 14h5" /></>,
  personas: <><circle cx="8" cy="7" r="3" /><path d="M2.5 17c0-3 2.5-5 5.5-5s5.5 2 5.5 5M14 4.5a3 3 0 010 5.5M16 12c1.5.7 2.5 2.2 2.5 4.5" /></>,
  salir: <path d="M8 3H4v14h4M12 6l4 4-4 4M16 10H8" />,
  izq: <path d="M12 5l-5 5 5 5" />,
  der: <path d="M8 5l5 5-5 5" />,
};
const Icono = ({ k }: { k: keyof typeof ICONOS }) => (
  <svg className="nav-ico" viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONOS[k]}</svg>
);

interface Item { href: string; clave: keyof typeof ICONOS; texto: string; corto: string; exacto?: boolean; soloCompleto?: boolean }
const ITEMS: Item[] = [
  { href: "/banco-gente", clave: "panorama", texto: "Panorama", corto: "Panorama", exacto: true },
  { href: "/banco-gente/planificacion", clave: "plan", texto: "Planificación de entregas", corto: "Entregas" },
  { href: "/banco-gente/exportar", clave: "exportar", texto: "Exportar fichas", corto: "Exportar" },
  { href: "/banco-gente/personas", clave: "personas", texto: "Vista de personas", corto: "Personas", soloCompleto: true },
];
const CLAVE = "bg_menu_colapsado";

export default function Navegacion({ completo, usuario }: { completo: boolean; usuario: string }) {
  const ruta = usePathname() ?? "";
  const [colapsado, setColapsado] = useState(false);
  useEffect(() => { try { setColapsado(localStorage.getItem(CLAVE) === "1"); } catch { /* sin almacenamiento: queda abierto */ } }, []);
  const alternar = () => setColapsado(c => {
    try { localStorage.setItem(CLAVE, c ? "0" : "1"); } catch { /* idem */ }
    return !c;
  });
  const items = ITEMS.filter(i => !i.soloCompleto || completo);
  const activo = (i: Item) => (i.exacto ? ruta === i.href : ruta === i.href || ruta.startsWith(i.href + "/"));

  return (
    <>
      <aside className={"menu-lateral" + (colapsado ? " colapsado" : "")} aria-label="Menú principal">
        <div className="menu-marca">
          <span className="menu-logo"><img src={logoBanco.src} width={logoBanco.width} height={logoBanco.height} alt="Banco de la Gente. Aquí su palabra vale oro" /></span>
        </div>
        <nav aria-label="Secciones">
          <ul>
            {items.map(i => (
              <li key={i.href}>
                <Link href={i.href} className={"menu-item" + (activo(i) ? " activo" : "")} aria-current={activo(i) ? "page" : undefined}
                  title={colapsado ? i.texto : undefined} aria-label={i.texto}>
                  <Icono k={i.clave} /><span className="menu-texto">{i.texto}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="menu-pie">
          <form method="post" action="/api/logout">
            <button type="submit" className="menu-item" title={colapsado ? "Salir" : undefined} aria-label="Salir"><Icono k="salir" /><span className="menu-texto">Salir</span></button>
          </form>
          <p className="menu-usuario menu-texto">{usuario} · {completo ? "Perfil completo" : "Datos agregados"}</p>
          <button type="button" className="menu-colapsar" onClick={alternar} aria-expanded={!colapsado}
            aria-label={colapsado ? "Expandir el menú" : "Contraer el menú"} title={colapsado ? "Expandir el menú" : "Contraer el menú"}>
            <Icono k={colapsado ? "der" : "izq"} />
          </button>
        </div>
      </aside>

      <nav className="menu-inferior" aria-label="Secciones">
        <ul>
          {items.map(i => (
            <li key={i.href}>
              <Link href={i.href} className={activo(i) ? "activo" : ""} aria-current={activo(i) ? "page" : undefined}>
                <span className="pastilla"><Icono k={i.clave} /></span><span>{i.corto}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
