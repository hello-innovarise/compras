import { resolveToken } from "@/lib/portal";
import { readFile } from "@/lib/storage";
import { fileResponse } from "@/lib/http";

export async function GET(_: Request, { params }: { params: Promise<{ token: string; docId: string }> }) {
  const { token, docId } = await params;
  const r = await resolveToken(token);
  const doc = r?.ev.documents.find((d) => d.id === docId);
  if (!doc) return new Response("Not found", { status: 404 });
  return fileResponse(await readFile(doc.path), doc.name, doc.mime);
}
