"use client";
import { useCallback, useEffect, useState } from "react";

/* Administración de usuarios (solo perfil admin; /api/admin/* vuelve a verificar el perfil en el servidor en cada pedido). */
interface U { id: string | number; usuario: string; nombre: string | null; rol: string; programas: string[]; activo: boolean; origen: string; totp_confirmado: boolean; debe_cambiar_clave: boolean; ultimo_ingreso: string | null; dispositivos: number; sesiones: number }
interface Pendiente { usuario: string; rol: string; nombre: string | null }
const PERFIL: Record<string, string> = { admin: "Administración", completo: "Completo", agregado: "Agregado" };
const PROGRAMAS: [string, string][] = [["bg", "Banco de la Gente"], ["cmc", "Córdoba me capacita"], ["pe", "Primer Paso"]];
const fecha = (iso: string | null) => (iso ? new Date(iso).toLocaleString("es-AR", { timeZone: "America/Argentina/Cordoba", dateStyle: "short", timeStyle: "short" }) : "Nunca");

export default function AdminUsuarios() {
  const [lista, setLista] = useState<U[] | null>(null), [pend, setPend] = useState<Pendiente[]>([]), [yo, setYo] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [nuevo, setNuevo] = useState({ usuario: "", nombre: "", rol: "agregado", programas: ["bg"] as string[] });
  const [clave, setClave] = useState<{ usuario: string; clave: string } | null>(null);

  const cargar = useCallback(async () => {
    const r = await fetch("/api/admin/usuarios"); if (!r.ok) return setMsg({ ok: false, texto: "No se pudo cargar la lista." });
    const d = await r.json(); setLista(d.usuarios); setPend(d.pendientes); setYo(d.yo);
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  async function crear(e: React.FormEvent) {
    e.preventDefault(); setMsg(null); setClave(null);
    const r = await fetch("/api/admin/usuarios", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(nuevo) });
    const d = await r.json().catch(() => ({}));
    if (r.ok) { setClave({ usuario: d.usuario, clave: d.claveTemporal }); setNuevo({ usuario: "", nombre: "", rol: "agregado", programas: ["bg"] }); cargar(); }
    else setMsg({ ok: false, texto: d.mensaje ?? "No se pudo crear." });
  }
  async function cambiar(id: string | number, cuerpo: object) {
    const r = await fetch(`/api/admin/usuarios/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
    const d = await r.json().catch(() => ({})); setMsg(r.ok ? { ok: true, texto: "Guardado." } : { ok: false, texto: d.mensaje ?? "No se pudo guardar." }); cargar();
  }
  async function accion(id: string | number, a: string, confirmacion: string) {
    if (!confirm(confirmacion)) return;
    const r = await fetch(`/api/admin/usuarios/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: a }) });
    setMsg(r.ok ? { ok: true, texto: "Hecho." } : { ok: false, texto: "No se pudo completar." }); cargar();
  }
  const alternarProg = (lista: string[], p: string) => (lista.includes(p) ? lista.filter(x => x !== p) : [...lista, p]);

  return (
    <div>
      {msg && <p className={msg.ok ? "nota" : "err"} role="status">{msg.texto}</p>}
      {clave && (
        <div className="aviso-datos" role="status">
          <b>Usuario creado: {clave.usuario}</b>
          <p>Contraseña provisoria (se muestra <strong>una sola vez</strong>; pasásela por un canal privado): <code style={{ fontSize: 16 }}>{clave.clave}</code></p>
          <p>En su primer ingreso va a elegir una contraseña propia y a configurar su aplicación autenticadora.</p>
        </div>
      )}

      <section className="card" style={{ marginTop: 14 }}>
        <header><div><h2>Nuevo usuario</h2><p className="sub">El usuario es el CUIL (sin guiones) o un nombre.</p></div></header>
        <form onSubmit={crear} className="form-cuenta">
          <label>Usuario o CUIL<input value={nuevo.usuario} onChange={e => setNuevo({ ...nuevo, usuario: e.target.value })} required autoCapitalize="none" /></label>
          <label>Nombre y apellido<input value={nuevo.nombre} onChange={e => setNuevo({ ...nuevo, nombre: e.target.value })} /></label>
          <label>Perfil
            <select value={nuevo.rol} onChange={e => setNuevo({ ...nuevo, rol: e.target.value })}>
              <option value="agregado">Agregado (solo datos agregados)</option><option value="completo">Completo (ve datos de personas)</option><option value="admin">Administración (todo, y gestiona usuarios)</option>
            </select>
          </label>
          {nuevo.rol !== "admin" && (
            <fieldset style={{ border: 0, padding: 0, margin: 0 }}><legend style={{ fontSize: 13, color: "var(--tx2)" }}>Programas que puede ver</legend>
              {PROGRAMAS.map(([c, n]) => <label key={c} style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" checked={nuevo.programas.includes(c)} onChange={() => setNuevo({ ...nuevo, programas: alternarProg(nuevo.programas, c) })} />{n}</label>)}
            </fieldset>
          )}
          <button type="submit" className="volver" style={{ marginBottom: 0 }}>Crear usuario</button>
        </form>
      </section>

      <section className="card" style={{ marginTop: 14 }}>
        <header><div><h2>Usuarios</h2><p className="sub">{lista ? `${lista.length} en la base` : "Cargando…"}</p></div></header>
        <div className="tabla-detalle"><table>
          <thead><tr><th>Nombre / usuario</th><th>Perfil</th><th>Programas</th><th>Autenticador</th><th>Último ingreso</th><th>Estado</th><th>Acciones</th></tr></thead>
          <tbody>{(lista ?? []).map(u => {
            const esYo = u.usuario === yo;
            return (
              <tr key={u.id}>
                <td><b>{u.nombre ?? "—"}</b><br /><small>{u.usuario}{esYo ? " (vos)" : ""}</small></td>
                <td>
                  <select value={u.rol} disabled={esYo} onChange={e => cambiar(u.id, { rol: e.target.value })} aria-label={`Perfil de ${u.usuario}`}>
                    {Object.entries(PERFIL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </td>
                <td>{u.rol === "admin" ? "Todos" : PROGRAMAS.map(([c, n]) => (
                  <label key={c} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12.5 }}>
                    <input type="checkbox" checked={u.programas.includes(c)} onChange={() => cambiar(u.id, { programas: alternarProg(u.programas, c) })} />{n}</label>))}</td>
                <td>{u.totp_confirmado ? <span className="etiqueta-estado ok">Configurado</span> : <span className="etiqueta-estado mal">Sin configurar</span>}{u.dispositivos > 0 && <><br /><small>{u.dispositivos} dispositivo(s) de confianza</small></>}</td>
                <td>{fecha(u.ultimo_ingreso)}{u.sesiones > 0 && <><br /><small>{u.sesiones} sesión(es) abierta(s)</small></>}</td>
                <td>{u.activo ? <span className="etiqueta-estado ok">Activo</span> : <span className="etiqueta-estado mal">Desactivado</span>}</td>
                <td><div className="admin-acciones">
                  {!esYo && <button type="button" className="limpiar" onClick={() => cambiar(u.id, { activo: !u.activo })}>{u.activo ? "Desactivar" : "Activar"}</button>}
                  <button type="button" className="limpiar" onClick={() => accion(u.id, "reiniciar-2fa", `¿Reiniciar el autenticador de ${u.usuario}? Va a tener que configurarlo de nuevo en su próximo ingreso y se cierran sus sesiones.`)}>Reiniciar autenticador</button>
                  <button type="button" className="limpiar" onClick={() => accion(u.id, "cerrar-sesiones", `¿Cerrar las sesiones abiertas de ${u.usuario}?`)}>Cerrar sesiones</button>
                  {u.dispositivos > 0 && <button type="button" className="limpiar" onClick={() => accion(u.id, "quitar-dispositivos", `¿Quitar los dispositivos de confianza de ${u.usuario}?`)}>Quitar dispositivos</button>}
                </div></td>
              </tr>);
          })}</tbody>
        </table></div>
      </section>

      {pend.length > 0 && (
        <section className="card" style={{ marginTop: 14 }}>
          <header><div><h2>Todavía en las variables de Vercel</h2><p className="sub">Estas personas pasan a la base solas la primera vez que ingresan (con su contraseña actual, que tendrán que cambiar). Para darlas de baja sin que ingresen, quitá su entrada de la variable en Vercel.</p></div></header>
          <ul>{pend.map(p => <li key={p.usuario}>{p.nombre ?? "—"} · <small>{p.usuario} · {PERFIL[p.rol]}</small></li>)}</ul>
        </section>
      )}
    </div>
  );
}
