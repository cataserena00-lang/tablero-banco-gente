import { redirect } from "next/navigation";
import { LogoMinisterio } from "@/components/Marca";
import { modoV2 } from "@/lib/auth2/config";
import { sesionActual } from "@/lib/sesion";

export const dynamic = "force-dynamic";

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  if (modoV2() && (await sesionActual())) redirect("/");   // ya tiene la sesión abierta
  return (
    <main className="login">
      <div className="login-marca">
      <LogoMinisterio />
      <form method="post" action="/api/login" className="card">
        <h1>Ingresar</h1>
        <label>CUIL o usuario<input name="usuario" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} required /></label>
        <label>Contraseña<input name="clave" type="password" autoComplete="current-password" required /></label>
        {error === "2" ? <p className="err">No se pudo verificar el acceso en este momento. Probá de nuevo en unos minutos.</p>
          : error && <p className="err">Usuario o contraseña incorrectos.</p>}
        <button type="submit">Entrar</button>
        {modoV2() && <p className="nota">Después te vamos a pedir el código de tu aplicación autenticadora.</p>}
      </form>
      </div>
    </main>
  );
}
