// Autenticación interna: usuario/clave con sesión JWT en cookie.
// Aislado aquí para poder reemplazarlo por Microsoft Entra ID (OIDC) sin tocar las páginas.
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "./db";

const COOKIE = "compras_session";
const secret = () => new TextEncoder().encode(process.env.AUTH_SECRET || "dev-secret-change-me");

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "BUYER" | "COMMITTEE";
}

export async function signSession(u: SessionUser): Promise<string> {
  return new SignJWT({ ...u }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("12h").sign(secret());
}

export async function verifySession(token?: string): Promise<SessionUser | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return { id: String(payload.id), email: String(payload.email), name: String(payload.name), role: payload.role as SessionUser["role"] };
  } catch {
    return null;
  }
}

export async function getSession(): Promise<SessionUser | null> {
  const c = await cookies();
  return verifySession(c.get(COOKIE)?.value);
}

export async function requireUser(roles?: SessionUser["role"][]): Promise<SessionUser> {
  const u = await getSession();
  if (!u) redirect("/login");
  if (roles && !roles.includes(u.role) && u.role !== "ADMIN") redirect("/?denied=1");
  return u;
}

export async function login(email: string, password: string): Promise<SessionUser | null> {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (!user || !user.active) return null;
  if (!(await bcrypt.compare(password, user.passwordHash))) return null;
  const s: SessionUser = { id: user.id, email: user.email, name: user.name, role: user.role };
  const c = await cookies();
  c.set(COOKIE, await signSession(s), { httpOnly: true, sameSite: "lax", secure: process.env.COOKIE_SECURE === "true", path: "/", maxAge: 60 * 60 * 12 });
  return s;
}

export async function logout() {
  (await cookies()).delete(COOKIE);
}

export const SESSION_COOKIE = COOKIE;
export const hashPassword = (p: string) => bcrypt.hash(p, 10);
