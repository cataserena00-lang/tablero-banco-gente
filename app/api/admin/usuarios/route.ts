import { auditar } from "@/lib/auth2/auditoria";
import { guardia, json } from "@/lib/auth2/cuenta";
import { claveTemporal } from "@/lib/auth2/claves";
import { hashClave } from "@/lib/auth2/cripto";
import { USUARIOS_DADOS_DE_BAJA } from "@/lib/auth2/config";
import { crearUsuario, listarUsuarios, normalizarUsuario } from "@/lib/auth2/usuarios";
import { usuariosDeVariables, type Rol } from "@/lib/auth";
import { PROGRAMAS, type Programa } from "@/lib/programas";

export const dynamic = "force-dynamic";
const ROLES: Rol[] = ["admin", "completo", "agregado"];
const CODIGOS = PROGRAMAS.map(p => p.id) as string[];

// Panel de administración: SOLO perfil admin (se verifica acá, en el servidor, en cada solicitud). Lista y alta de usuarios.
export async function GET(req: Request) {
  const g = await guardia(req, true);
  if ("error" in g) return g.error;
  const usuarios = await listarUsuarios();
  const enBase = new Set(usuarios.map(u => String(u.usuario)));
  const pendientes = usuariosDeVariables().filter(u => !enBase.has(u.usuario) && !USUARIOS_DADOS_DE_BAJA.has(u.usuario));
  return json({ usuarios, pendientes, yo: g.s.usuario });
}

export async function POST(req: Request) {
  const g = await guardia(req, true);
  if ("error" in g) return g.error;
  const c = await req.json().catch(() => ({})) as { usuario?: string; nombre?: string; rol?: string; programas?: string[] };
  const usuario = normalizarUsuario(String(c.usuario ?? ""));
  const rol = ROLES.find(r => r === c.rol);
  const programas = [...new Set((c.programas ?? []).map(String).map(x => (x === "ppp" ? "pe" : x)).filter(x => CODIGOS.includes(x)))] as Programa[];
  if (!/^[a-z0-9._-]{3,60}$/.test(usuario)) return json({ ok: false, mensaje: "El usuario tiene que tener entre 3 y 60 caracteres: letras, números, punto, guion o guion bajo (o el CUIL)." }, 400);
  if (!rol) return json({ ok: false, mensaje: "Elegí un perfil." }, 400);
  if (USUARIOS_DADOS_DE_BAJA.has(usuario)) return json({ ok: false, mensaje: "Ese usuario está dado de baja." }, 400);
  const clave = claveTemporal();
  const creado = await crearUsuario({
    usuario, nombre: String(c.nombre ?? "").trim().slice(0, 80) || null, rol, programas: rol === "admin" ? CODIGOS as Programa[] : (programas.length ? programas : ["bg"]),
    claveHash: await hashClave(clave), debeCambiar: true, origen: "panel",
  });
  if (!creado) return json({ ok: false, mensaje: "Ya existe un usuario con ese nombre." }, 409);
  await auditar(g.s.usuario, g.s.rol, "admin_usuario_creado", { objetivo: creado.usuario, perfil: rol });
  return json({ ok: true, usuario: creado.usuario, claveTemporal: clave });   // se muestra una sola vez
}
