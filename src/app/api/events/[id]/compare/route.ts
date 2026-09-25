import { getSession } from "@/lib/auth";
import { loadEvent } from "@/lib/events";
import { compareWorkbook } from "@/lib/excel/reports";
import { xlsxResponse } from "@/lib/http";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getSession())) return new Response("No autorizado", { status: 401 });
  const { id } = await params;
  const ev = await loadEvent(id);
  if (!ev) return new Response("No encontrado", { status: 404 });
  if (ev.sealed && ev.status === "OPEN") return new Response("Ofertas selladas hasta el cierre", { status: 403 });
  const round = Number(new URL(req.url).searchParams.get("round") ?? ev.currentRound);
  return xlsxResponse(await compareWorkbook(ev, round), `${ev.code}-comparativo-R${round}.xlsx`);
}
