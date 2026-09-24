"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { back, datef, errMsg, localDateTime, numf, str } from "@/lib/forms";
import { closeEvent, loadEvent, openNewRound, publishEvent, sendInvitation, templateOf } from "@/lib/events";
import { parseItemsWorkbook } from "@/lib/excel/parse";
import { saveFile, removeFile } from "@/lib/storage";
import { hashToken, newToken } from "@/lib/tokens";

function eventData(fd: FormData) {
  const tz = str(fd, "timezone") ?? "America/Guatemala";
  const dl = str(fd, "deadline");
  return {
    title: str(fd, "title") ?? "Sin título",
    code: (str(fd, "code") ?? "").toUpperCase(),
    family: str(fd, "family") ?? "General",
    material: str(fd, "material"),
    timezone: tz,
    deadline: dl ? localDateTime(dl, tz) : new Date(),
    committeeDate: datef(fd, "committeeDate"),
    priceValidity: datef(fd, "priceValidity"),
    shipmentDate: datef(fd, "shipmentDate"),
    etaDays: numf(fd, "etaDays"),
    incoterm: str(fd, "incoterm"),
    destination: str(fd, "destination"),
    port: str(fd, "port"),
    freeDays: numf(fd, "freeDays"),
    containerTons: numf(fd, "containerTons"),
    surveyor: str(fd, "surveyor"),
    introEs: str(fd, "introEs"),
    introEn: str(fd, "introEn"),
    conditions: str(fd, "conditions"),
    sealed: fd.get("sealed") === "on",
  };
}

export async function createEvent(fd: FormData) {
  const u = await requireUser(["BUYER"]);
  const data = eventData(fd);
  const templateId = str(fd, "templateId")!;
  const company = await prisma.company.findFirst();
  const tpl = await prisma.template.findUniqueOrThrow({ where: { id: templateId } });
  let id: string;
  try {
    const ev = await prisma.event.create({ data: { ...data, containerTons: data.containerTons ?? tpl.containerTons, templateId, companyId: company!.id, createdById: u.id } });
    id = ev.id;
  } catch (e) {
    back("/events/new", undefined, `No se pudo crear: ${errMsg(e).includes("Unique") ? "el código ya existe" : errMsg(e)}`);
  }
  await audit(u.email, "event.created", "Event", id, { code: data.code });
  redirect(`/events/${id}?tab=items`);
}

export async function updateEvent(id: string, fd: FormData) {
  const u = await requireUser(["BUYER"]);
  const ev = await prisma.event.findUniqueOrThrow({ where: { id } });
  const data = eventData(fd);
  if (ev.status !== "DRAFT") {
    // Evento publicado: solo se permiten cambios que no alteran las reglas de la oferta
    await prisma.event.update({ where: { id }, data: { title: data.title, conditions: data.conditions, committeeDate: data.committeeDate, introEs: data.introEs, introEn: data.introEn } });
  } else {
    const templateId = str(fd, "templateId");
    await prisma.event.update({ where: { id }, data: { ...data, ...(templateId ? { templateId } : {}) } });
  }
  await audit(u.email, "event.updated", "Event", id);
  back(`/events/${id}`, "Evento actualizado");
}

export async function duplicateEvent(id: string) {
  const u = await requireUser(["BUYER"]);
  const ev = await loadEvent(id);
  if (!ev) back("/events", undefined, "No encontrado");
  const code = `${ev.code}-COPIA-${Date.now().toString(36).toUpperCase()}`;
  const copy = await prisma.event.create({
    data: {
      code,
      title: `${ev.title} (copia)`,
      family: ev.family,
      material: ev.material,
      companyId: ev.companyId,
      templateId: ev.templateId,
      createdById: u.id,
      sealed: ev.sealed,
      deadline: new Date(Date.now() + 7 * 86400000),
      timezone: ev.timezone,
      etaDays: ev.etaDays,
      incoterm: ev.incoterm,
      destination: ev.destination,
      port: ev.port,
      freeDays: ev.freeDays,
      containerTons: ev.containerTons,
      surveyor: ev.surveyor,
      conditions: ev.conditions,
      introEs: ev.introEs,
      introEn: ev.introEn,
      items: { create: ev.items.map((i) => ({ vtaCode: i.vtaCode, gCode: i.gCode, description: i.description, quantity: i.quantity, specs: i.specs as Prisma.InputJsonValue, order: i.order })) },
      invitations: { create: ev.invitations.map((i) => ({ supplierId: i.supplierId, tokenHash: hashToken(newToken()) })) },
    },
  });
  await audit(u.email, "event.duplicated", "Event", copy.id, { from: ev.code });
  redirect(`/events/${copy.id}`);
}

export interface ItemInput {
  id?: string;
  vtaCode?: string | null;
  gCode: string;
  description: string;
  quantity: number;
  specs: Record<string, unknown>;
}

export async function saveItems(id: string, items: ItemInput[]) {
  const u = await requireUser(["BUYER"]);
  const ev = await prisma.event.findUniqueOrThrow({ where: { id }, include: { items: true } });
  if (ev.status !== "DRAFT") return { error: "Solo se pueden editar SKUs en borrador" };
  const clean = items.filter((i) => i.gCode?.trim());
  const dup = clean.map((i) => i.gCode.trim()).find((g, i, a) => a.indexOf(g) !== i);
  if (dup) return { error: `Código G duplicado: ${dup}` };
  const keep = new Set(clean.map((i) => i.id).filter(Boolean));
  await prisma.$transaction([
    prisma.eventItem.deleteMany({ where: { eventId: id, id: { notIn: [...keep] as string[] } } }),
    ...clean.map((i, order) => {
      const data = { vtaCode: i.vtaCode || null, gCode: i.gCode.trim(), description: i.description.trim(), quantity: Number(i.quantity) || 0, specs: i.specs as Prisma.InputJsonValue, order };
      return i.id && ev.items.some((x) => x.id === i.id) ? prisma.eventItem.update({ where: { id: i.id }, data }) : prisma.eventItem.create({ data: { ...data, eventId: id } });
    }),
  ]);
  await audit(u.email, "items.saved", "Event", id, { count: clean.length });
  revalidatePath(`/events/${id}`);
  return { ok: true };
}

export async function importItemsExcel(id: string, fd: FormData) {
  await requireUser(["BUYER"]);
  const file = fd.get("file") as File | null;
  if (!file || !file.size) return { error: "Seleccione un archivo" };
  const ev = await loadEvent(id);
  const r = await parseItemsWorkbook(Buffer.from(await file.arrayBuffer()), templateOf(ev!));
  return { items: r.items, warnings: r.warnings };
}

export async function inviteSuppliers(id: string, fd: FormData) {
  const u = await requireUser(["BUYER"]);
  const ids = fd.getAll("supplierId").map(String).filter(Boolean);
  const ev = await loadEvent(id);
  if (!ev) back("/events");
  for (const sid of ids) {
    if (ev.invitations.some((i) => i.supplierId === sid)) continue;
    const inv = await prisma.invitation.create({ data: { eventId: id, supplierId: sid, tokenHash: hashToken(newToken()), maxRound: ev.currentRound } });
    await audit(u.email, "invitation.created", "Invitation", inv.id);
    if (ev.status === "OPEN") {
      const fresh = await loadEvent(id);
      await sendInvitation(fresh!, inv.id, u.email);
    }
  }
  back(`/events/${id}?tab=suppliers`, `${ids.length} proveedor(es) agregado(s)`);
}

export async function removeInvitation(id: string, invitationId: string) {
  const u = await requireUser(["BUYER"]);
  const ev = await prisma.event.findUniqueOrThrow({ where: { id } });
  if (ev.status !== "DRAFT") back(`/events/${id}?tab=suppliers`, undefined, "No se puede quitar un proveedor de un evento publicado");
  await prisma.invitation.delete({ where: { id: invitationId } });
  await audit(u.email, "invitation.removed", "Invitation", invitationId);
  back(`/events/${id}?tab=suppliers`, "Proveedor quitado");
}

export async function resendInvitation(id: string, invitationId: string) {
  const u = await requireUser(["BUYER"]);
  const ev = await loadEvent(id);
  if (ev?.status !== "OPEN") back(`/events/${id}?tab=suppliers`, undefined, "El evento no está abierto");
  await sendInvitation(ev, invitationId, u.email);
  back(`/events/${id}?tab=suppliers`, "Invitación reenviada (nuevo enlace generado)");
}

export async function copyPortalLink(id: string, invitationId: string) {
  const u = await requireUser(["BUYER"]);
  const token = newToken();
  await prisma.invitation.update({ where: { id: invitationId }, data: { tokenHash: hashToken(token) } });
  await audit(u.email, "invitation.link", "Invitation", invitationId);
  back(`/events/${id}?tab=suppliers&link=${encodeURIComponent(`/portal/${token}`)}`, "Nuevo enlace generado (el anterior deja de funcionar)");
}

export async function uploadDocument(id: string, fd: FormData) {
  const u = await requireUser(["BUYER"]);
  const files = fd.getAll("file") as File[];
  for (const f of files) {
    if (!f.size) continue;
    const s = await saveFile(`events/${id}`, f);
    await prisma.eventDocument.create({ data: { eventId: id, name: s.name, path: s.path, size: s.size, mime: s.mime } });
    await audit(u.email, "document.uploaded", "Event", id, { name: s.name });
  }
  back(`/events/${id}?tab=documents`, "Documentos subidos");
}

export async function deleteDocument(id: string, docId: string) {
  const u = await requireUser(["BUYER"]);
  const d = await prisma.eventDocument.delete({ where: { id: docId } });
  await removeFile(d.path);
  await audit(u.email, "document.deleted", "Event", id, { name: d.name });
  back(`/events/${id}?tab=documents`, "Documento eliminado");
}

export async function publish(id: string) {
  const u = await requireUser(["BUYER"]);
  try {
    await publishEvent(id, u.email);
  } catch (e) {
    back(`/events/${id}`, undefined, errMsg(e));
  }
  back(`/events/${id}?tab=suppliers`, "Licitación publicada e invitaciones enviadas");
}

export async function closeNow(id: string) {
  const u = await requireUser(["BUYER"]);
  await closeEvent(id, u.email);
  back(`/events/${id}?tab=compare`, "Licitación cerrada");
}

export async function extendDeadline(id: string, fd: FormData) {
  const u = await requireUser(["BUYER"]);
  const ev = await prisma.event.findUniqueOrThrow({ where: { id } });
  const v = str(fd, "deadline");
  if (!v) back(`/events/${id}`, undefined, "Fecha inválida");
  const deadline = localDateTime(v, ev.timezone);
  await prisma.$transaction([
    prisma.event.update({ where: { id }, data: { deadline, ...(ev.status === "CLOSED" ? { status: "OPEN", closedAt: null } : {}) } }),
    prisma.round.updateMany({ where: { eventId: id, number: ev.currentRound }, data: { deadline, closedAt: null } }),
  ]);
  await audit(u.email, "event.deadline", "Event", id, { deadline });
  back(`/events/${id}`, "Fecha límite actualizada");
}

export async function newRound(id: string, fd: FormData) {
  const u = await requireUser(["BUYER"]);
  const ev = await prisma.event.findUniqueOrThrow({ where: { id } });
  const v = str(fd, "deadline");
  const ids = fd.getAll("invitationId").map(String);
  try {
    await openNewRound(id, ids, localDateTime(v ?? "", ev.timezone), str(fd, "note"), u.email);
  } catch (e) {
    back(`/events/${id}?tab=rounds`, undefined, errMsg(e));
  }
  back(`/events/${id}?tab=rounds`, `Ronda ${ev.currentRound + 1} abierta y proveedores notificados`);
}

export async function cancelEvent(id: string) {
  const u = await requireUser(["BUYER"]);
  await prisma.event.update({ where: { id }, data: { status: "CANCELLED" } });
  await audit(u.email, "event.cancelled", "Event", id);
  back(`/events/${id}`, "Licitación cancelada");
}
