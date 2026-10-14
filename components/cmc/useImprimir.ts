"use client";
import { useEffect, useState } from "react";
import { avisarExportable } from "@/lib/clienteActividad";

/* Imprimir hojas A4 como PDF: se montan las hojas (portal con .hojas-impresion), se abre el diálogo de impresión del navegador
   ("Guardar como PDF") y se limpian. Mismo mecanismo que las fichas de Banco de la Gente. */
export function useImprimir(nombreArchivo: string, zonas: string[]) {
  const [imprimiendo, setImprimiendo] = useState(false);
  useEffect(() => {
    if (!imprimiendo) return;
    const tituloAntes = document.title;
    avisarExportable({ tipo: "panorama", zonas, contenido: "cmc" });
    document.title = `${nombreArchivo}-${new Date().toISOString().slice(0, 10)}`;
    document.body.classList.add("imprimiendo-ficha");
    const fin = () => { document.title = tituloAntes; document.body.classList.remove("imprimiendo-ficha"); setImprimiendo(false); };
    window.addEventListener("afterprint", fin, { once: true });
    const t = setTimeout(() => window.print(), 400);
    return () => { clearTimeout(t); window.removeEventListener("afterprint", fin); document.title = tituloAntes; document.body.classList.remove("imprimiendo-ficha"); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imprimiendo]);
  return { imprimiendo, imprimir: () => setImprimiendo(true) };
}
