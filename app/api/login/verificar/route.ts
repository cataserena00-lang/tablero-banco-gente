import { NextResponse } from "next/server";
import { modoV2 } from "@/lib/auth2/config";
import { verificarCodigoIngreso } from "@/lib/auth2/handlers";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  if (!modoV2()) return new NextResponse("No disponible", { status: 404 });
  return verificarCodigoIngreso(req);
}
