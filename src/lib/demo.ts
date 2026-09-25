// Solo para demostración: genera ofertas realistas de los proveedores invitados que aún no han ofertado.
// Valores basados en el patrón del Excel real de Perfiles (FOB ~670–700, flete ~110, seguro 5, financiamiento 5/15/30/40).
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { loadEvent, templateOf } from "./events";
import { audit } from "./audit";

function rng(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

const PROFILES = [
  { mill: "CAGCELIK", origin: "TURKEY", fob: 680, freight: 110, fin: { 35: 5, 60: 15, 90: 30, 120: 40 }, pay: "DEFERRED AFTER BL DATE" },
  { mill: "DEACERO", origin: "MEXICO", fob: 672, freight: 118, fin: { 35: 6, 60: 14 }, pay: "30% ANTICIPO, 70% CONTRA BL" },
  { mill: "HBIS", origin: "CHINA", fob: 655, freight: 135, fin: { 35: 4, 60: 12, 90: 26, 120: 38 }, pay: "L/C AT SIGHT / DEFERRED" },
];

export async function simulateBids(eventId: string, actor: string): Promise<number> {
  const ev = await loadEvent(eventId);
  if (!ev) throw new Error("Evento no encontrado");
  if (ev.status !== "OPEN") throw new Error("La licitación debe estar abierta");
  const t = templateOf(ev);
  const complianceKeys = t.fields.filter((f) => f.type === "OKNO").map((f) => f.key);
  const keys = new Set(t.fields.map((f) => f.key));
  let n = 0;
  for (const [idx, inv] of ev.invitations.entries()) {
    if (inv.status === "DECLINED" || inv.maxRound < ev.currentRound) continue;
    const existing = ev.bids.find((b) => b.invitationId === inv.id && b.round === ev.currentRound);
    if (existing?.status === "SUBMITTED") continue;
    const p = PROFILES[idx % PROFILES.length];
    const r = rng(`${ev.code}:${inv.supplierId}:${ev.currentRound}`);
    const lines = ev.items.map((it) => {
      const noOffer = r() < 0.1;
      const qty = r() < 0.15 ? Math.round(it.quantity * 0.5) : it.quantity;
      const fob = p.fob + Math.round((r() - 0.5) * 30) - (ev.currentRound - 1) * 8;
      const values: Record<string, string | null> = {};
      const bad = r() < 0.08;
      for (const k of complianceKeys) values[k] = bad && k === complianceKeys[0] ? "NO" : "OK";
      if (keys.has("comments")) values.comments = bad ? "Tolerancia dimensional fuera de rango en espesor mínimo" : null;
      if (keys.has("producer")) values.producer = p.mill;
      if (keys.has("mill1")) values.mill1 = p.mill;
      if (keys.has("origin")) values.origin = p.origin;
      if (keys.has("incoterm")) values.incoterm = ev.incoterm ?? "CIF CY";
      if (keys.has("paymentTerms")) values.paymentTerms = p.pay;
      if (keys.has("validity")) values.validity = ev.priceValidity?.toISOString().slice(0, 10) ?? "30 días";
      return {
        itemId: it.id,
        noOffer,
        offeredQty: noOffer ? null : qty,
        prices: { fob, freight: p.freight + Math.round(r() * 6), insurance: 5 },
        financing: Object.fromEntries(t.financingTerms.map((d) => [String(d), (p.fin as Record<number, number>)[d] ?? null])),
        values,
      };
    });
    const bid = await prisma.bid.upsert({
      where: { invitationId_round: { invitationId: inv.id, round: ev.currentRound } },
      update: {},
      create: { eventId: ev.id, invitationId: inv.id, round: ev.currentRound },
    });
    await prisma.$transaction([
      prisma.bidLine.deleteMany({ where: { bidId: bid.id } }),
      prisma.bidLine.createMany({
        data: lines.map((l) => ({ ...l, bidId: bid.id, prices: l.prices as Prisma.InputJsonValue, financing: l.financing as Prisma.InputJsonValue, values: l.values as Prisma.InputJsonValue })),
      }),
      prisma.bid.update({
        where: { id: bid.id },
        data: { status: "SUBMITTED", submittedAt: new Date(), version: bid.version + 1, source: "WEB", paymentTerms: p.pay, origin: p.origin, incoterm: ev.incoterm, comments: "Oferta simulada (demo)" },
      }),
      prisma.invitation.update({ where: { id: inv.id }, data: { status: "SUBMITTED", viewedAt: inv.viewedAt ?? new Date() } }),
    ]);
    await audit(actor, "bid.simulated", "Invitation", inv.id, { round: ev.currentRound });
    n++;
  }
  return n;
}
