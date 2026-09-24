import { prisma } from "./db";
import { hashToken } from "./tokens";
import { closeDueEvents, eventInclude, type FullEvent } from "./events";

export async function resolveToken(token: string) {
  const inv = await prisma.invitation.findUnique({ where: { tokenHash: hashToken(token) }, include: { supplier: { include: { contacts: true } } } });
  if (!inv) return null;
  await closeDueEvents();
  const ev = (await prisma.event.findUnique({ where: { id: inv.eventId }, include: eventInclude })) as FullEvent;
  return { inv, ev };
}

export function canBid(ev: FullEvent, inv: { maxRound: number; status: string }, now = new Date()) {
  return ev.status === "OPEN" && ev.deadline > now && inv.maxRound >= ev.currentRound && inv.status !== "DECLINED";
}
