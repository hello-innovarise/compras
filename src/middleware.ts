import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { authSecret } from "./lib/secret";

const PUBLIC = [/^\/login/, /^\/portal\//, /^\/api\/portal\//, /^\/api\/cron/, /^\/_next\//, /^\/favicon/];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((r) => r.test(pathname))) return NextResponse.next();
  const token = req.cookies.get("compras_session")?.value;
  if (token) {
    try {
      await jwtVerify(token, await authSecret());
      return NextResponse.next();
    } catch {
      /* fallthrough */
    }
  }
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
