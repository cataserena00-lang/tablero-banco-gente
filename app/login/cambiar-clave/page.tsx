import { LogoMinisterio } from "@/components/Marca";
import { exigirPaso } from "@/lib/auth2/pendiente";
import { LARGO_MINIMO_CLAVE } from "@/lib/auth2/config";

export const dynamic = "force-dynamic";

export default async function CambiarClave({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  await exigirPaso("/login/cambiar-clave");
  const { m } = await searchParams;
  return (
    <main className="login">
      <div className="login-marca">
      <LogoMinisterio />
      <form method="post" action="/api/login/cambiar-clave" className="card">
        <h1>Elegí tu contraseña</h1>
        <p className="nota">Es tu primer ingreso (o te dieron una contraseña provisoria): elegí una propia, de al menos {LARGO_MINIMO_CLAVE} caracteres. Después vas a configurar tu aplicación autenticadora.</p>
        <label>Contraseña nueva<input name="nueva" type="password" autoComplete="new-password" minLength={LARGO_MINIMO_CLAVE} required /></label>
        <label>Repetila<input name="repetir" type="password" autoComplete="new-password" minLength={LARGO_MINIMO_CLAVE} required /></label>
        {m && <p className="err">{m.slice(0, 200)}</p>}
        <button type="submit">Guardar y seguir</button>
      </form>
      </div>
    </main>
  );
}
