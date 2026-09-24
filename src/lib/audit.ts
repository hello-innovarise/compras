import { prisma } from "./db";
import type { Prisma } from "@prisma/client";

export async function audit(actor: string, action: string, entity: string, entityId?: string | null, data?: unknown) {
  await prisma.auditLog.create({
    data: { actor, action, entity, entityId: entityId ?? null, data: (data ?? undefined) as Prisma.InputJsonValue | undefined },
  });
}
