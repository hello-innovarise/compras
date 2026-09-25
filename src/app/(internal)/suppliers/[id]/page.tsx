import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { Badge, Field, Flash } from "@/components/ui";
import { fmtDate } from "@/lib/i18n";
import * as A from "../actions";

export const dynamic = "force-dynamic";

export default async function SupplierPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const s = await prisma.supplier.findUnique({
    where: { id },
    include: { contacts: true, evaluations: { orderBy: [{ year: "desc" }, { semester: "desc" }] }, incidents: { orderBy: { date: "desc" } }, invitations: { include: { event: true }, orderBy: { createdAt: "desc" } } },
  });
  if (!s) notFound();
  const avg = s.evaluations.length ? s.evaluations.reduce((a, e) => a + e.score, 0) / s.evaluations.length : null;
  return (
    <div className="space-y-4">
      <h1 className="h1">{s.name}</h1>
      <Flash msg={sp.msg} error={sp.error} />
      <div className="grid gap-4 md:grid-cols-3">
        <form action={A.updateSupplier.bind(null, id)} className="card space-y-2">
          <h2 className="h2">Datos</h2>
          <Field label="Código ERP/SAP"><input name="code" className="input" defaultValue={s.code ?? ""} /></Field>
          <Field label="Nombre"><input name="name" className="input" defaultValue={s.name} /></Field>
          <Field label="País"><input name="country" className="input" defaultValue={s.country ?? ""} /></Field>
          <Field label="Idioma"><select name="locale" className="input" defaultValue={s.locale}><option value="es">Español</option><option value="en">English</option></select></Field>
          <Field label="Correos"><input name="emails" className="input" defaultValue={s.contacts.map((c) => c.email).join(", ")} /></Field>
          <Field label="Notas"><textarea name="notes" className="input" rows={2} defaultValue={s.notes ?? ""} /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={s.active} /> Activo</label>
          <button className="btn">Guardar</button>
        </form>
        <section className="card space-y-2">
          <h2 className="h2">Evaluación N.E.P {avg !== null && <span className="text-brand">· promedio {avg.toFixed(1)}</span>}</h2>
          <table className="tbl"><thead><tr><th>Año</th><th>Semestre</th><th className="num">Nota</th><th>Sostenibilidad</th></tr></thead>
            <tbody>{s.evaluations.map((e) => <tr key={e.id}><td>{e.year}</td><td>S{e.semester}</td><td className="num">{e.score}</td><td>{e.sustainability === null ? "" : e.sustainability ? "Sí" : "No"}</td></tr>)}</tbody>
          </table>
          <form action={A.addEvaluation.bind(null, id)} className="flex gap-1">
            <input name="year" type="number" className="input" placeholder="Año" defaultValue={new Date().getFullYear()} />
            <select name="semester" className="input"><option value="1">S1</option><option value="2">S2</option></select>
            <input name="score" type="number" step="any" className="input" placeholder="Nota" />
            <button className="btn-secondary btn-sm">+</button>
          </form>
        </section>
        <section className="card space-y-2">
          <h2 className="h2">Reclamos y penalizaciones</h2>
          <ul className="space-y-1 text-sm">
            {s.incidents.map((i) => (
              <li key={i.id} className={i.open ? "" : "text-gray-400 line-through"}>
                {i.date.toISOString().slice(0, 10)} · {i.type === "CLAIM" ? "Reclamo" : "Penalización"} · impacto {i.impact} {i.amount ? `· $${i.amount}` : ""} — {i.description}
                <form className="inline" action={A.toggleIncident.bind(null, id, i.id)}><button className="ml-1 text-xs underline">{i.open ? "cerrar" : "reabrir"}</button></form>
              </li>
            ))}
          </ul>
          <form action={A.addIncident.bind(null, id)} className="grid grid-cols-2 gap-1">
            <select name="type" className="input"><option value="CLAIM">Reclamo</option><option value="PENALTY">Penalización</option></select>
            <select name="impact" className="input"><option value="LOW">Bajo</option><option value="MEDIUM">Medio</option><option value="HIGH">Alto</option><option value="BLOCKED">Bloqueado</option></select>
            <input name="date" type="date" className="input" />
            <input name="amount" type="number" step="any" className="input" placeholder="Monto USD" />
            <input name="description" className="input col-span-2" placeholder="Descripción" />
            <button className="btn-secondary col-span-2">Registrar</button>
          </form>
          <p className="text-xs text-gray-500">Las incidencias abiertas sugieren la escala de Reclamos/Penalizaciones en la matriz.</p>
        </section>
      </div>
      <section className="card">
        <h2 className="h2 mb-2">Participación en licitaciones</h2>
        <table className="tbl"><thead><tr><th>Licitación</th><th>Fecha</th><th>Estado invitación</th></tr></thead>
          <tbody>{s.invitations.map((i) => <tr key={i.id}><td><Link className="text-brand underline" href={`/events/${i.eventId}`}>{i.event.code} – {i.event.title}</Link></td><td>{fmtDate(i.event.deadline, "es")}</td><td><Badge status={i.status} /></td></tr>)}</tbody>
        </table>
      </section>
    </div>
  );
}
