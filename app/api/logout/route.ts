import { NextResponse } from "next/server";
import { COOKIE } from "@/lib/auth";
import { modoV2 } from "@/lib/auth2/config";
import { salirV2 } from "@/lib/auth2/handlers";
export async function POST(req: Request) {
  if (modoV2()) return salirV2(req);
  const res = NextResponse.redirect(new URL("/login", req.url), 303);
  res.cookies.delete(COOKIE);
  return res;
}
