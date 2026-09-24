"use server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { resolveToken, canBid } from "@/lib/portal";
import { audit } from "@/lib/audit";
import { templateOf, componentKeys } from "@/lib/events";
import { parseOfferWorkbook } from "@/lib/excel/parse";
import { saveFile } from "@/lib/storage";
import { sendMail, appUrl } from "@/lib/mail";
import { receiptEmail } from "@/lib/emails";
import { basePrice, num } from "@/lib/pricing";
import { t as tr } from "@/lib/i18n";

export interface LineInput {
  itemId: string;
  noOffer: boolean;
  offeredQty: number | null;
  prices: Record<string, number | null>;
  financing: Record<string, number | null>;
  values: Record<string, string | number | null>;
}

async function ctx(token: string) {
  const r = await resolveToken(token);
  if (!r) throw new Error("Enlace inválido / invalid link");
  if (!canBid(r.ev, r.inv)) throw new Error(tr(r.inv.supplier.locale).closed);
  return r;
}

async function getOrCreateBid(eventId: string, invitationId: string, round: number) {
  return prisma.bid.upsert({
    where: { invitationId_round: { invitationId, round } },
    update: {},
    create: { eventId, invitationId, round },
  });
}

async function storeLines(bidId: string, validItemIds: Set<string>, lines: LineInput[]) {
  const ops = lines
    .filter((l) => validItemIds.has(l.itemId))
    .map((l) => {
      const data = {
        noOffer: l.noOffer,
        offeredQty: l.noOffer ? null : num(l.offeredQty),
        prices: l.prices as Prisma.InputJsonValue,
        financing: l.financing as Prisma.InputJsonValue,
        values: l.values as Prisma.InputJsonValue,
      };
      return prisma.bidLine.upsert({ where: { bidId_itemId: { bidId, itemId: l.itemId } }, update: data, create: { ...data, bidId, itemId: l.itemId } });
    });
  await prisma.$transaction(ops);
}

function validate(lines: LineInput[], required: string[], keys: string[], locale: string): string | null {
  const offered = lines.filter((l) => !l.noOffer && (num(l.offeredQty) ?? 0) > 0);
  if (!offered.length) return locale === "en" ? "Quote at least one SKU (offered quantity and price)." : "Cotice al menos un SKU (cantidad ofertada y precio).";
  for (const l of offered) {
    if (!basePrice({ prices: l.prices, financing: {}, offeredQty: l.offeredQty }, keys)) return locale === "en" ? "Every quoted line needs a price." : "Toda línea cotizada necesita precio.";
    if (required.some((k) => l.values[k] === null || l.values[k] === undefined || l.values[k] === "")) return tr(locale).missingRequired;
  }
  return null;
}

export async function saveBid(token: string, lines: LineInput[], header: Record<string, string | null>, submit: boolean): Promise<{ ok?: boolean; error?: string }> {
  try {
    const { inv, ev } = await ctx(token);
    const t = templateOf(ev);
    const required = t.fields.filter((f) => f.required && f.section !== "SKU_SPEC").map((f) => f.key);
    if (submit) {
      const err = validate(lines, required, componentKeys(t), inv.supplier.locale);
      if (err) return { error: err };
    }
    const bid = await getOrCreateBid(ev.id, inv.id, ev.currentRound);
    await storeLines(bid.id, new Set(ev.items.map((i) => i.id)), lines);
    const version = submit ? bid.version + 1 : bid.version;
    await prisma.bid.update({
      where: { id: bid.id },
      data: {
        paymentTerms: header.paymentTerms ?? null,
        origin: header.origin ?? null,
        incoterm: header.incoterm ?? null,
        validity: header.validity ?? null,
        comments: header.comments ?? null,
        source: "WEB",
        ...(submit ? { status: "SUBMITTED", submittedAt: new Date(), version } : {}),
      },
    });
    if (submit) {
      await prisma.invitation.update({ where: { id: inv.id }, data: { status: "SUBMITTED" } });
      await audit(`proveedor:${inv.supplier.name}`, "bid.submitted", "Invitation", inv.id, { round: ev.currentRound, version, lines: lines.filter((l) => !l.noOffer).length, source: "WEB" });
      const { subject, html } = receiptEmail({ ...ev, companyName: ev.company.name }, inv.supplier.name, appUrl(`/portal/${token}`), inv.supplier.locale, version);
      await sendMail({ to: inv.supplier.contacts.map((c) => c.email), subject, html, kind: "receipt", eventId: ev.id });
    }
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function uploadExcel(token: string, fd: FormData): Promise<{ ok?: boolean; error?: string; warnings?: string[]; lines?: LineInput[] }> {
  try {
    const { inv, ev } = await ctx(token);
    const file = fd.get("file") as File | null;
    if (!file?.size) return { error: "Archivo vacío / empty file" };
    const t = templateOf(ev);
    const buf = Buffer.from(await file.arrayBuffer());
    const parsed = await parseOfferWorkbook(buf, t);
    if (parsed.meta.eventCode && parsed.meta.eventCode !== ev.code) return { error: `El archivo es de otra licitación (${parsed.meta.eventCode}) / file belongs to another tender` };
    const byG = new Map(ev.items.map((i) => [i.gCode.trim(), i.id]));
    const lines: LineInput[] = [];
    const warnings = [...parsed.warnings];
    for (const l of parsed.lines) {
      const itemId = byG.get(l.gCode);
      if (!itemId) {
        warnings.push(`SKU no solicitado ignorado: ${l.gCode}`);
        continue;
      }
      lines.push({ itemId, noOffer: l.noOffer, offeredQty: l.offeredQty, prices: l.prices, financing: l.financing, values: l.values });
    }
    const bid = await getOrCreateBid(ev.id, inv.id, ev.currentRound);
    await storeLines(bid.id, new Set(ev.items.map((i) => i.id)), lines);
    await prisma.bid.update({ where: { id: bid.id }, data: { source: "EXCEL" } });
    const saved = await saveFile(`bids/${bid.id}`, file);
    await prisma.bidDocument.create({ data: { bidId: bid.id, kind: "excel", name: saved.name, path: saved.path, size: saved.size, mime: saved.mime } });
    await audit(`proveedor:${inv.supplier.name}`, "bid.excel_uploaded", "Invitation", inv.id, { lines: lines.length, warnings: warnings.length });
    return { ok: true, warnings, lines };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function uploadDoc(token: string, fd: FormData): Promise<{ ok?: boolean; error?: string }> {
  try {
    const { inv, ev } = await ctx(token);
    const kind = String(fd.get("kind") ?? "other");
    const file = fd.get("file") as File | null;
    if (!file?.size) return { error: "Archivo vacío / empty file" };
    const bid = await getOrCreateBid(ev.id, inv.id, ev.currentRound);
    const saved = await saveFile(`bids/${bid.id}`, file);
    await prisma.bidDocument.create({ data: { bidId: bid.id, kind, name: saved.name, path: saved.path, size: saved.size, mime: saved.mime } });
    await audit(`proveedor:${inv.supplier.name}`, "bid.document", "Invitation", inv.id, { kind, name: saved.name });
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function decline(token: string, reason: string): Promise<{ ok?: boolean; error?: string }> {
  try {
    const { inv } = await ctx(token);
    await prisma.invitation.update({ where: { id: inv.id }, data: { status: "DECLINED", declinedReason: reason || null } });
    await audit(`proveedor:${inv.supplier.name}`, "invitation.declined", "Invitation", inv.id, { reason });
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
