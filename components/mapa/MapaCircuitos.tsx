"use client";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import type { FeatureCollection, Geometry, Polygon } from "geojson";
import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, useMap, useMapEvents } from "react-leaflet";

/* Mapa base de calles (Leaflet + OpenStreetMap) con los circuitos como capa GeoJSON.
   Solo dibuja: los valores, colores, textos y la selección los calcula Tablero y llegan por props,
   así que cambiar filtros o Monto/Cantidad solo restila las capas (no remonta el mapa ni toca el zoom). */

export type CircuitosGeo = FeatureCollection<Geometry, { codigo: string; nombre: string }> & {
  limite?: Polygon;   // contorno exterior de la ciudad
};
export interface InfoCircuito {
  color: string | null;   // relleno de la coroplética; null = sin datos (gris)
  activo: boolean;        // tiene datos: se puede hacer clic
  tooltip: string;        // HTML del tooltip
  aria: string;           // etiqueta accesible
}
export interface Props {
  geo: CircuitosGeo;
  info: Record<string, InfoCircuito>;
  seleccionado: string | null;
  onSelect: (codigo: string) => void;
}

const TILES_URL = process.env.NEXT_PUBLIC_TILES_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATRIBUCION = process.env.NEXT_PUBLIC_TILES_ATTRIBUTION ||
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors';

// Mismos colores que app/globals.css (Leaflet necesita valores literales)
const BORDE = "#FFFFFF", PRIMARIO = "#C0183A", GRIS = "#E5E7EB", LIMITE = "#1F2937";
const OPACIDAD_RELLENO = 0.65;

type Capa = L.Polygon & { feature: { properties: { codigo: string } } };

function estilo(color: string | null, resaltado: boolean): L.PathOptions {
  return {
    fillColor: color ?? GRIS, fillOpacity: OPACIDAD_RELLENO,
    color: resaltado ? PRIMARIO : BORDE, weight: resaltado ? 2 : 1, opacity: 1,
  };
}

function calcularBounds(geo: CircuitosGeo, info: Props["info"]) {
  const todos = L.geoJSON(geo).getBounds();
  const conDatos = geo.features.filter(f => info[f.properties.codigo]?.activo);
  const ajuste = conDatos.length
    ? L.geoJSON({ type: "FeatureCollection", features: conDatos } as FeatureCollection).getBounds()
    : todos;
  return { ajuste, maximo: todos.pad(0.5) };
}

function CapaCircuitos({ geo, info, seleccionado, onSelect }: Props) {
  const map = useMap();
  const capaRef = useRef<L.GeoJSON | null>(null);
  const limiteRef = useRef<L.GeoJSON | null>(null);
  const hoverRef = useRef<string | null>(null);
  const infoRef = useRef(info);
  const selRef = useRef(seleccionado);
  const onSelectRef = useRef(onSelect);
  const frenteRef = useRef<string | null>(null);   // circuito que está al frente (reinsertar el SVG cortaría mouseout)

  // Estilo de una capa según su info, si está seleccionada o con el mouse encima
  const restilar = (capa: Capa) => {
    const cod = capa.feature.properties.codigo;
    const inf = infoRef.current[cod];
    if (!inf) return;
    capa.setStyle(estilo(inf.color, selRef.current === cod || hoverRef.current === cod));
  };

  // Aplica colores, selección, tooltips y atributos de accesibilidad a las capas existentes
  const aplicar = useRef(() => {});
  aplicar.current = () => {
    let elegida: Capa | null = null;
    capaRef.current?.eachLayer(l => {
      const capa = l as Capa;
      const cod = capa.feature.properties.codigo;
      const inf = infoRef.current[cod];
      if (!inf) return;
      const sel = selRef.current === cod;
      if (sel) elegida = capa;
      restilar(capa);
      capa.setTooltipContent(inf.tooltip);
      const el = capa.getElement();
      if (el) {
        el.setAttribute("role", inf.activo ? "button" : "img");
        el.setAttribute("aria-label", inf.aria);
        el.setAttribute("tabindex", inf.activo ? "0" : "-1");
        if (inf.activo) el.setAttribute("aria-pressed", String(sel)); else el.removeAttribute("aria-pressed");
        (el as unknown as HTMLElement).style.cursor = inf.activo ? "pointer" : "default";
      }
    });
    // El circuito elegido se trae al frente solo cuando cambia la selección
    if (frenteRef.current !== selRef.current) {
      frenteRef.current = selRef.current;
      (elegida as Capa | null)?.bringToFront();
      limiteRef.current?.bringToFront();
    }
  };

  // Crea las capas una sola vez
  useEffect(() => {
    const capa = L.geoJSON(geo, {
      style: () => estilo(null, false),
      onEachFeature: (f, layer) => {
        const cod = f.properties.codigo;
        layer.bindTooltip(infoRef.current[cod]?.tooltip ?? "", { sticky: true, className: "tip-circ", opacity: 1 });
        layer.on({
          click: () => { if (infoRef.current[cod]?.activo) onSelectRef.current(cod); },
          mouseover: () => { hoverRef.current = cod; restilar(layer as Capa); },
          mouseout: () => { hoverRef.current = null; restilar(layer as Capa); },
        });
      },
    }).addTo(map);
    capa.eachLayer(l => {
      const cod = (l as Capa).feature.properties.codigo;
      (l as Capa).getElement()?.addEventListener("keydown", e => {
        const k = (e as KeyboardEvent).key;
        if ((k === "Enter" || k === " ") && infoRef.current[cod]?.activo) { e.preventDefault(); onSelectRef.current(cod); }
      });
    });
    capaRef.current = capa;
    if (geo.limite) {
      limiteRef.current = L.geoJSON(geo.limite, {
        style: { color: LIMITE, weight: 1.75, fill: false, lineJoin: "round" }, interactive: false,
      }).addTo(map);
    }
    frenteRef.current = null;
    aplicar.current();
    return () => { capa.remove(); limiteRef.current?.remove(); capaRef.current = null; limiteRef.current = null; };
  }, [map, geo]);

  // Cambian valores o selección: solo se restila
  useEffect(() => {
    infoRef.current = info; selRef.current = seleccionado; onSelectRef.current = onSelect;
    aplicar.current();
  }, [info, seleccionado, onSelect]);

  return null;
}

/* La rueda del mouse no hace zoom hasta hacer clic en el mapa (para no atrapar el scroll de la página) */
function ControlRueda() {
  const map = useMap();
  useMapEvents({ click: () => map.scrollWheelZoom.enable() });
  useEffect(() => {
    const el = map.getContainer();
    const apagar = () => map.scrollWheelZoom.disable();
    el.addEventListener("mouseleave", apagar);
    return () => el.removeEventListener("mouseleave", apagar);
  }, [map]);
  return null;
}

export default function MapaCircuitos(props: Props) {
  const [{ ajuste, maximo }] = useState(() => calcularBounds(props.geo, props.info));
  // En pantallas táctiles un dedo mueve la página y dos dedos mueven/hacen zoom en el mapa
  const [tactil] = useState(() => window.matchMedia("(pointer: coarse)").matches);
  const [sinMapaBase, setSinMapaBase] = useState(false);
  const errores = useRef(0);
  const cargo = useRef(false);

  return (
    <div className="mapa-leaflet-wrap" role="group" aria-label="Mapa de circuitos de Córdoba Capital">
      <MapContainer
        bounds={ajuste} boundsOptions={{ padding: [12, 12] }}
        maxBounds={maximo} maxBoundsViscosity={0.9}
        minZoom={9} maxZoom={18} zoomSnap={0.25}   // zoomSnap fraccionario: la ciudad ocupa el mapa al abrir
        scrollWheelZoom={false} dragging={!tactil}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          url={TILES_URL} attribution={ATRIBUCION} maxZoom={19}
          eventHandlers={{
            tileload: () => { cargo.current = true; errores.current = 0; setSinMapaBase(false); },
            tileerror: () => { errores.current += 1; if (!cargo.current && errores.current >= 3) setSinMapaBase(true); },
          }}
        />
        <CapaCircuitos {...props} />
        <ControlRueda />
      </MapContainer>
      {sinMapaBase && (
        <div className="mapa-aviso" role="status">
          No se pudo cargar el mapa de calles. Los circuitos se siguen mostrando y la tabla de barrios funciona igual.
        </div>
      )}
    </div>
  );
}
