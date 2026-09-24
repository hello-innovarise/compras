import { resolveToken } from "@/lib/portal";
import { supplierWorkbook } from "@/lib/events";
import { xlsxResponse } from "@/lib/http";

export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const r = await resolveToken(token);
  if (!r) return new Response("Not found", { status: 404 });
  const buf = await supplierWorkbook(r.ev, r.inv.id);
  return xlsxResponse(buf, `${r.ev.code}-${r.inv.supplier.name}.xlsx`);
}
