import Link from "next/link";
import { prisma } from "@/lib/db";
import { Badge, Empty } from "@/components/ui";
import { fmtDate } from "@/lib/i18n";
import { closeDueEvents } from "@/lib/events";

export const dynamic = "force-dynamic";

export default async function Home() {
  await closeDueEvents();
  const [events, sessions, counts] = await Promise.all([
    prisma.event.findMany({ where: { status: { in: ["DRAFT", "OPEN", "CLOSED"] } }, orderBy: { deadline: "asc" }, include: { invitations: true, bids: true, _count: { select: { items: true } } }, take: 20 }),
    prisma.committeeSession.findMany({ where: { status: { not: "APPROVED" } }, orderBy: { date: "asc" }, take: 5 }),
    prisma.event.groupBy({ by: ["status"], _count: true }),
  ]);
  const c = (s: string) => counts.find((x) => x.status === s)?._count ?? 0;
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="h1">Inicio</h1>
        <Link href="/events/new" className="btn">+ Nueva licitación</Link>
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[["Borradores", c("DRAFT")], ["Abiertas", c("OPEN")], ["Cerradas (por adjudicar)", c("CLOSED")], ["Adjudicadas", c("AWARDED")]].map(([l, v]) => (
          <div key={String(l)} className="card">
            <div className="text-xs uppercase text-gray-500">{l}</div>
            <div className="text-3xl font-bold text-brand">{v}</div>
          </div>
        ))}
      </div>
      <section className="card">
        <h2 className="h2 mb-3">Licitaciones activas</h2>
        {events.length === 0 ? (
          <Empty>No hay licitaciones activas.</Empty>
        ) : (
          <table className="tbl">
            <thead>
              <tr><th>Código</th><th>Título</th><th>Estado</th><th>Ronda</th><th>Cierre</th><th className="num">SKUs</th><th className="num">Ofertas</th></tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <td><Link className="text-brand underline" href={`/events/${e.id}`}>{e.code}</Link></td>
                  <td>{e.title}</td>
                  <td><Badge status={e.status} /></td>
                  <td>{e.currentRound}</td>
                  <td>{fmtDate(e.deadline, "es", e.timezone, true)}</td>
                  <td className="num">{e._count.items}</td>
                  <td className="num">{new Set(e.bids.filter((b) => b.status === "SUBMITTED").map((b) => b.invitationId)).size} / {e.invitations.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <section className="card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="h2">Próximas sesiones de Torre de Compras</h2>
          <Link href="/torre" className="btn-secondary">Ver todas</Link>
        </div>
        {sessions.length === 0 ? <Empty>Sin sesiones programadas.</Empty> : (
          <ul className="space-y-1 text-sm">
            {sessions.map((s) => (
              <li key={s.id}><Link className="text-brand underline" href={`/torre/${s.id}`}>{s.name}</Link> · {fmtDate(s.date, "es")} <Badge status={s.status} /></li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
