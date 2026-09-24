import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { loadEvent } from "@/lib/events";
import { evaluateMatrix, matrixInclude, optionSkuPrices } from "@/lib/torre";
import { weightWarnings, targetTransformed, totalSbb } from "@/lib/evaluation";
import { scenarioMetrics } from "@/lib/allocation";
import { Badge, Empty, Field, Flash } from "@/components/ui";
import { fmt } from "@/lib/pricing";
import { OptionsEditor } from "./OptionsEditor";
import { ScenarioEditor } from "./ScenarioEditor";
import * as A from "../../actions";

export const dynamic = "force-dynamic";

const pctv = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(Math.round(v * 10000) / 100));

export default async function MatrixPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const m = await prisma.evaluationMatrix.findUnique({ where: { id }, include: matrixInclude });
  if (!m) notFound();
  const ev = m.eventId ? await loadEvent(m.eventId) : null;
  const { p, w, rows } = evaluateMatrix(m);
  const warnings = weightWarnings(w, p);
  const sessions = await prisma.committeeSession.findMany({ orderBy: { date: "desc" }, take: 30 });
  const history = await prisma.priceHistory.findMany({ where: { family: m.family }, orderBy: { date: "desc" }, take: 20 });
  const skuPrices = ev ? optionSkuPrices(m, ev) : null;
  const options = rows.map(({ o, r }) => ({ id: o.id, supplierId: o.supplierId, supplierName: o.supplierName, termDays: o.creditDays, plantPrice: Math.round(r.plantPrice * 100) / 100, prices: skuPrices?.[o.id] }));
  const items = ev ? ev.items.map((i) => ({ id: i.id, label: `${i.gCode} ${i.description}`, tons: i.quantity })) : null;
  const base = m.scenarios.find((s) => s.isBase);
  const baseMetrics = base ? scenarioMetrics(base.lines, p.rules?.containerTons) : null;
  const ret = `/torre/matrix/${id}`;
  const num = (name: string, label: string, v: number | null | undefined, step = "any") => (
    <Field label={label}><input name={name} type="number" step={step} className="input" defaultValue={v ?? ""} /></Field>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-sm text-gray-500">
            Matriz de evaluación de ofertas · {m.group}{m.purchaseType ? ` · ${m.purchaseType}` : ""}
            {m.session && <> · <Link className="underline" href={`/torre/${m.session.id}`}>{m.session.name}</Link></>}
            {ev && <> · <Link className="underline" href={`/events/${ev.id}?tab=compare`}>{ev.code}</Link></>}
          </div>
          <h1 className="h1">{m.name}</h1>
        </div>
        <div className="flex gap-2">
          <a className="btn-secondary" href={`/api/matrices/${id}/xlsx`}>Exportar Excel</a>
          <form action={A.deleteMatrix.bind(null, id)}><button className="btn-secondary text-red-700">Eliminar</button></form>
        </div>
      </div>
      <Flash msg={sp.msg} error={sp.error} />

      <details className="card" open={!m.options.length}>
        <summary className="h2 cursor-pointer">Datos generales, referencia (fila objetivo), pesos y reglas</summary>
        <form action={A.updateMatrix.bind(null, id)} className="mt-3 space-y-4">
          <div className="grid gap-3 md:grid-cols-6">
            <Field label="Nombre de negociación" className="md:col-span-2"><input name="name" className="input" defaultValue={m.name} /></Field>
            <Field label="Familia"><input name="family" className="input" defaultValue={m.family} /></Field>
            <Field label="Grupo"><select name="group" className="input" defaultValue={m.group}><option>Largos</option><option>Planos</option></select></Field>
            <Field label="Tipo de compra"><input name="purchaseType" className="input" defaultValue={m.purchaseType ?? ""} placeholder="Barco exclusivo / Compra extraordinaria" /></Field>
            <Field label="Negociador"><input name="negotiator" className="input" defaultValue={m.negotiator ?? ""} /></Field>
            <Field label="Fecha"><input name="date" type="date" className="input" defaultValue={p.date} /></Field>
            <Field label="Sesión de Torre" className="md:col-span-2">
              <select name="sessionId" className="input" defaultValue={m.sessionId ?? ""}>
                <option value="">— Sin asignar —</option>
                {sessions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            {num("prevPrice", "Precio anterior", m.prevPrice)}
            {num("prevExtra", "Extra anterior", m.prevExtra)}
            <Field label="Spread meta (%)"><input name="spreadGoal" type="number" step="any" className="input" defaultValue={pctv(m.spreadGoal)} /></Field>
          </div>
          <div>
            <h3 className="label">Requerimiento AG y precio objetivo</h3>
            <div className="grid gap-3 md:grid-cols-6">
              {num("p_requiredTons", "TM requeridas", p.requiredTons)}
              {num("p_targetCif", "Precio CIF objetivo", p.targetCif)}
              {num("p_pexPrice", "Precio PEX (planta objetivo)", p.pexPrice)}
              {num("p_internacion", "Internación", p.internacion)}
              {num("p_surveyor", "Surveyor origen", p.surveyor)}
              {num("p_merma", "Merma", p.merma)}
              {num("p_refCreditDays", "Días crédito referencia", p.refCreditDays)}
              {num("p_refFactorDays", "Factor días objetivo", p.refFactorDays)}
              {num("p_interestRate", "Tasa interés anual (0.14 = 14%)", p.interestRate)}
              {num("p_refLeadTime", "Lead time objetivo (días)", p.refLeadTime)}
              {num("p_transitDays", "Tránsito marítimo", p.transitDays)}
              {num("p_anchorageDays", "Fondeo", p.anchorageDays)}
              {num("p_emDays", "EM", p.emDays)}
              {num("p_sbbIndex", "Índice SBB", p.sbbIndex)}
              {num("p_sbbFreight", "Flete SBB", p.sbbFreight)}
              {num("p_dai", "DAI", p.dai)}
              {num("p_sbbCredit", "Crédito SBB", p.sbbCredit)}
            </div>
            <p className="mt-2 text-xs text-gray-600">Precio transformado objetivo: <b>{fmt(targetTransformed(p))}</b> · Total SBB: <b>{fmt(totalSbb(p))}</b></p>
          </div>
          <div>
            <h3 className="label">Pesos de evaluación (%)</h3>
            <div className="grid gap-3 md:grid-cols-8">
              {([["price", "Precio"], ["priceBelowTarget", "Precio bajo objetivo"], ["pricePenaltyPerStep", "Penalización por paso"], ["payment", "Términos pago"], ["paymentCap", "Tope términos pago"], ["delivery", "Entrega"], ["deliveryCap", "Tope entrega"], ["deliveryOverCapValue", "Valor si supera tope"], ["legal", "Riesgo legal"], ["alliance", "Alianzas"], ["penalty", "Penalizaciones"], ["supplierEval", "Evaluación proveedor"], ["specs", "Especificaciones"], ["claims", "Reclamos"]] as const).map(([k, l]) => (
                <Field key={k} label={l}><input name={`w_${k}`} type="number" step="any" className="input" defaultValue={pctv(w[k])} /></Field>
              ))}
              <Field label="Paso de precio (USD)"><input name="w_priceStep" type="number" step="any" className="input" defaultValue={w.priceStep} /></Field>
            </div>
          </div>
          <div>
            <h3 className="label">Reglas para la propuesta de split</h3>
            <div className="grid gap-3 md:grid-cols-6">
              <Field label="Máx. % por proveedor"><input name="r_maxSharePerSupplier" type="number" step="any" className="input" defaultValue={pctv(p.rules?.maxSharePerSupplier)} /></Field>
              <Field label="Máx. % por país"><input name="r_maxSharePerCountry" type="number" step="any" className="input" defaultValue={pctv(p.rules?.maxSharePerCountry)} /></Field>
              {num("r_minTonsPerSupplier", "Mín. TM por proveedor", p.rules?.minTonsPerSupplier)}
              {num("r_containerTons", "TM por contenedor", p.rules?.containerTons)}
              <Field label="Puntaje mínimo (%)"><input name="r_minScore" type="number" step="any" className="input" defaultValue={pctv(p.rules?.minScore)} /></Field>
              <Field label="Ordenar candidatos por">
                <select name="rankBy" className="input" defaultValue={p.rankBy ?? "price"}><option value="price">Precio transformado</option><option value="score">Puntaje total</option></select>
              </Field>
            </div>
          </div>
          <button className="btn">Guardar parámetros</button>
        </form>
      </details>

      {warnings.length > 0 && (
        <div className="rounded-md bg-amber-50 p-3 text-xs text-amber-900">
          <b>Reglas heredadas del Excel a revisar con Compras:</b>
          <ul className="list-disc pl-5">{warnings.map((x) => <li key={x}>{x}</li>)}</ul>
        </div>
      )}

      <section className="card">
        <h2 className="h2 mb-2">Matriz de evaluación de ofertas</h2>
        {m.options.length === 0 && <Empty>Sin opciones. Active &quot;Editar opciones&quot; para capturarlas, o cree la matriz desde una licitación.</Empty>}
        <OptionsEditor
          key={m.options.map((o) => o.id).join()}
          matrixId={id}
          params={p}
          weights={w}
          initial={m.options.map((o) => ({ ...o, shipmentDate: o.shipmentDate ? o.shipmentDate.toISOString().slice(0, 10) : null }))}
        />
      </section>

      <section id="scenarios" className="card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="h2">Escenarios de split</h2>
          <form action={A.createScenario.bind(null, id)} className="flex gap-2">
            <select name="mode" className="input max-w-sm">
              <option value="auto">Propuesta automática (reglas)</option>
              <option value="empty">Escenario vacío</option>
              {!ev && rows.map(({ o }) => <option key={o.id} value={`all:${o.id}`}>Todo a {o.supplierName} · {o.creditDays} d</option>)}
              {m.scenarios.map((s) => <option key={s.id} value={`copy:${s.id}`}>Copiar &quot;{s.name}&quot;</option>)}
            </select>
            <button className="btn">Crear</button>
          </form>
        </div>
        {m.scenarios.length > 0 && (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>Escenario</th><th className="num">TM</th><th className="num">Total cash</th><th className="num">Ponderado</th><th className="num">Dif. vs base /TM</th><th className="num">Ahorro vs base</th><th>Proveedores</th><th>Estado</th><th /></tr></thead>
              <tbody>
                {m.scenarios.map((s) => {
                  const x = scenarioMetrics(s.lines, p.rules?.containerTons);
                  const dif = baseMetrics?.weighted != null && x.weighted != null ? x.weighted - baseMetrics.weighted : null;
                  return (
                    <tr key={s.id} className={s.approved ? "bg-blue-50" : ""}>
                      <td className="font-medium"><a href={`#sc-${s.id}`} className="underline">{s.name}</a></td>
                      <td className="num">{fmt(x.tons, 1)}</td>
                      <td className="num">{fmt(x.total, 0)}</td>
                      <td className="num font-semibold">{fmt(x.weighted)}</td>
                      <td className="num">{s.isBase ? "base" : fmt(dif)}</td>
                      <td className="num">{s.isBase || !baseMetrics ? "" : fmt(baseMetrics.total - x.total, 0)}</td>
                      <td>{x.bySupplier.map((b) => `${b.supplierName} ${fmt(b.tons, 0)} TM`).join(" · ")}</td>
                      <td>{s.approved ? <Badge status="APPROVED" /> : s.auto ? "auto" : ""}</td>
                      <td className="space-x-2 whitespace-nowrap">
                        {!s.isBase && <form className="inline" action={A.setBaseScenario.bind(null, id, s.id)}><button className="text-xs underline">Usar como base</button></form>}
                        <form className="inline" action={A.approveScenario.bind(null, id, s.id)}><button className="text-xs font-semibold text-blue-700 underline">Aprobar (Torre)</button></form>
                        {!s.approved && <form className="inline" action={A.deleteScenario.bind(null, id, s.id)}><button className="text-xs text-red-600">Eliminar</button></form>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {m.scenarios.map((s) => (
          <div key={s.id} id={`sc-${s.id}`} className={`rounded-md border p-3 ${s.approved ? "border-blue-300" : "border-gray-200"}`}>
            <ScenarioEditor
              key={s.id + s.lines.length}
              scenario={{ id: s.id, name: s.name, notes: s.notes, lines: s.lines }}
              options={options}
              items={items}
              required={p.requiredTons}
              rules={p.rules ?? {}}
              containerTons={p.rules?.containerTons}
              baseMetrics={s.isBase ? null : baseMetrics}
              locked={s.approved}
            />
          </div>
        ))}
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <section id="actions" className="card">
          <h2 className="h2 mb-2">Pendientes / acuerdos</h2>
          <ul className="mb-3 space-y-1 text-sm">
            {m.actions.map((a) => (
              <li key={a.id} className="flex items-center gap-2">
                <form action={A.toggleAction.bind(null, a.id, `${ret}#actions`)}><button className="text-lg leading-none">{a.status === "DONE" ? "☑" : "☐"}</button></form>
                <span className={a.status === "DONE" ? "text-gray-400 line-through" : ""}>{a.text}</span>
                <span className="text-xs text-gray-500">{a.owner}{a.dueDate ? ` · ${a.dueDate.toISOString().slice(0, 10)}` : ""}</span>
              </li>
            ))}
          </ul>
          <form action={A.addAction.bind(null, id)} className="flex flex-wrap gap-2">
            <input type="hidden" name="return" value={`${ret}#actions`} />
            <input name="text" className="input max-w-sm" placeholder="Ej. validar ancho con planta, validar MOQ, negociar ETD/ETA" required />
            <input name="owner" className="input max-w-36" placeholder="Responsable" />
            <input name="dueDate" type="date" className="input max-w-40" />
            <button className="btn-secondary">Agregar</button>
          </form>
        </section>
        <section className="card">
          <h2 className="h2 mb-2">Histórico de precios – {m.family}</h2>
          {history.length === 0 ? <Empty>Sin histórico.</Empty> : (
            <table className="tbl">
              <thead><tr><th>Fecha</th><th>SKU</th><th>Proveedor</th><th className="num">Precio</th><th className="num">Extra</th><th className="num">TM</th><th>Fuente</th></tr></thead>
              <tbody>{history.map((h) => <tr key={h.id}><td>{h.date.toISOString().slice(0, 10)}</td><td>{h.itemCode}</td><td>{h.supplierName}</td><td className="num">{fmt(h.price)}</td><td className="num">{fmt(h.extra)}</td><td className="num">{fmt(h.tons, 0)}</td><td className="text-gray-500">{h.source}</td></tr>)}</tbody>
            </table>
          )}
          <form action={A.addPriceHistory} className="mt-2 flex flex-wrap gap-1">
            <input type="hidden" name="family" value={m.family} />
            <input type="hidden" name="return" value={ret} />
            <input name="date" type="date" className="input max-w-36" />
            <input name="supplierName" className="input max-w-36" placeholder="Proveedor" />
            <input name="price" type="number" step="any" className="input max-w-24" placeholder="Precio" required />
            <input name="extra" type="number" step="any" className="input max-w-20" placeholder="Extra" />
            <input name="tons" type="number" step="any" className="input max-w-20" placeholder="TM" />
            <button className="btn-secondary btn-sm">Agregar precio</button>
          </form>
        </section>
      </div>
    </div>
  );
}
