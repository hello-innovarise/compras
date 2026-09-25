import { getSession } from "@/lib/auth";
import { loadEvent, supplierWorkbook } from "@/lib/events";
import { generateOfferWorkbook } from "@/lib/excel/generate";
import { excelInfo, templateOf } from "@/lib/events";
import { xlsxResponse } from "@/lib/http";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getSession())) return new Response("No autorizado", { status: 401 });
  const { id } = await params;
  const ev = await loadEvent(id);
  if (!ev) return new Response("No encontrado", { status: 404 });
  const inv = new URL(req.url).searchParams.get("invitation");
  const sealed = ev.sealed && ev.status === "OPEN";
  if (inv && !sealed) {
    const i = ev.invitations.find((x) => x.id === inv);
    return xlsxResponse(await supplierWorkbook(ev, inv), `${ev.code}-${i?.supplier.name ?? "oferta"}.xlsx`);
  }
  const buf = await generateOfferWorkbook({ event: excelInfo(ev), template: templateOf(ev), items: ev.items.map((i) => ({ ...i, specs: i.specs as Record<string, unknown> })) });
  return xlsxResponse(buf, `${ev.code}-formato.xlsx`);
}
