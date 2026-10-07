"use client";
import dynamic from "next/dynamic";
import { Component, type ReactNode } from "react";
import type { Props } from "./MapaCircuitos";

/* Leaflet toca `window`: se carga solo en el navegador (ssr:false), con un esqueleto mientras baja
   y un mensaje si falla en vez de dejar el mapa roto. */
const Mapa = dynamic(() => import("./MapaCircuitos"), {
  ssr: false,
  loading: () => (
    <div className="mapa-esqueleto" role="status" aria-live="polite">
      <span>Cargando mapa…</span>
    </div>
  ),
});

class LimiteDeError extends Component<{ children: ReactNode }, { fallo: boolean }> {
  state = { fallo: false };
  static getDerivedStateFromError() { return { fallo: true }; }
  componentDidCatch(error: unknown) { console.error("Mapa de circuitos:", error); }
  render() {
    if (!this.state.fallo) return this.props.children;
    return (
      <div className="mapa-esqueleto mapa-error" role="alert">
        <span>No se pudo cargar el mapa. La tabla de barrios sigue funcionando.</span>
        <button type="button" onClick={() => window.location.reload()}>Reintentar</button>
      </div>
    );
  }
}

export default function MapaCircuitosCarga(props: Props) {
  return <LimiteDeError><Mapa {...props} /></LimiteDeError>;
}
