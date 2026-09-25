import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { familySummary, matrixInclude } from "@/lib/torre";
import { scenarioMetrics } from "@/lib/allocation";
import { fmt, pct } from "@/lib/pricing";
import { fmtDate } from "@/lib/i18n";
import { PrintButton } from "./PrintButton";

export const dynamic = "force-dynamic";

export default async function Acta({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await prisma.committeeSession.findUnique({ where: { id }, include: { matrices: { include: matrixInclude } } });
  if (!s) notFound();
  const sums = s.matrices.map(familySummary);
  return (
    <div className="mx-auto max-w-5xl space-y-4 bg-white p-6 text-sm">
      <div className="no-print"><PrintButton /></div>
      <h1 className="text-xl font-bold">Acta – {s.name}</h1>
      <p>Fecha: {fmtDate(s.date, "es")} · Estado: {s.status}</p>
      {s.notes && <p className="whitespace-pre-line">{s.notes}</p>}
      {sums.map((x) => {
        const sc = x.scenario;
        const m = sc ? scenarioMetrics(sc.lines, x.params.rules?.containerTons) : null;
        return (
          <section key={x.matrix.id} className="break-inside-avoid border-t pt-3">
            <h2 className="text-lg font-semibold">{x.matrix.family} – {x.matrix.name}</h2>
            <p>TM solicitadas {fmt(x.tonsRequired, 0)} · Precio PEX {fmt(x.pex)} · Precio puesto en planta {fmt(x.plantPrice)} · Dif vs PEX {fmt(x.difVsPex)} · Spread {pct(x.spread)}</p>
            <p>Decisión: <b>{x.approved ? `Aprobado escenario "${sc?.name}"` : "Pendiente de aprobación"}</b></p>
            {m && (
              <table className="tbl mt-2">
                <thead><tr><th>Proveedor</th><th className="num">TM</th><th className="num">%</th><th className="num">Precio ponderado</th><th className="num">Total USD</th><th>Plazos</th></tr></thead>
                <tbody>{m.bySupplier.map((b) => <tr key={b.supplierName}><td>{b.supplierName}</td><td className="num">{fmt(b.tons, 1)}</td><td className="num">{(b.share * 100).toFixed(1)}%</td><td className="num">{fmt(b.weighted)}</td><td className="num">{fmt(b.total, 0)}</td><td>{b.termDays.join(", ")} d</td></tr>)}</tbody>
                <tfoot><tr className="font-semibold"><td>Total</td><td className="num">{fmt(m.tons, 1)}</td><td /><td className="num">{fmt(m.weighted)}</td><td className="num">{fmt(m.total, 0)}</td><td /></tr></tfoot>
              </table>
            )}
            {x.matrix.actions.length > 0 && (
              <ul className="mt-2 list-disc pl-5">{x.matrix.actions.map((a) => <li key={a.id}>{a.status === "DONE" ? "✔ " : ""}{a.text}{a.owner ? ` (${a.owner})` : ""}</li>)}</ul>
            )}
          </section>
        );
      })}
      <div className="mt-10 grid grid-cols-3 gap-8 pt-10 text-center">
        {["Compras", "Torre de Compras", "Gerencia"].map((r) => <div key={r} className="border-t pt-1">{r}</div>)}
      </div>
    </div>
  );
}
