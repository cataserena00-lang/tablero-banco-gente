import { LogoBanco } from "@/components/Marca";
import VistaPersonas from "@/components/VistaPersonas";
import { exigirRol } from "@/lib/sesion";
import { baseConfigurada } from "@/lib/personas";

export const metadata = { title: "Banco de la Gente – Vista de personas" };
export const dynamic = "force-dynamic";

// Vista NOMINAL: solo perfil "completo". El rol se verifica en el servidor; si no corresponde, ni siquiera se envía la vista.
type Parametros = Record<string, string | string[] | undefined>;
const texto = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.slice(0, 120) ?? "";

export default async function Pagina({ searchParams }: { searchParams: Promise<Parametros> }) {
  const sp = await searchParams;
  const s = await exigirRol("completo");
  return (
    <>
      <div className="franja" />
      <header className="top"><div className="wrap">
        <LogoBanco />
        <div className="titulo"><h1>Banco de la Gente</h1><p>Vista de personas · todos los créditos</p></div>
        <form method="post" action="/api/logout" className="salir-form"><button className="salir" type="submit">Salir</button></form>
      </div></header>
      <main className="dash"><div className="wrap">
        {s ? (
          <>
            <h2 className="vista-titulo">Vista de personas</h2>
            {baseConfigurada()
              ? <VistaPersonas inicial={{ departamento: texto(sp.departamento), localidad: texto(sp.localidad), estado: texto(sp.estado), linea: texto(sp.linea), q: texto(sp.q) }} />
              : <p className="nota">La base de personas todavía no está conectada (falta configurar <code>DATABASE_URL_LECTURA</code> en Vercel y cargar los datos).</p>}
          </>
        ) : (
          <>
            <h2 className="vista-titulo">Sin acceso</h2>
            <p className="nota">Tu usuario tiene perfil de datos agregados. La vista de personas es solo para el perfil completo.</p>
          </>
        )}
      </div></main>
    </>
  );
}
