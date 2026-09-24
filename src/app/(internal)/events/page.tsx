import Link from "next/link";
import { prisma } from "@/lib/db";
import { Badge, Empty } from "@/components/ui";
import { fmtDate } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function EventsPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const { status, q } = await searchParams;
  const events = await prisma.event.findMany({
    where: {
      ...(status ? { status: status as never } : {}),
      ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { code: { contains: q, mode: "insensitive" } }, { family: { contains: q, mode: "insensitive" } }] } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: { template: true, invitations: true, bids: { select: { invitationId: true, status: true } }, _count: { select: { items: true } } },
  });
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="h1">Licitaciones</h1>
        <Link href="/events/new" className="btn">+ Nueva licitación</Link>
      </div>
      <form className="flex gap-2">
        <input name="q" defaultValue={q} placeholder="Buscar código, título o familia" className="input max-w-xs" />
        <select name="status" defaultValue={status ?? ""} className="input max-w-44">
          <option value="">Todos los estados</option>
          <option value="DRAFT">Borrador</option>
          <option value="OPEN">Abierta</option>
          <option value="CLOSED">Cerrada</option>
          <option value="AWARDED">Adjudicada</option>
          <option value="CANCELLED">Cancelada</option>
        </select>
        <button className="btn-secondary">Filtrar</button>
      </form>
      <div className="card">
        {events.length === 0 ? <Empty>No hay licitaciones.</Empty> : (
          <table className="tbl">
            <thead><tr><th>Código</th><th>Título</th><th>Familia</th><th>Plantilla</th><th>Estado</th><th>Ronda</th><th>Cierre</th><th className="num">SKUs</th><th className="num">Ofertas</th><th>Sellada</th></tr></thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <td><Link className="text-brand underline" href={`/events/${e.id}`}>{e.code}</Link></td>
                  <td>{e.title}</td>
                  <td>{e.family}</td>
                  <td>{e.template.name}</td>
                  <td><Badge status={e.status} /></td>
                  <td>{e.currentRound}</td>
                  <td>{fmtDate(e.deadline, "es", e.timezone, true)}</td>
                  <td className="num">{e._count.items}</td>
                  <td className="num">{new Set(e.bids.filter((b) => b.status === "SUBMITTED").map((b) => b.invitationId)).size} / {e.invitations.length}</td>
                  <td>{e.sealed ? "Sí" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
