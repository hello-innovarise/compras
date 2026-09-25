// Servicios de licitación: publicar, rondas, cierre, recordatorios, comparativo.
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { toTemplateDef, type TemplateDef } from "./templates";
import { newToken, hashToken } from "./tokens";
import { sendMail, appUrl } from "./mail";
import { invitationEmail, reminderEmail } from "./emails";
import { generateOfferWorkbook } from "./excel/generate";
import type { ExcelEventInfo, ExcelBidLine } from "./excel/types";
import { audit } from "./audit";
import { basePrice, num, termPrice, type LinePricing } from "./pricing";

export const eventInclude = {
  company: true,
  template: { include: { fields: true } },
  items: { orderBy: { order: "asc" } },
  documents: true,
  rounds: { orderBy: { number: "asc" } },
  invitations: { include: { supplier: { include: { contacts: true } } }, orderBy: { createdAt: "asc" } },
  bids: { include: { lines: true, documents: true } },
} satisfies Prisma.EventInclude;

export type FullEvent = Prisma.EventGetPayload<{ include: typeof eventInclude }>;
export type FullBid = FullEvent["bids"][number];

export async function loadEvent(id: string): Promise<FullEvent | null> {
  await closeDueEvents();
  return prisma.event.findUnique({ where: { id }, include: eventInclude });
}

export function templateOf(ev: { template: Parameters<typeof toTemplateDef>[0] }): TemplateDef {
  return toTemplateDef(ev.template);
}

export function componentKeys(t: TemplateDef) {
  return t.priceComponents.map((p) => p.key);
}

export function excelInfo(ev: FullEvent, round = ev.currentRound): ExcelEventInfo {
  return {
    code: ev.code,
    title: ev.title,
    companyName: ev.company.name,
    material: ev.material,
    family: ev.family,
    shipmentDate: ev.shipmentDate,
    etaDays: ev.etaDays,
    incoterm: ev.incoterm,
    destination: ev.destination,
    port: ev.port,
    freeDays: ev.freeDays,
    containerTons: ev.containerTons ?? ev.template.containerTons,
    deadline: ev.deadline,
    timezone: ev.timezone,
    conditions: ev.conditions,
    round,
  };
}

/** Oferta vigente de cada invitación para una ronda: la de mayor ronda <= round, enviada. */
export function effectiveBids(ev: FullEvent, round = ev.currentRound, includeDrafts = false): Map<string, FullBid> {
  const out = new Map<string, FullBid>();
  for (const inv of ev.invitations) {
    const bids = ev.bids
      .filter((b) => b.invitationId === inv.id && b.round <= round && (includeDrafts || b.status === "SUBMITTED"))
      .sort((a, b) => b.round - a.round);
    if (bids[0]) out.set(inv.id, bids[0]);
  }
  return out;
}

export function bidLinesForExcel(bid?: FullBid | null): ExcelBidLine[] {
  return (bid?.lines ?? []).map((l) => ({
    itemId: l.itemId,
    noOffer: l.noOffer,
    offeredQty: l.offeredQty,
    prices: l.prices as Record<string, unknown>,
    financing: l.financing as Record<string, unknown>,
    values: l.values as Record<string, unknown>,
  }));
}

export async function supplierWorkbook(ev: FullEvent, invitationId: string): Promise<Buffer> {
  const inv = ev.invitations.find((i) => i.id === invitationId)!;
  const own = ev.bids.filter((b) => b.invitationId === invitationId).sort((a, b) => b.round - a.round)[0];
  return generateOfferWorkbook({
    event: excelInfo(ev),
    template: templateOf(ev),
    items: ev.items.map((i) => ({ ...i, specs: i.specs as Record<string, unknown> })),
    supplierName: inv.supplier.name,
    invitationId,
    lines: bidLinesForExcel(own),
  });
}

function evInfoForMail(ev: FullEvent) {
  return { ...ev, companyName: ev.company.name };
}

export async function sendInvitation(ev: FullEvent, invitationId: string, actor: string) {
  const inv = ev.invitations.find((i) => i.id === invitationId);
  if (!inv) return;
  const token = newToken();
  await prisma.invitation.update({ where: { id: inv.id }, data: { tokenHash: hashToken(token), status: inv.status === "PENDING" ? "SENT" : inv.status } });
  const link = appUrl(`/portal/${token}`);
  const { subject, html } = invitationEmail(evInfoForMail(ev), inv.supplier.name, link, inv.supplier.locale, ev.currentRound);
  const xlsx = await supplierWorkbook(ev, inv.id);
  await sendMail({
    to: inv.supplier.contacts.map((c) => c.email),
    subject,
    html,
    kind: "invitation",
    eventId: ev.id,
    attachments: [{ filename: `${ev.code}-${inv.supplier.name.replace(/[^\w]+/g, "_")}.xlsx`, content: xlsx }],
  });
  await audit(actor, "invitation.sent", "Invitation", inv.id, { supplier: inv.supplier.name, round: ev.currentRound });
  return link;
}

export async function publishEvent(id: string, actor: string) {
  const ev = await loadEvent(id);
  if (!ev) throw new Error("Evento no encontrado");
  if (ev.status !== "DRAFT") throw new Error("El evento ya fue publicado");
  if (!ev.items.length) throw new Error("Agregue al menos un SKU");
  if (!ev.invitations.length) throw new Error("Invite al menos un proveedor");
  await prisma.$transaction([
    prisma.round.upsert({
      where: { eventId_number: { eventId: id, number: 1 } },
      update: { deadline: ev.deadline },
      create: { eventId: id, number: 1, deadline: ev.deadline },
    }),
    prisma.event.update({ where: { id }, data: { status: "OPEN", publishedAt: new Date(), currentRound: 1 } }),
  ]);
  const fresh = (await loadEvent(id))!;
  for (const inv of fresh.invitations) await sendInvitation(fresh, inv.id, actor);
  await audit(actor, "event.published", "Event", id);
}

export async function closeEvent(id: string, actor: string) {
  const ev = await prisma.event.findUnique({ where: { id } });
  if (!ev || ev.status !== "OPEN") return;
  await prisma.$transaction([
    prisma.event.update({ where: { id }, data: { status: "CLOSED", closedAt: new Date() } }),
    prisma.round.updateMany({ where: { eventId: id, number: ev.currentRound }, data: { closedAt: new Date() } }),
  ]);
  await audit(actor, "event.closed", "Event", id, { round: ev.currentRound });
}

export async function openNewRound(id: string, invitationIds: string[], deadline: Date, note: string | null, actor: string) {
  const ev = await loadEvent(id);
  if (!ev) throw new Error("Evento no encontrado");
  if (ev.status !== "CLOSED") throw new Error("Solo se puede abrir una ronda con el evento cerrado");
  if (!invitationIds.length) throw new Error("Seleccione proveedores");
  const n = ev.currentRound + 1;
  await prisma.$transaction([
    prisma.round.create({ data: { eventId: id, number: n, deadline, note } }),
    prisma.event.update({ where: { id }, data: { status: "OPEN", currentRound: n, deadline, closedAt: null } }),
    prisma.invitation.updateMany({ where: { id: { in: invitationIds } }, data: { maxRound: n, remindersSent: [] } }),
  ]);
  const fresh = (await loadEvent(id))!;
  for (const invId of invitationIds) await sendInvitation(fresh, invId, actor);
  await audit(actor, "round.opened", "Event", id, { round: n, suppliers: invitationIds.length, note });
}

/** Cierra las licitaciones cuya fecha límite ya pasó. Se llama también al abrir pantallas (entornos sin worker, ej. Vercel). */
export async function closeDueEvents(now = new Date()): Promise<number> {
  const due = await prisma.event.findMany({ where: { status: "OPEN", deadline: { lte: now } }, select: { id: true } });
  for (const e of due) await closeEvent(e.id, "sistema");
  return due.length;
}

/** Tarea programada: cierra eventos vencidos y envía recordatorios. */
export async function runScheduler(now = new Date()) {
  const due = { length: await closeDueEvents(now) };

  const hours = (process.env.REMINDER_HOURS || "48,4").split(",").map(Number).filter((h) => h > 0);
  const open = await prisma.event.findMany({ where: { status: "OPEN" }, include: eventInclude });
  let sent = 0;
  for (const ev of open) {
    const left = (ev.deadline.getTime() - now.getTime()) / 3_600_000;
    for (const inv of ev.invitations) {
      if (inv.maxRound < ev.currentRound || inv.status === "DECLINED") continue;
      const submitted = ev.bids.some((b) => b.invitationId === inv.id && b.round === ev.currentRound && b.status === "SUBMITTED");
      if (submitted) continue;
      const done = (inv.remindersSent as string[]) ?? [];
      const h = hours.filter((x) => left <= x && !done.includes(`${ev.currentRound}:${x}`)).sort((a, b) => a - b)[0];
      if (h === undefined) continue;
      const token = newToken();
      const all = hours.filter((x) => left <= x).map((x) => `${ev.currentRound}:${x}`);
      await prisma.invitation.update({ where: { id: inv.id }, data: { tokenHash: hashToken(token), remindersSent: [...new Set([...done, ...all])] } });
      const { subject, html } = reminderEmail({ ...ev, companyName: ev.company.name }, inv.supplier.name, appUrl(`/portal/${token}`), inv.supplier.locale, h);
      await sendMail({ to: inv.supplier.contacts.map((c) => c.email), subject, html, kind: "reminder", eventId: ev.id });
      sent++;
    }
  }
  return { closed: due.length, reminders: sent };
}

// ---------- Comparativo ----------
export interface CompCell {
  invitationId: string;
  supplierName: string;
  bidLineId: string;
  offeredQty: number;
  price: number | null;
  base: number | null;
  total: number | null;
  noCompliance: string[];
  shortQty: boolean;
  comments?: string | null;
  best: boolean;
}

export interface CompRow {
  itemId: string;
  gCode: string;
  description: string;
  quantity: number;
  cells: Map<string, CompCell>;
  bestPrice: number | null;
}

export function comparison(ev: FullEvent, round: number, term: number) {
  const t = templateOf(ev);
  const keys = componentKeys(t);
  const complianceKeys = t.fields.filter((f) => f.type === "OKNO").map((f) => f.key);
  const bids = effectiveBids(ev, round);
  const suppliers = ev.invitations.filter((i) => bids.has(i.id)).map((i) => ({ invitationId: i.id, name: i.supplier.name, supplierId: i.supplierId, bid: bids.get(i.id)! }));
  const rows: CompRow[] = ev.items.map((it) => {
    const cells = new Map<string, CompCell>();
    for (const s of suppliers) {
      const l = s.bid.lines.find((x) => x.itemId === it.id);
      if (!l || l.noOffer) continue;
      const lp: LinePricing = { offeredQty: l.offeredQty, prices: l.prices as Record<string, number>, financing: l.financing as Record<string, number> };
      const price = termPrice(lp, keys, term);
      const values = l.values as Record<string, unknown>;
      const q = num(l.offeredQty) ?? 0;
      cells.set(s.invitationId, {
        invitationId: s.invitationId,
        supplierName: s.name,
        bidLineId: l.id,
        offeredQty: q,
        price,
        base: basePrice(lp, keys),
        total: price !== null ? price * q : null,
        noCompliance: complianceKeys.filter((k) => values[k] === "NO"),
        shortQty: q < it.quantity,
        comments: (values.comments as string) ?? null,
        best: false,
      });
    }
    const prices = [...cells.values()].map((c) => c.price).filter((p): p is number => p !== null && p > 0);
    const best = prices.length ? Math.min(...prices) : null;
    for (const c of cells.values()) c.best = best !== null && c.price === best;
    return { itemId: it.id, gCode: it.gCode, description: it.description, quantity: it.quantity, cells, bestPrice: best };
  });
  const summary = suppliers.map((s) => {
    let qty = 0;
    let total = 0;
    let covered = 0;
    let bestCount = 0;
    for (const r of rows) {
      const c = r.cells.get(s.invitationId);
      if (c && c.price) {
        qty += c.offeredQty;
        total += c.total ?? 0;
        covered++;
        if (c.best) bestCount++;
      }
    }
    return { ...s, qty, total, weighted: qty ? total / qty : null, covered, bestCount, coverage: rows.length ? covered / rows.length : 0 };
  });
  return { template: t, suppliers, rows, summary, terms: [0, ...t.financingTerms] };
}
