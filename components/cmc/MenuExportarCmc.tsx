"use client";
import Link from "next/link";
import { useState } from "react";
import { descargarExcelCmc, parametros, type AlcanceCliente } from "@/lib/clienteCmc";

/* Menú «Exportar» de cada vista de Córdoba me capacita (general, departamento o localidad), como en las fichas de Banco de la Gente:
   el resumen en PDF lo ven todos los perfiles; las bases de participantes y capacitadores (datos personales) solo el perfil completo y admin,
   y el servidor lo vuelve a verificar en cada descarga. */
export default function MenuExportarCmc({ alcance, verPersonas, onPdf, preparando }: {
  alcance: AlcanceCliente; verPersonas: boolean; onPdf: () => void; preparando: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [bajando, setBajando] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const donde = alcance.loc ? "de la localidad" : alcance.dep ? "del departamento" : "de todo Córdoba";
  const bajar = async (tipo: "participantes" | "capacitadores") => {
    setAbierto(false); setBajando(tipo); setAviso(null);
    setAviso(await descargarExcelCmc(tipo, alcance)); setBajando(null);
  };
  const q = parametros({ dep: alcance.dep, loc: alcance.loc }).toString();
  return (
    <div className="ficha-export">
      <button type="button" className="acto-link" aria-haspopup="menu" aria-expanded={abierto} disabled={preparando || !!bajando} onClick={() => setAbierto(a => !a)}>
        {preparando || bajando ? "Preparando…" : "Exportar ▾"}</button>
      {abierto && (
        <div className="ficha-export-menu" role="menu">
          <button type="button" role="menuitem" onClick={() => { setAbierto(false); onPdf(); }}>Resumen {donde} (PDF)</button>
          {verPersonas && (
            <>
              <button type="button" role="menuitem" disabled={!alcance.dep} title={alcance.dep ? undefined : "Elegí un departamento: la base de todo Córdoba es demasiado grande para un Excel"} onClick={() => bajar("participantes")}>
                Base de participantes {donde} (Excel)</button>
              <button type="button" role="menuitem" onClick={() => bajar("capacitadores")}>Base de capacitadores {donde} (Excel)</button>
              <Link role="menuitem" href={`/cba-me-capacita/participantes${q ? "?" + q : ""}`} className="menu-enlace">Ver la lista de participantes</Link>
              <Link role="menuitem" href={`/cba-me-capacita/capacitadores${q ? "?" + q : ""}`} className="menu-enlace">Ver la lista de capacitadores</Link>
            </>
          )}
        </div>
      )}
      {aviso && <p className="err" role="alert" style={{ position: "absolute", right: 0, top: "100%", width: 300, background: "#fff", padding: 8, borderRadius: 8, border: "1px solid var(--borde)", zIndex: 5 }}>{aviso}</p>}
    </div>
  );
}
