import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { familySummary, matrixInclude } from "@/lib/torre";
import { Badge, Empty, Field, Flash } from "@/components/ui";
import { fmt, pct } from "@/lib/pricing";
import { fmtDate } from "@/lib/i18n";
import { toDateInput } from "@/lib/forms";
import * as A from "../actions";

export const dynamic = "force-dynamic";

export default async function SessionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const s = await prisma.committeeSession.findUnique({ where: { id }, include: { matrices: { include: matrixInclude, orderBy: [{ group: "asc" }, { createdAt: "asc" }] } } });
  if (!s) notFound();
  const sums = s.matrices.map(familySummary);
  const groups = [...new Set(sums.map((x) => x.matrix.group))];
  const buckets = [...new Set(sums.map((x) => x.matrix.purchaseType ?? "Sin tipo"))];
  const families = [...new Set(s.matrices.map((m) => m.family))];
  const history = await prisma.priceHistory.findMany({ where: { family: { in: families } }, orderBy: { date: "desc" }, take: 40 });
  const openActions = s.matrices.flatMap((m) => m.actions.map((a) => ({ ...a, matrix: m })));
  const loose = await prisma.evaluationMatrix.findMany({ where: { sessionId: null }, orderBy: { createdAt: "desc" }, take: 30 });
  const grand = { tons: sums.reduce((a, x) => a + (x.tonsProjected ?? 0), 0), total: sums.reduce((a, x) => a + (x.total ?? 0), 0) };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-sm text-gray-500">Torre de Compras · {fmtDate(s.date, "es")}</div>
          <h1 className="h1">{s.name} <Badge status={s.status} /></h1>
        </div>
        <div className="flex gap-2">
          <Link className="btn-secondary" href={`/torre/${id}/acta`}>Acta imprimible</Link>
          <a className="btn-secondary" href={`/api/torre/${id}/xlsx`}>Exportar Excel</a>
        </div>
      </div>
      <Flash msg={sp.msg} error={sp.error} />

      <section className="card overflow-x-auto">
        <h2 className="h2 mb-2">RESUMEN por familia</h2>
        {sums.length === 0 ? <Empty>Agregue matrices de evaluación a esta sesión.</Empty> : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Grupo</th><th>Familia</th><th>Negociación</th><th className="num">TM proyectadas</th><th className="num">TM solicitadas</th><th>Proveedor</th>
                <th className="num">Precio puesto en planta</th><th className="num">Precio PEX</th><th className="num">Dif vs PEX</th><th className="num">Spread proyectado</th><th className="num">Spread meta</th>
                <th className="num">FOB</th><th className="num">Flete</th><th className="num">Seguro</th><th className="num">CIF</th><th className="num">Financiamiento</th><th className="num">Internación</th>
                <th>Días crédito</th><th>ETD</th><th>ETA planta</th><th className="num">Total (miles)</th><th>Calidad</th><th>Riesgo legal</th><th className="num">Precio anterior</th><th className="num">Extra anterior</th><th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {sums.map((x) => (
                <tr key={x.matrix.id}>
                  <td>{x.matrix.group}</td>
                  <td className="font-medium">{x.matrix.family}</td>
                  <td><Link className="text-brand underline" href={`/torre/matrix/${x.matrix.id}`}>{x.matrix.name}</Link></td>
                  <td className="num">{fmt(x.tonsProjected, 0)}</td>
                  <td className="num">{fmt(x.tonsRequired, 0)}</td>
                  <td>{x.selected}</td>
                  <td className="num font-semibold">{fmt(x.plantPrice)}</td>
                  <td className="num">{fmt(x.pex)}</td>
                  <td className={`num ${x.difVsPex !== null && x.difVsPex > 0 ? "text-red-600" : "text-green-700"}`}>{fmt(x.difVsPex)}</td>
                  <td className="num">{pct(x.spread)}</td>
                  <td className="num">{pct(x.spreadGoal)}</td>
                  <td className="num">{fmt(x.option?.fob)}</td>
                  <td className="num">{fmt(x.option?.freight)}</td>
                  <td className="num">{fmt(x.option?.insurance)}</td>
                  <td className="num">{fmt(x.option?.cif)}</td>
                  <td className="num">{fmt(x.option?.creditSurcharge)}</td>
                  <td className="num">{fmt(x.eval?.internacion)}</td>
                  <td>{x.termDays.join(", ")}</td>
                  <td>{x.option?.shipmentDate?.toISOString().slice(0, 10) ?? "—"}</td>
                  <td>{x.eval?.etaPlant?.toISOString().slice(0, 10) ?? "—"}</td>
                  <td className="num">{fmt(x.total !== null ? x.total / 1000 : null, 1)}</td>
                  <td>{x.option?.specs ?? ""}</td>
                  <td>{x.option?.legalRisk ?? ""}</td>
                  <td className="num">{fmt(x.matrix.prevPrice)}</td>
                  <td className="num">{fmt(x.matrix.prevExtra)}</td>
                  <td>{x.approved ? <Badge status="APPROVED" /> : x.scenario ? "Escenario base" : "Mejor puntaje"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold"><td colSpan={3} className="text-right">Total</td><td className="num">{fmt(grand.tons, 0)}</td><td colSpan={16} /><td className="num">{fmt(grand.total / 1000, 1)}</td><td colSpan={5} /></tr>
            </tfoot>
          </table>
        )}
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="card">
          <h2 className="h2 mb-2">Consolidado {groups.join(" + ")}</h2>
          <table className="tbl">
            <thead><tr><th>Tipo de compra</th>{groups.map((g) => <th key={g} className="num">{g} TM</th>)}<th className="num">Total TM</th><th className="num">Monto (miles USD)</th></tr></thead>
            <tbody>
              {buckets.map((b) => {
                const xs = sums.filter((x) => (x.matrix.purchaseType ?? "Sin tipo") === b);
                return (
                  <tr key={b}>
                    <td>{b}</td>
                    {groups.map((g) => <td key={g} className="num">{fmt(xs.filter((x) => x.matrix.group === g).reduce((a, x) => a + (x.tonsProjected ?? 0), 0), 0)}</td>)}
                    <td className="num">{fmt(xs.reduce((a, x) => a + (x.tonsProjected ?? 0), 0), 0)}</td>
                    <td className="num">{fmt(xs.reduce((a, x) => a + (x.total ?? 0), 0) / 1000, 1)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
        <section className="card">
          <h2 className="h2 mb-2">Pendientes / acuerdos</h2>
          {openActions.length === 0 ? <Empty>Sin pendientes.</Empty> : (
            <ul className="space-y-1 text-sm">
              {openActions.map((a) => (
                <li key={a.id} className="flex items-center gap-2">
                  <form action={A.toggleAction.bind(null, a.id, `/torre/${id}`)}><button className="text-lg leading-none">{a.status === "DONE" ? "☑" : "☐"}</button></form>
                  <span className={a.status === "DONE" ? "text-gray-400 line-through" : ""}>{a.text}</span>
                  <span className="text-xs text-gray-500">{a.matrix.family}{a.owner ? ` · ${a.owner}` : ""}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="card">
        <h2 className="h2 mb-2">Histórico de precios</h2>
        {history.length === 0 ? <Empty>Sin histórico para estas familias.</Empty> : (
          <table className="tbl">
            <thead><tr><th>Fecha</th><th>Familia</th><th>SKU</th><th>Proveedor</th><th className="num">Precio</th><th className="num">Extra</th><th className="num">TM</th><th>Fuente</th></tr></thead>
            <tbody>{history.map((h) => <tr key={h.id}><td>{h.date.toISOString().slice(0, 10)}</td><td>{h.family}</td><td>{h.itemCode}</td><td>{h.supplierName}</td><td className="num">{fmt(h.price)}</td><td className="num">{fmt(h.extra)}</td><td className="num">{fmt(h.tons, 0)}</td><td className="text-gray-500">{h.source}</td></tr>)}</tbody>
          </table>
        )}
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <form action={A.updateSession.bind(null, id)} className="card space-y-2">
          <h2 className="h2">Sesión</h2>
          <div className="grid gap-2 md:grid-cols-3">
            <Field label="Nombre"><input name="name" className="input" defaultValue={s.name} /></Field>
            <Field label="Fecha"><input name="date" type="date" className="input" defaultValue={toDateInput(s.date)} /></Field>
            <Field label="Estado"><select name="status" className="input" defaultValue={s.status}><option value="DRAFT">Borrador</option><option value="IN_SESSION">En sesión</option><option value="APPROVED">Aprobada</option></select></Field>
          </div>
          <Field label="Notas / acuerdos generales"><textarea name="notes" className="input" rows={4} defaultValue={s.notes ?? ""} /></Field>
          <button className="btn-secondary">Guardar</button>
        </form>
        <div className="card space-y-2">
          <h2 className="h2">Agregar negociación</h2>
          {loose.length > 0 && (
            <ul className="text-sm">
              {loose.map((m) => <li key={m.id}><Link className="text-brand underline" href={`/torre/matrix/${m.id}`}>{m.name}</Link> <span className="text-gray-500">(asigne la sesión en sus parámetros)</span></li>)}
            </ul>
          )}
          <form action={A.createMatrix} className="flex flex-wrap gap-2">
            <input type="hidden" name="sessionId" value={id} />
            <input name="name" className="input max-w-44" placeholder="Nombre (ej. HRC TYPSA)" required />
            <input name="family" className="input max-w-32" placeholder="Familia" required />
            <select name="group" className="input max-w-28"><option>Largos</option><option>Planos</option></select>
            <input name="requiredTons" type="number" step="any" className="input max-w-24" placeholder="TM" />
            <button className="btn-secondary">Nueva matriz manual</button>
          </form>
        </div>
      </div>
    </div>
  );
}
