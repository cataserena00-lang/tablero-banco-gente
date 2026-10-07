import { LogoBanco } from "@/components/Marca";

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="login">
      <div className="login-marca">
      <LogoBanco />
      <form method="post" action="/api/login" className="card">
        <h1>Ingresar</h1>
        <label>Usuario<input name="usuario" autoComplete="username" required /></label>
        <label>Contraseña<input name="clave" type="password" autoComplete="current-password" required /></label>
        {error && <p className="err">Usuario o contraseña incorrectos.</p>}
        <button type="submit">Entrar</button>
      </form>
      </div>
    </main>
  );
}
