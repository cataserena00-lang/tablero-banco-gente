"use client";
import { useMemo, useState } from "react";
import { miles } from "@/lib/formato";

/* Gráficos livianos en SVG/HTML (sin librerías): barras horizontales, barra apilada de partes y columnas apiladas por mes.
   Colores: paleta categórica validada (orden fijo, nunca cíclico). Cada gráfico tiene leyenda o etiquetas directas,
   tooltip al pasar el mouse o enfocar, y una tabla alternativa. */

export const PALETA = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];
export const COLOR_OTROS = "#9aa3b2";
export const colorSerie = (i: number) => (i < PALETA.length ? PALETA[i] : COLOR_OTROS);

const pct = (p: number) => p.toLocaleString("es-AR", { maximumFractionDigits: 1 }) + " %";

export interface ItemBarra { clave: string; etiqueta: string; valor: number; color: string; detalle?: string }
interface Interaccion { seleccion?: string | null; onSelect?: (clave: string | null) => void }

/** Barras horizontales con la etiqueta, el valor y el porcentaje del total a la vista (sin leyenda aparte).
    Con `onSelect`, cada barra se puede tocar para filtrar los otros gráficos; tocarla de nuevo quita el filtro. */
export function BarrasH({ items, total, unidad = "créditos", seleccion, onSelect }: { items: ItemBarra[]; total?: number; unidad?: string } & Interaccion) {
  const max = Math.max(1, ...items.map(i => i.valor));
  const suma = total ?? items.reduce((a, i) => a + i.valor, 0);
  return (
    <ul className="viz-barras">
      {items.map(i => {
        const cuerpo = (
          <>
            <span className="viz-et">{i.etiqueta}</span>
            <span className="viz-pista" aria-hidden="true"><i style={{ width: `${i.valor ? Math.max(1.5, (i.valor / max) * 100) : 0}%`, background: i.color }} /></span>
            <span className="viz-val">{miles(i.valor)}<small>{suma ? pct((100 * i.valor) / suma) : ""}</small></span>
          </>
        );
        const activa = seleccion === i.clave;
        const titulo = `${i.etiqueta}: ${miles(i.valor)} ${unidad}${suma ? ` (${pct((100 * i.valor) / suma)})` : ""}${i.detalle ? ` · ${i.detalle}` : ""}`;
        return (
          <li key={i.clave} title={titulo} className={seleccion && !activa ? "viz-atenuada" : undefined}>
            {onSelect
              ? <button type="button" className={`viz-fila${activa ? " viz-activa" : ""}`} aria-pressed={activa}
                  onClick={() => onSelect(activa ? null : i.clave)}>{cuerpo}</button>
              : <div className="viz-fila">{cuerpo}</div>}
          </li>
        );
      })}
    </ul>
  );
}

/** Una sola barra dividida en partes (parte de un todo) con la leyenda debajo; también se puede tocar para filtrar. */
export function BarraPartes({ items, unidad = "créditos", seleccion, onSelect }: { items: ItemBarra[]; unidad?: string } & Interaccion) {
  const suma = items.reduce((a, i) => a + i.valor, 0);
  if (!suma) return null;
  return (
    <div className="viz-partes">
      <div className="viz-partes-barra" role={onSelect ? "group" : "img"} aria-label={items.map(i => `${i.etiqueta}: ${pct((100 * i.valor) / suma)}`).join(", ")}>
        {items.filter(i => i.valor > 0).map(i => {
          const activa = seleccion === i.clave;
          const estilo = { width: `${(100 * i.valor) / suma}%`, background: i.color, opacity: seleccion && !activa ? 0.35 : 1 };
          const titulo = `${i.etiqueta}: ${miles(i.valor)} ${unidad} (${pct((100 * i.valor) / suma)})`;
          return onSelect
            ? <button key={i.clave} type="button" style={estilo} title={titulo} aria-label={titulo} aria-pressed={activa} onClick={() => onSelect(activa ? null : i.clave)} />
            : <span key={i.clave} style={estilo} title={titulo} />;
        })}
      </div>
      <ul className="viz-leyenda">
        {items.map(i => {
          const activa = seleccion === i.clave;
          const cuerpo = (<><i style={{ background: i.color }} aria-hidden="true" /><span>{i.etiqueta}</span><b>{miles(i.valor)}</b><small>{pct((100 * i.valor) / suma)}</small></>);
          return (
            <li key={i.clave} className={seleccion && !activa ? "viz-atenuada" : undefined}>
              {onSelect
                ? <button type="button" className={`viz-fila${activa ? " viz-activa" : ""}`} aria-pressed={activa} onClick={() => onSelect(activa ? null : i.clave)}>{cuerpo}</button>
                : <div className="viz-fila">{cuerpo}</div>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export interface Serie { clave: string; etiqueta: string; color: string; idx?: number }   // idx: posición del valor en `v` (por defecto, el orden de la lista)
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const etiquetaMes = (k: string) => `${MESES[+k.slice(5, 7) - 1]} ${k.slice(2, 4)}`;

/** Columnas apiladas por mes. `datos[i].v[j]` es el valor de la serie j en el mes i. */
export function ColumnasApiladas({ meses, series, titulo, unidad = "solicitudes" }: {
  meses: { mes: string; v: number[] }[]; series: Serie[]; titulo: string; unidad?: string;
}) {
  const [foco, setFoco] = useState<number | null>(null);
  const [ocultas, setOcultas] = useState<Set<string>>(new Set());
  const W = 720, H = 240, M = { t: 10, r: 8, b: 26, l: 44 };
  const visibles = series.map((s, j) => ({ ...s, j: s.idx ?? j })).filter(s => !ocultas.has(s.clave));
  const totales = useMemo(() => meses.map(m => visibles.reduce((a, s) => a + (m.v[s.j] || 0), 0)), [meses, visibles]);
  const max = Math.max(1, ...totales);
  const paso = Math.pow(10, Math.floor(Math.log10(max)));
  const tope = Math.ceil(max / paso) * paso;
  const ancho = (W - M.l - M.r) / Math.max(1, meses.length);
  const y = (v: number) => M.t + (H - M.t - M.b) * (1 - v / tope);
  const cada = Math.ceil(meses.length / 8);

  return (
    <div className="viz-columnas">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={titulo} onMouseLeave={() => setFoco(null)}>
        {[0, 0.5, 1].map(f => (
          <g key={f}>
            <line x1={M.l} x2={W - M.r} y1={y(tope * f)} y2={y(tope * f)} className="viz-grilla" />
            <text x={M.l - 6} y={y(tope * f) + 4} textAnchor="end" className="viz-eje">{miles(tope * f)}</text>
          </g>
        ))}
        {meses.map((m, i) => {
          let acum = 0;
          const x = M.l + i * ancho;
          return (
            <g key={m.mes}>
              {visibles.map(s => {
                const v = m.v[s.j] || 0;
                if (!v) return null;
                const y0 = y(acum), y1 = y(acum + v);
                acum += v;
                return <rect key={s.clave} x={x + ancho * 0.14} width={ancho * 0.72} y={y1} height={Math.max(0, y0 - y1 - (v ? 1 : 0))} fill={s.color} opacity={foco === null || foco === i ? 1 : 0.55} />;
              })}
              {i % cada === 0 && <text x={x + ancho / 2} y={H - 8} textAnchor="middle" className="viz-eje">{etiquetaMes(m.mes)}</text>}
              <rect x={x} y={M.t} width={ancho} height={H - M.t - M.b} fill="transparent" tabIndex={0}
                aria-label={`${etiquetaMes(m.mes)}: ${miles(totales[i])} ${unidad}`}
                onMouseEnter={() => setFoco(i)} onFocus={() => setFoco(i)} onBlur={() => setFoco(null)} />
            </g>
          );
        })}
      </svg>
      {foco !== null && (
        <div className="viz-tip" style={{ left: `${Math.min(78, Math.max(2, ((M.l + foco * ancho) / W) * 100))}%` }} role="status">
          <b>{etiquetaMes(meses[foco].mes)} · {miles(totales[foco])} {unidad}</b>
          {visibles.filter(s => meses[foco].v[s.j]).map(s => (
            <div key={s.clave}><i style={{ background: s.color }} aria-hidden="true" /><span>{s.etiqueta}</span><b>{miles(meses[foco].v[s.j])}</b></div>
          ))}
        </div>
      )}
      <ul className="viz-leyenda viz-leyenda-fila">
        {series.map(s => (
          <li key={s.clave}>
            <button type="button" aria-pressed={!ocultas.has(s.clave)} className={ocultas.has(s.clave) ? "viz-off" : ""}
              onClick={() => setOcultas(a => { const n = new Set(a); if (n.has(s.clave)) n.delete(s.clave); else n.add(s.clave); return n; })}>
              <i style={{ background: s.color }} aria-hidden="true" />{s.etiqueta}
            </button>
          </li>
        ))}
      </ul>
      <details className="viz-tabla">
        <summary>Ver como tabla</summary>
        <div className="tabla-detalle"><table>
          <caption className="sr-only">{titulo}</caption>
          <thead><tr><th>Mes</th>{series.map(s => <th key={s.clave} className="th-num">{s.etiqueta}</th>)}</tr></thead>
          <tbody>{[...meses].reverse().map(m => <tr key={m.mes}><td>{etiquetaMes(m.mes)}</td>{series.map(s => <td key={s.clave} className="td-num">{miles(m.v[s.idx ?? series.indexOf(s)] || 0)}</td>)}</tr>)}</tbody>
        </table></div>
      </details>
    </div>
  );
}
