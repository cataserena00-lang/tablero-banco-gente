import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, sesionValida } from "@/lib/auth";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === "/login" || pathname === "/api/login") return NextResponse.next();
  if (await sesionValida(req.cookies.get(COOKIE)?.value)) return NextResponse.next();
  if (pathname.startsWith("/api/")) return new NextResponse("No autorizado", { status: 401 });
  const url = req.nextUrl.clone(); url.pathname = "/login"; url.search = "";
  return NextResponse.redirect(url);
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
