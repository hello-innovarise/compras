import Link from "next/link";
import { prisma } from "@/lib/db";
import { Badge, Empty, Field } from "@/components/ui";
import { fmtDate } from "@/lib/i18n";
import { createSession, createMatrix } from "./actions";

export const dynamic = "force-dynamic";

export default async function TorrePage() {
  const [sessions, loose] = await Promise.all([
    prisma.committeeSession.findMany({ orderBy: { date: "desc" }, include: { matrices: { select: { id: true } } } }),
    prisma.evaluationMatrix.findMany({ where: { sessionId: null }, orderBy: { createdAt: "desc" }, include: { event: true } }),
  ]);
  return (
    <div className="space-y-4">
      <h1 className="h1">Torre de Compras</h1>
      <div className="grid gap-4 md:grid-cols-3">
        <section className="card md:col-span-2">
          <h2 className="h2 mb-2">Sesiones del comité</h2>
          {sessions.length === 0 ? <Empty>Sin sesiones.</Empty> : (
            <table className="tbl">
              <thead><tr><th>Sesión</th><th>Fecha</th><th>Estado</th><th className="num">Negociaciones</th></tr></thead>
              <tbody>{sessions.map((s) => <tr key={s.id}><td><Link className="text-brand underline" href={`/torre/${s.id}`}>{s.name}</Link></td><td>{fmtDate(s.date, "es")}</td><td><Badge status={s.status} /></td><td className="num">{s.matrices.length}</td></tr>)}</tbody>
            </table>
          )}
        </section>
        <form action={createSession} className="card space-y-2">
          <h2 className="h2">Nueva sesión</h2>
          <Field label="Nombre"><input name="name" className="input" placeholder="Comité Planos 07-2026" required /></Field>
          <Field label="Fecha"><input name="date" type="date" className="input" required /></Field>
          <Field label="Notas"><textarea name="notes" className="input" rows={2} /></Field>
          <button className="btn">Crear sesión</button>
        </form>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <section className="card md:col-span-2">
          <h2 className="h2 mb-2">Matrices sin sesión asignada</h2>
          {loose.length === 0 ? <Empty>—</Empty> : (
            <ul className="text-sm">{loose.map((m) => <li key={m.id}><Link className="text-brand underline" href={`/torre/matrix/${m.id}`}>{m.name}</Link> <span className="text-gray-500">{m.family} · {m.event?.code ?? "manual"}</span></li>)}</ul>
          )}
        </section>
        <form action={createMatrix} className="card space-y-2">
          <h2 className="h2">Nueva matriz manual</h2>
          <p className="text-xs text-gray-500">Para negociaciones fuera del portal (ofertas por correo). Para licitaciones del portal use &quot;Crear matriz de evaluación&quot; en el comparativo.</p>
          <Field label="Nombre"><input name="name" className="input" placeholder="HRC TYPSA" required /></Field>
          <Field label="Familia"><input name="family" className="input" placeholder="HRC HN" required /></Field>
          <Field label="Grupo"><select name="group" className="input"><option>Largos</option><option>Planos</option></select></Field>
          <Field label="TM requeridas"><input name="requiredTons" type="number" step="any" className="input" /></Field>
          <button className="btn-secondary">Crear matriz</button>
        </form>
      </div>
    </div>
  );
}
