import { getSession } from "@/lib/auth";
import { matrixWorkbook } from "@/lib/excel/reports";
import { xlsxResponse } from "@/lib/http";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getSession())) return new Response("No autorizado", { status: 401 });
  const { id } = await params;
  return xlsxResponse(await matrixWorkbook(id), `matriz-evaluacion.xlsx`);
}
