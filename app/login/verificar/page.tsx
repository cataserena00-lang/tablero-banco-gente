import { LogoMinisterio } from "@/components/Marca";
import { exigirPaso } from "@/lib/auth2/pendiente";

export const dynamic = "force-dynamic";

export default async function Verificar({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await exigirPaso("/login/verificar");
  const { error } = await searchParams;
  return (
    <main className="login">
      <div className="login-marca">
      <LogoMinisterio />
      <form method="post" action="/api/login/verificar" className="card">
        <h1>Código del autenticador</h1>
        <p className="nota">Abrí tu aplicación autenticadora (Google Authenticator, Microsoft Authenticator, Authy…) y escribí el código de 6 dígitos de «Tablero del Ministerio».</p>
        <label>Código<input name="codigo" inputMode="numeric" autoComplete="one-time-code" autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={14} required autoFocus /></label>
        <label className="confiar"><input type="checkbox" name="confiar" value="1" /> Confiar en este dispositivo por 30 días (solo en tu computadora o celular personal)</label>
        {error === "2" ? <p className="err">Hubo demasiados códigos incorrectos. Esperá unos minutos y probá de nuevo.</p>
          : error && <p className="err">El código no es correcto o ya se usó. Probá con el que muestra la aplicación ahora.</p>}
        <button type="submit">Verificar</button>
        <p className="nota">¿Perdiste el celular? En el mismo campo podés escribir uno de tus códigos de recuperación.</p>
      </form>
      <form method="post" action="/api/logout" className="cancelar"><button type="submit">Cancelar y volver</button></form>
      </div>
    </main>
  );
}
