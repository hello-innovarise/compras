import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { readFile } from "@/lib/storage";
import { fileResponse } from "@/lib/http";

export async function GET(_: Request, { params }: { params: Promise<{ kind: string; id: string }> }) {
  if (!(await getSession())) return new Response("No autorizado", { status: 401 });
  const { kind, id } = await params;
  const doc = kind === "event" ? await prisma.eventDocument.findUnique({ where: { id } }) : await prisma.bidDocument.findUnique({ where: { id } });
  if (!doc) return new Response("No encontrado", { status: 404 });
  return fileResponse(await readFile(doc.path), doc.name, doc.mime);
}
