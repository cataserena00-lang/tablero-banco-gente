"use client";
import { useState } from "react";

/* Alta del autenticador: se escanea el QR (o se escribe la clave), se confirma con el primer código y se muestran, una sola vez,
   los códigos de recuperación. Cuando el código es correcto el servidor ya abre la sesión. */
export default function ConfigurarAutenticador({ qrSrc, secreto }: { qrSrc: string; secreto: string }) {
  const [codigo, setCodigo] = useState(""), [error, setError] = useState<string | null>(null), [enviando, setEnviando] = useState(false);
  const [codigos, setCodigos] = useState<string[] | null>(null), [copiado, setCopiado] = useState(false);

  async function confirmar(e: React.FormEvent) {
    e.preventDefault(); setError(null); setEnviando(true);
    try {
      const r = await fetch("/api/login/configurar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ codigo }) });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.ok) setCodigos(d.codigos);
      else if (r.status === 401) location.href = "/login";
      else setError("El código no es correcto. Revisá que la hora de tu celular sea automática y probá con el código nuevo.");
    } catch { setError("No se pudo conectar. Probá de nuevo."); }
    setEnviando(false);
  }
  const texto = (codigos ?? []).join("\n");
  const descargar = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([`Códigos de recuperación del Tablero del Ministerio\nCada código se puede usar una sola vez.\n\n${texto}\n`], { type: "text/plain" }));
    a.download = "codigos-de-recuperacion.txt"; a.click(); URL.revokeObjectURL(a.href);
  };

  if (codigos) return (
    <div className="card configurar">
      <h1>Guardá tus códigos de recuperación</h1>
      <p className="nota">Si perdés el celular, cada uno de estos códigos te deja entrar una vez. <strong>No se vuelven a mostrar.</strong> Guardalos en un lugar seguro (no en este mismo celular).</p>
      <ul className="codigos-recuperacion">{codigos.map(c => <li key={c}><code>{c}</code></li>)}</ul>
      <div className="acciones">
        <button type="button" className="limpiar" onClick={async () => { try { await navigator.clipboard.writeText(texto); setCopiado(true); } catch { /* sin portapapeles */ } }}>{copiado ? "Copiados" : "Copiar"}</button>
        <button type="button" className="limpiar" onClick={descargar}>Descargar</button>
      </div>
      <a className="boton-link" href="/">Ya los guardé, entrar al tablero</a>
    </div>
  );

  return (
    <form className="card configurar" onSubmit={confirmar}>
      <h1>Configurá tu autenticador</h1>
      <ol className="pasos">
        <li>Instalá en tu celular una aplicación autenticadora (Google Authenticator, Microsoft Authenticator, Authy…).</li>
        <li>Elegí «agregar cuenta» y escaneá este código QR:</li>
      </ol>
      <div className="qr"><img src={qrSrc} alt="Código QR para el autenticador" width={188} height={188} /></div>
      <p className="nota">¿No podés escanear? Escribí esta clave en la aplicación: <code className="secreto">{secreto}</code></p>
      <label>3. Escribí el código de 6 dígitos que muestra la aplicación
        <input value={codigo} onChange={e => setCodigo(e.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={8} required />
      </label>
      {error && <p className="err">{error}</p>}
      <button type="submit" disabled={enviando}>{enviando ? "Verificando…" : "Confirmar"}</button>
    </form>
  );
}
