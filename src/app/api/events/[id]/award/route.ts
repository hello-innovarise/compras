import { getSession } from "@/lib/auth";
import { loadEvent } from "@/lib/events";
import { awardWorkbook } from "@/lib/excel/reports";
import { xlsxResponse } from "@/lib/http";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getSession())) return new Response("No autorizado", { status: 401 });
  const { id } = await params;
  const ev = await loadEvent(id);
  if (!ev) return new Response("No encontrado", { status: 404 });
  return xlsxResponse(await awardWorkbook(ev), `${ev.code}-adjudicacion.xlsx`);
}
