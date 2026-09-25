"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { back } from "@/lib/forms";
import { comparison, loadEvent } from "@/lib/events";
import { sendMail } from "@/lib/mail";
import { awardEmail } from "@/lib/emails";
import { termLabel } from "@/lib/pricing";

export interface AwardLineRow {
  itemId: string;
  supplierId: string;
  bidLineId?: string | null;
  tons: number;
  termDays: number;
  unitPrice: number;
}

/** Propuesta simple: mejor precio por SKU al plazo elegido, hasta la cantidad solicitada (split si el mejor no cubre). */
export async function proposeBestPrice(eventId: string, fd: FormData) {
  const u = await requireUser(["BUYER"]);
  const term = Number(fd.get("term") ?? 0);
  const ev = await loadEvent(eventId);
  if (!ev || (ev.sealed && ev.status === "OPEN")) back(`/events/${eventId}/award`, undefined, "Ofertas selladas o evento inexistente");
  const c = comparison(ev, ev.currentRound, term);
  const lines: AwardLineRow[] = [];
  for (const r of c.rows) {
    let remaining = r.quantity;
    const cells = [...r.cells.values()].filter((x) => x.price).sort((a, b) => a.price! - b.price!);
    for (const cell of cells) {
      if (remaining <= 0) break;
      const tons = Math.min(remaining, cell.offeredQty);
      if (tons <= 0) continue;
      const inv = ev.invitations.find((i) => i.id === cell.invitationId)!;
      lines.push({ itemId: r.itemId, supplierId: inv.supplierId, bidLineId: cell.bidLineId, tons, termDays: term, unitPrice: cell.price! });
      remaining -= tons;
    }
  }
  await prisma.award.deleteMany({ where: { eventId, status: "DRAFT" } });
  await prisma.award.create({ data: { eventId, notes: `Propuesta mejor precio ${termLabel(term)}`, lines: { create: lines } } });
  await audit(u.email, "award.proposed", "Event", eventId, { term, lines: lines.length });
  back(`/events/${eventId}/award`, "Propuesta generada");
}

export async function saveAward(awardId: string, lines: AwardLineRow[], notes: string | null) {
  const u = await requireUser(["BUYER", "COMMITTEE"]);
  const a = await prisma.award.findUniqueOrThrow({ where: { id: awardId } });
  if (a.status !== "DRAFT") return { error: "La adjudicación aprobada no se puede editar" };
  await prisma.$transaction([
    prisma.awardLine.deleteMany({ where: { awardId } }),
    prisma.award.update({ where: { id: awardId }, data: { notes } }),
    prisma.awardLine.createMany({ data: lines.filter((l) => l.tons > 0 && l.supplierId).map((l) => ({ ...l, awardId, bidLineId: l.bidLineId ?? null })) }),
  ]);
  await audit(u.email, "award.saved", "Award", awardId, { lines: lines.length });
  revalidatePath(`/events/${a.eventId}/award`);
  return { ok: true };
}

export async function approveAward(eventId: string, awardId: string) {
  const u = await requireUser(["COMMITTEE", "BUYER"]);
  await prisma.award.update({ where: { id: awardId }, data: { status: "APPROVED", approvedBy: u.name, approvedAt: new Date() } });
  await prisma.event.update({ where: { id: eventId }, data: { status: "AWARDED" } });
  await audit(u.email, "award.approved", "Award", awardId);
  back(`/events/${eventId}/award`, "Adjudicación aprobada");
}

export async function reopenAward(eventId: string, awardId: string) {
  const u = await requireUser(["COMMITTEE", "BUYER"]);
  await prisma.award.update({ where: { id: awardId }, data: { status: "DRAFT", approvedAt: null, approvedBy: null } });
  await prisma.event.update({ where: { id: eventId }, data: { status: "CLOSED" } });
  await audit(u.email, "award.reopened", "Award", awardId);
  back(`/events/${eventId}/award`, "Adjudicación reabierta");
}

export async function notifyAward(eventId: string, awardId: string) {
  const u = await requireUser(["BUYER"]);
  const ev = await loadEvent(eventId);
  const a = await prisma.award.findUniqueOrThrow({ where: { id: awardId }, include: { lines: { include: { item: true } } } });
  if (!ev || a.status !== "APPROVED") back(`/events/${eventId}/award`, undefined, "Apruebe la adjudicación primero");
  const participants = ev.invitations.filter((i) => ev.bids.some((b) => b.invitationId === i.id && b.status === "SUBMITTED"));
  for (const inv of participants) {
    const mine = a.lines.filter((l) => l.supplierId === inv.supplierId);
    const { subject, html } = awardEmail(
      { ...ev, companyName: ev.company.name },
      inv.supplier.name,
      inv.supplier.locale,
      mine.map((l) => ({ sku: l.item.gCode, description: l.item.description, tons: l.tons, price: l.unitPrice, term: termLabel(l.termDays, inv.supplier.locale === "en" ? "en" : "es") })),
    );
    await sendMail({ to: inv.supplier.contacts.map((c) => c.email), subject, html, kind: "award", eventId });
  }
  await prisma.award.update({ where: { id: awardId }, data: { notifiedAt: new Date() } });
  await prisma.priceHistory.createMany({
    data: a.lines.map((l) => ({ family: ev.family, itemCode: l.item.gCode, supplierName: ev.invitations.find((i) => i.supplierId === l.supplierId)?.supplier.name ?? null, price: l.unitPrice, tons: l.tons, date: new Date(), source: `Adjudicación ${ev.code}` })),
  });
  await audit(u.email, "award.notified", "Award", awardId, { suppliers: participants.length });
  back(`/events/${eventId}/award`, `Resultados notificados a ${participants.length} proveedores`);
}
