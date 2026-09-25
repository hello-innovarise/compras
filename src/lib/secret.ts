// Clave para firmar sesiones. AUTH_SECRET es obligatorio en el servidor interno.
// En una demo de Vercel sin AUTH_SECRET se deriva de la URL de la base de datos (privada) para no pedir más configuración.
// Usa Web Crypto para funcionar tanto en Node como en el middleware (Edge).
let cached: Uint8Array | null = null;

export async function authSecret(): Promise<Uint8Array> {
  if (cached) return cached;
  let s = process.env.AUTH_SECRET;
  if (!s && process.env.VERCEL) {
    const seed = `compras-ag:${process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL || ""}:${process.env.VERCEL_PROJECT_ID || ""}`;
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(seed));
    s = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  }
  cached = new TextEncoder().encode(s || "dev-secret-change-me");
  return cached;
}

export const secureCookies = () => process.env.COOKIE_SECURE === "true" || !!process.env.VERCEL;
