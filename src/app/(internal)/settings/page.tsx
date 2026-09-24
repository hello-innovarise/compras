import { prisma } from "@/lib/db";
import { requireUser, hashPassword } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { back, str } from "@/lib/forms";
import { runScheduler } from "@/lib/events";
import { sendMail } from "@/lib/mail";
import { Field, Flash } from "@/components/ui";

export const dynamic = "force-dynamic";

async function createUser(fd: FormData) {
  "use server";
  const u = await requireUser(["ADMIN"]);
  const email = (str(fd, "email") ?? "").toLowerCase();
  const pw = str(fd, "password");
  if (!email || !pw || pw.length < 8) back("/settings", undefined, "Correo y clave (mín. 8 caracteres) requeridos");
  await prisma.user.upsert({
    where: { email },
    update: { name: str(fd, "name") ?? email, role: (str(fd, "role") as "ADMIN" | "BUYER" | "COMMITTEE") ?? "BUYER", passwordHash: await hashPassword(pw), active: true },
    create: { email, name: str(fd, "name") ?? email, role: (str(fd, "role") as "ADMIN" | "BUYER" | "COMMITTEE") ?? "BUYER", passwordHash: await hashPassword(pw) },
  });
  await audit(u.email, "user.saved", "User", email);
  back("/settings", "Usuario guardado");
}

async function toggleUser(id: string) {
  "use server";
  const u = await requireUser(["ADMIN"]);
  const x = await prisma.user.findUniqueOrThrow({ where: { id } });
  if (x.id === u.id) back("/settings", undefined, "No puede desactivarse a sí mismo");
  await prisma.user.update({ where: { id }, data: { active: !x.active } });
  back("/settings", "Usuario actualizado");
}

async function runNow() {
  "use server";
  await requireUser(["BUYER"]);
  const r = await runScheduler();
  back("/settings", `Tareas ejecutadas: ${r.closed} licitaciones cerradas, ${r.reminders} recordatorios enviados`);
}

async function testMail(fd: FormData) {
  "use server";
  const u = await requireUser(["ADMIN"]);
  const ok = await sendMail({ to: [str(fd, "to") ?? u.email], subject: "Prueba Compras AG", html: "<p>Correo de prueba desde Compras AG.</p>", kind: "test" });
  back("/settings", ok ? "Correo de prueba enviado (ver bitácora de correos)" : undefined, ok ? undefined : "Error al enviar; revise la configuración SMTP");
}

export default async function Settings({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const me = await requireUser();
  const users = await prisma.user.findMany({ orderBy: { email: "asc" } });
  const emails = await prisma.emailLog.findMany({ orderBy: { createdAt: "desc" }, take: 15 });
  return (
    <div className="space-y-4">
      <h1 className="h1">Configuración</h1>
      <Flash msg={sp.msg} error={sp.error} />
      <div className="grid gap-4 md:grid-cols-3">
        <section className="card md:col-span-2">
          <h2 className="h2 mb-2">Usuarios internos</h2>
          <table className="tbl">
            <thead><tr><th>Correo</th><th>Nombre</th><th>Rol</th><th>Activo</th><th /></tr></thead>
            <tbody>{users.map((u) => <tr key={u.id}><td>{u.email}</td><td>{u.name}</td><td>{u.role}</td><td>{u.active ? "Sí" : "No"}</td><td>{me.role === "ADMIN" && <form action={toggleUser.bind(null, u.id)}><button className="text-xs underline">{u.active ? "Desactivar" : "Activar"}</button></form>}</td></tr>)}</tbody>
          </table>
          <p className="mt-2 text-xs text-gray-500">Roles: ADMIN (todo + usuarios), BUYER (Compras: licitaciones, matrices), COMMITTEE (Torre: escenarios y aprobación).</p>
        </section>
        {me.role === "ADMIN" && (
          <form action={createUser} className="card space-y-2">
            <h2 className="h2">Crear / actualizar usuario</h2>
            <Field label="Correo"><input name="email" type="email" className="input" required /></Field>
            <Field label="Nombre"><input name="name" className="input" /></Field>
            <Field label="Rol"><select name="role" className="input"><option value="BUYER">Compras</option><option value="COMMITTEE">Torre de Compras</option><option value="ADMIN">Administrador</option></select></Field>
            <Field label="Clave (mín. 8)"><input name="password" type="password" className="input" required /></Field>
            <button className="btn">Guardar</button>
          </form>
        )}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <section className="card space-y-2 text-sm">
          <h2 className="h2">Correo y tareas programadas</h2>
          <p>SMTP: <b>{process.env.SMTP_HOST ? `${process.env.SMTP_HOST}:${process.env.SMTP_PORT}` : "no configurado (solo se registran en bitácora)"}</b> · Remitente: {process.env.MAIL_FROM}</p>
          <p>Recordatorios: {process.env.REMINDER_HOURS || "48,4"} horas antes del cierre. El worker cierra licitaciones vencidas cada minuto.</p>
          <form action={runNow}><button className="btn-secondary">Ejecutar cierre/recordatorios ahora</button></form>
          {me.role === "ADMIN" && <form action={testMail} className="flex gap-2"><input name="to" type="email" className="input" placeholder={me.email} /><button className="btn-secondary">Enviar correo de prueba</button></form>}
        </section>
        <section className="card">
          <h2 className="h2 mb-2">Últimos correos</h2>
          <table className="tbl"><thead><tr><th>Fecha</th><th>Tipo</th><th>Para</th><th>Error</th></tr></thead>
            <tbody>{emails.map((e) => <tr key={e.id}><td className="whitespace-nowrap">{e.createdAt.toISOString().slice(0, 16).replace("T", " ")}</td><td>{e.kind}</td><td>{e.to}</td><td className="text-red-600">{e.error}</td></tr>)}</tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
