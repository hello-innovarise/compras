import { redirect } from "next/navigation";
import { login } from "@/lib/auth";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const { e } = await searchParams;
  async function action(fd: FormData) {
    "use server";
    const u = await login(String(fd.get("email") ?? ""), String(fd.get("password") ?? ""));
    if (!u) redirect("/login?e=1");
    redirect("/");
  }
  return (
    <main className="flex min-h-screen items-center justify-center">
      <form action={action} className="card w-full max-w-sm space-y-4">
        <div>
          <h1 className="h1">Compras AG</h1>
          <p className="text-sm text-gray-500">Licitaciones de materia prima · Grupo AG</p>
        </div>
        {e && <p className="rounded bg-red-50 p-2 text-sm text-red-700">Usuario o clave incorrectos.</p>}
        <div>
          <label className="label" htmlFor="email">Correo</label>
          <input className="input" id="email" name="email" type="email" required autoFocus />
        </div>
        <div>
          <label className="label" htmlFor="password">Clave</label>
          <input className="input" id="password" name="password" type="password" required />
        </div>
        <button className="btn w-full justify-center" type="submit">Ingresar</button>
      </form>
    </main>
  );
}
