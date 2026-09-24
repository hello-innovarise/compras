import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { loadEvent, effectiveBids, templateOf, componentKeys } from "@/lib/events";
import { termPrice, termLabel, num } from "@/lib/pricing";
import { Badge, Empty, Flash } from "@/components/ui";
import { fmtDate } from "@/lib/i18n";
import { AwardEditor } from "./AwardEditor";
import * as A from "./actions";

export const dynamic = "force-dynamic";

export default async function AwardPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const ev = await loadEvent(id);
  if (!ev) notFound();
  const t = templateOf(ev);
  const keys = componentKeys(t);
  const terms = [0, ...t.financingTerms];
  const award = await prisma.award.findFirst({ where: { eventId: id }, orderBy: { createdAt: "desc" }, include: { lines: true } });
  const matrices = await prisma.evaluationMatrix.findMany({ where: { eventId: id }, select: { id: true, name: true } });
  const sealed = ev.sealed && ev.status === "OPEN";
  const bids = effectiveBids(ev);
  const offers: Record<string, { supplierId: string; supplierName: string; bidLineId: string; offered: number; prices: Record<number, number | null> }[]> = {};
  for (const it of ev.items) {
    offers[it.id] = [];
    for (const inv of ev.invitations) {
      const l = bids.get(inv.id)?.lines.find((x) => x.itemId === it.id && !x.noOffer);
      if (!l) continue;
      const lp = { prices: l.prices as Record<string, number>, financing: l.financing as Record<string, number> };
      offers[it.id].push({ supplierId: inv.supplierId, supplierName: inv.supplier.name, bidLineId: l.id, offered: num(l.offeredQty) ?? 0, prices: Object.fromEntries(terms.map((x) => [x, termPrice(lp, keys, x)])) });
    }
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-sm text-gray-500"><Link className="underline" href={`/events/${id}`}>{ev.code}</Link> · Adjudicación</div>
          <h1 className="h1">{ev.title}</h1>
        </div>
        {award && <a className="btn-secondary" href={`/api/events/${id}/award`}>Excel de adjudicación (anexo contrato)</a>}
      </div>
      <Flash msg={sp.msg} error={sp.error} />
      {sealed ? (
        <div className="card"><Empty>🔒 Ofertas selladas hasta el cierre.</Empty></div>
      ) : (
        <>
          <div className="card flex flex-wrap items-center gap-3 text-sm">
            <form action={A.proposeBestPrice.bind(null, id)} className="flex items-center gap-2">
              <span>Propuesta rápida: mejor precio por SKU a</span>
              <select name="term" className="input max-w-36">{terms.map((x) => <option key={x} value={x}>{termLabel(x)}</option>)}</select>
              <button className="btn-secondary">Generar</button>
            </form>
            <span className="text-gray-500">o use la Torre de Compras (matriz de evaluación + escenarios de split):</span>
            {matrices.map((m) => <Link key={m.id} className="text-brand underline" href={`/torre/matrix/${m.id}`}>{m.name}</Link>)}
          </div>
          {!award ? (
            <div className="card"><Empty>Aún no hay adjudicación. Genere una propuesta o apruebe un escenario en la Torre.</Empty></div>
          ) : (
            <div className="card space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <Badge status={award.status} />
                {award.approvedAt && <span className="text-sm">Aprobada por {award.approvedBy} el {fmtDate(award.approvedAt, "es", ev.timezone, true)}</span>}
                {award.notifiedAt && <span className="text-sm text-green-700">Notificada {fmtDate(award.notifiedAt, "es", ev.timezone, true)}</span>}
                <div className="ml-auto flex gap-2">
                  {award.status === "DRAFT" && <form action={A.approveAward.bind(null, id, award.id)}><button className="btn">Aprobar adjudicación</button></form>}
                  {award.status === "APPROVED" && <form action={A.notifyAward.bind(null, id, award.id)}><button className="btn">Notificar a proveedores</button></form>}
                  {award.status === "APPROVED" && <form action={A.reopenAward.bind(null, id, award.id)}><button className="btn-secondary">Reabrir</button></form>}
                </div>
              </div>
              <AwardEditor
                key={award.id + award.lines.length}
                awardId={award.id}
                items={ev.items}
                offers={offers}
                terms={terms}
                initial={award.lines.map((l) => ({ itemId: l.itemId, supplierId: l.supplierId, bidLineId: l.bidLineId, tons: l.tons, termDays: l.termDays, unitPrice: l.unitPrice }))}
                notes={award.notes ?? ""}
                locked={award.status !== "DRAFT"}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
