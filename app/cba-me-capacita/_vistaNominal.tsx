import { LogoCmc } from "@/components/Marca";
import VistaNominalCmc, { type CursoOpcion } from "@/components/cmc/VistaNominalCmc";
import { cargarOpcional } from "@/lib/datos";
import { exigirRol } from "@/lib/sesion";
import { baseConfigurada } from "@/lib/personas";
import { C, type DatosCmc } from "@/lib/cmc";

// Vista NOMINAL de Córdoba me capacita: solo perfil completo o admin. El rol se verifica en el servidor; si no corresponde, ni siquiera se envía la vista
// (y /api/cmc/* vuelve a verificarlo en cada solicitud).
export default async function PaginaNominal({ tipo, searchParams }: { tipo: "participantes" | "capacitadores"; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await exigirRol("completo", "cmc");
  const q = await searchParams;
  const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.slice(0, 100) ?? "";
  const curso = /^\d{1,9}$/.test(uno(q.curso)) ? Number(uno(q.curso)) : null;
  const d = s ? cargarOpcional<DatosCmc>("cba_me_capacita", "cursos") : null;
  const cursos: CursoOpcion[] = d ? d.cursos.map(c => ({ id: c[C.id], curso: d.cursos_nombres[c[C.curso]], inst: d.inst[c[C.inst]], loc: d.zonas[c[C.zona]][1], dep: d.dep[d.zonas[c[C.zona]][0]] })) : [];
  const etiqueta = tipo === "participantes" ? "Participantes" : "Capacitadores";
  return (
    <>
      <div className="franja" />
      <header className="top"><div className="wrap">
        <LogoCmc />
        <div className="titulo"><h1>Córdoba me capacita</h1><p>{etiqueta}</p></div>
        <form method="post" action="/api/logout" className="salir-form"><button className="salir" type="submit">Salir</button></form>
      </div></header>
      <main className="dash"><div className="wrap">
        {s && d ? (
          <>
            <h2 className="vista-titulo">{etiqueta}</h2>
            {baseConfigurada()
              ? <VistaNominalCmc tipo={tipo} deps={d.dep} zonas={d.zonas} cursos={cursos} inicial={{ dep: uno(q.zdep), loc: uno(q.zloc), curso }} />
              : <p className="nota">La base todavía no está conectada (falta configurar <code>DATABASE_URL_LECTURA</code> en Vercel y cargar los datos).</p>}
          </>
        ) : (
          <>
            <h2 className="vista-titulo">Sin acceso</h2>
            <p className="nota">Tu usuario tiene perfil de datos agregados. Esta vista es solo para el perfil completo.</p>
          </>
        )}
      </div></main>
    </>
  );
}
