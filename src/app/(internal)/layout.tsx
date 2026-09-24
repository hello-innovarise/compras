import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession, logout } from "@/lib/auth";

const NAV = [
  { href: "/", label: "Inicio" },
  { href: "/events", label: "Licitaciones" },
  { href: "/torre", label: "Torre de Compras" },
  { href: "/suppliers", label: "Proveedores" },
  { href: "/templates", label: "Plantillas" },
  { href: "/settings", label: "Configuración" },
];

export default async function InternalLayout({ children }: { children: React.ReactNode }) {
  const user = await getSession();
  if (!user) redirect("/login");
  async function doLogout() {
    "use server";
    await logout();
    redirect("/login");
  }
  return (
    <div className="min-h-screen">
      <header className="no-print border-b border-gray-200 bg-brand text-white">
        <div className="mx-auto flex max-w-[1600px] items-center gap-6 px-4 py-2">
          <Link href="/" className="text-lg font-bold">Compras AG</Link>
          <nav className="flex flex-wrap gap-1 text-sm">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="rounded px-2 py-1 hover:bg-white/10">
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="opacity-80">{user.name} · {user.role}</span>
            <form action={doLogout}>
              <button className="rounded px-2 py-1 hover:bg-white/10">Salir</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1600px] px-4 py-6">{children}</main>
    </div>
  );
}
