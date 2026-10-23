"use client";
import { useCallback, useEffect, useState } from "react";

/* Mi cuenta: cambiar la contraseña, dispositivos de confianza, cerrar otras sesiones y códigos de recuperación nuevos.
   Todo lo resuelve el servidor (/api/cuenta/*), que vuelve a verificar la sesión en cada pedido. */
interface Dispositivo { id: number; creado: string; ultimo_uso: string | null; expira: string; agente: string | null }
const fecha = (iso: string | null) => (iso ? new Date(iso).toLocaleString("es-AR", { timeZone: "America/Argentina/Cordoba", dateStyle: "short", timeStyle: "short" }) : "—");
const post = (accion: string, cuerpo: object = {}) => fetch(`/api/cuenta/${accion}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });

export default function CuentaSeguridad({ avisoRecuperacion }: { avisoRecuperacion: boolean }) {
  const [disp, setDisp] = useState<Dispositivo[] | null>(null), [restantes, setRestantes] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [actual, setActual] = useState(""), [nueva, setNueva] = useState(""), [repetir, setRepetir] = useState("");
  const [codigo, setCodigo] = useState(""), [nuevos, setNuevos] = useState<string[] | null>(null);

  const cargar = useCallback(async () => {
    const r = await fetch("/api/cuenta/dispositivos"); if (!r.ok) return;
    const d = await r.json(); setDisp(d.dispositivos); setRestantes(d.codigosRestantes);
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  async function cambiarClave(e: React.FormEvent) {
    e.preventDefault();
    if (nueva !== repetir) return setMsg({ ok: false, texto: "Las dos contraseñas nuevas no coinciden." });
    const r = await post("clave", { actual, nueva }), d = await r.json().catch(() => ({}));
    setMsg(r.ok ? { ok: true, texto: "Listo: cambiaste tu contraseña. Se cerraron tus otras sesiones y los dispositivos de confianza." } : { ok: false, texto: d.mensaje ?? "No se pudo cambiar." });
    if (r.ok) { setActual(""); setNueva(""); setRepetir(""); cargar(); }
  }
  async function codigosNuevos(e: React.FormEvent) {
    e.preventDefault();
    const r = await post("codigos", { codigo }), d = await r.json().catch(() => ({}));
    if (r.ok) { setNuevos(d.codigos); setCodigo(""); cargar(); } else setMsg({ ok: false, texto: d.mensaje ?? "No se pudo." });
  }
  async function simple(accion: string, cuerpo: object, ok: string) {
    const r = await post(accion, cuerpo); setMsg(r.ok ? { ok: true, texto: ok } : { ok: false, texto: "No se pudo completar." }); cargar();
  }

  return (
    <div className="cuenta">
      {avisoRecuperacion && <p className="aviso-datos" role="status">Entraste con un código de recuperación (ya no sirve para otro ingreso). Si perdiste el celular, configurá el autenticador de nuevo pidiéndole a un administrador que lo reinicie, y generá códigos nuevos acá abajo.</p>}
      {msg && <p className={msg.ok ? "nota" : "err"} role="status">{msg.texto}</p>}

      <section className="card" style={{ marginTop: 14 }}>
        <header><div><h2>Cambiar contraseña</h2><p className="sub">Al cambiarla se cierran tus otras sesiones y se quitan los dispositivos de confianza.</p></div></header>
        <form onSubmit={cambiarClave} className="form-cuenta">
          <label>Contraseña actual<input type="password" autoComplete="current-password" value={actual} onChange={e => setActual(e.target.value)} required /></label>
          <label>Contraseña nueva (mínimo 12 caracteres)<input type="password" autoComplete="new-password" minLength={12} value={nueva} onChange={e => setNueva(e.target.value)} required /></label>
          <label>Repetir la nueva<input type="password" autoComplete="new-password" minLength={12} value={repetir} onChange={e => setRepetir(e.target.value)} required /></label>
          <button type="submit" className="volver" style={{ marginBottom: 0 }}>Cambiar contraseña</button>
        </form>
      </section>

      <section className="card" style={{ marginTop: 14 }}>
        <header><div><h2>Dispositivos de confianza</h2><p className="sub">En estos dispositivos no se pide el código del autenticador (sí la contraseña). Duran 30 días.</p></div></header>
        {disp === null ? <p className="nota">Cargando…</p> : disp.length === 0 ? <p className="nota">No confiás en ningún dispositivo.</p> : (
          <div className="tabla-detalle"><table>
            <thead><tr><th>Dispositivo</th><th>Desde</th><th>Último uso</th><th>Vence</th><th /></tr></thead>
            <tbody>{disp.map(d => (
              <tr key={d.id}><td>{(d.agente ?? "—").slice(0, 70)}</td><td>{fecha(d.creado)}</td><td>{fecha(d.ultimo_uso)}</td><td>{fecha(d.expira)}</td>
                <td><button type="button" className="limpiar" onClick={() => simple("quitar-dispositivos", { id: Number(d.id) }, "Dispositivo quitado.")}>Quitar</button></td></tr>))}</tbody>
          </table></div>
        )}
        <div style={{ display: "flex", gap: 12, marginTop: 10 }}>
          {disp && disp.length > 0 && <button type="button" className="limpiar" onClick={() => simple("quitar-dispositivos", {}, "Se quitaron todos los dispositivos.")}>Quitar todos</button>}
          <button type="button" className="limpiar" onClick={() => simple("cerrar-otras-sesiones", {}, "Se cerraron tus otras sesiones.")}>Cerrar mis otras sesiones</button>
        </div>
      </section>

      <section className="card" style={{ marginTop: 14 }}>
        <header><div><h2>Códigos de recuperación</h2><p className="sub">{restantes === null ? "" : `Te quedan ${restantes} sin usar.`} Sirven una sola vez si perdés el celular.</p></div></header>
        {nuevos ? (
          <>
            <p className="nota"><strong>Guardalos ahora: no se vuelven a mostrar.</strong> Los anteriores dejaron de servir.</p>
            <ul className="codigos-recuperacion">{nuevos.map(c => <li key={c}><code>{c}</code></li>)}</ul>
          </>
        ) : (
          <form onSubmit={codigosNuevos} className="form-cuenta">
            <label>Para generar códigos nuevos, escribí el código actual de tu autenticador<input value={codigo} onChange={e => setCodigo(e.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={8} required /></label>
            <button type="submit" className="volver" style={{ marginBottom: 0 }}>Generar códigos nuevos</button>
          </form>
        )}
      </section>
    </div>
  );
}
