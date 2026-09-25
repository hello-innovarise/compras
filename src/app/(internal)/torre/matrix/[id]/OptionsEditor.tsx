"use client";
import { useMemo, useState, useTransition } from "react";
import { evaluateOption, SCALES, type EvaluationWeights, type ReferenceParams, type ScaleKey } from "@/lib/evaluation";
import { saveOptions, type OptionRow } from "../../actions";

const f = (v: number | null | undefined, d = 2) => (v === null || v === undefined || !Number.isFinite(v) ? "—" : v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }));
const p = (v: number) => `${(v * 100).toFixed(1)}%`;
const n = (s: string) => (s.trim() === "" ? null : Number(s));

export function OptionsEditor({ matrixId, initial, params, weights }: { matrixId: string; initial: OptionRow[]; params: ReferenceParams; weights: EvaluationWeights }) {
  const [rows, setRows] = useState(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [edit, setEdit] = useState(false);
  const set = (i: number, patch: Partial<OptionRow>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const results = useMemo(() => rows.map((o) => evaluateOption({ ...o, shipmentDate: o.shipmentDate ?? null }, params, weights)), [rows, params, weights]);
  const bestIdx = results.reduce((b, r, i) => (b < 0 || r.scores.total > results[b].scores.total ? i : b), -1);
  const rank = [...results.map((r, i) => ({ i, s: r.scores.total }))].sort((a, b) => b.s - a.s).reduce<Record<number, number>>((acc, x, k) => ((acc[x.i] = k + 1), acc), {});

  const numIn = (i: number, k: keyof OptionRow, w = "w-16") => (
    <input className={`input-cell ${w}`} value={rows[i][k] === null || rows[i][k] === undefined ? "" : String(rows[i][k])} onChange={(e) => set(i, { [k]: n(e.target.value) } as Partial<OptionRow>)} />
  );
  const txtIn = (i: number, k: keyof OptionRow, w = "w-24") => (
    <input className={`input-cell text-left ${w}`} value={String(rows[i][k] ?? "")} onChange={(e) => set(i, { [k]: e.target.value } as Partial<OptionRow>)} />
  );
  const sel = (i: number, k: ScaleKey, field: keyof OptionRow) => (
    <select className="input-cell w-32 text-left" value={String(rows[i][field])} onChange={(e) => set(i, { [field]: e.target.value } as Partial<OptionRow>)}>
      {SCALES[k].map((s) => <option key={s.code} value={s.code}>{s.labelEs}</option>)}
    </select>
  );
  const ro = (v: React.ReactNode) => <span>{v}</span>;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={edit} onChange={(e) => setEdit(e.target.checked)} /> Editar opciones</label>
        {edit && (
          <>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setRows((r) => [...r, { supplierName: "", tons: params.requiredTons, creditDays: 0, legalRisk: "4", alliance: "3", penalty: "1", specs: "4", claims: "1" }])}>+ Opción</button>
            <button type="button" className="btn btn-sm" disabled={pending} onClick={() => start(async () => { const r = await saveOptions(matrixId, rows); setMsg(r.ok ? "Opciones guardadas" : "Error"); })}>{pending ? "Guardando…" : "Guardar opciones"}</button>
          </>
        )}
        {msg && <span className="text-sm text-green-700">{msg}</span>}
      </div>
      <div className="overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th colSpan={4}>Proveedor</th>
              <th colSpan={16}>Precio</th>
              <th colSpan={5}>SBB / Logística</th>
              <th colSpan={7} className="bg-sky-50">Variables económicas y comerciales</th>
              <th colSpan={4} className="bg-amber-50">Variables técnicas y funcionales</th>
              <th colSpan={3}>Total</th>
            </tr>
            <tr>
              <th>Proveedor</th><th>Molino</th><th>Origen</th><th>Incoterm</th>
              <th>FOB</th><th>Flete</th><th>Seguro</th><th>CIF contado</th><th>Recargo crédito</th><th>Precio c/crédito</th><th>Internación (+extra)</th><th>Precio planta</th><th>Merma</th><th>TM</th><th>Días crédito</th><th>Tasa implícita</th><th>Factor días</th><th>Ajuste pago</th><th>Reclamos $/TM · Costo capital</th><th className="bg-green-50">Precio transformado</th>
              <th>Total SBB</th><th>Spread</th><th>Embarque</th><th>Lead time</th><th>ETA planta</th>
              <th>Precio</th><th>Términos pago</th><th>Entrega</th><th>Riesgo legal</th><th>Alianzas</th><th>Penalizaciones</th><th>Total VEC</th>
              <th>Eval. proveedor (N.E.P)</th><th>Especificaciones</th><th>Reclamos</th><th>Total VTF</th>
              <th>Total</th><th>#</th><th>Brechas</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((o, i) => {
              const r = results[i];
              return (
                <tr key={o.id ?? i} className={i === bestIdx ? "bg-green-50" : ""}>
                  <td className="font-medium">{edit ? txtIn(i, "supplierName", "w-36") : o.supplierName}</td>
                  <td>{edit ? txtIn(i, "mill") : o.mill}</td>
                  <td>{edit ? txtIn(i, "origin", "w-16") : o.origin}</td>
                  <td>{edit ? txtIn(i, "incoterm", "w-16") : o.incoterm}</td>
                  <td className="num">{edit ? numIn(i, "fob") : f(o.fob)}</td>
                  <td className="num">{edit ? numIn(i, "freight") : f(o.freight)}</td>
                  <td className="num">{edit ? numIn(i, "insurance") : f(o.insurance)}</td>
                  <td className="num">{edit ? numIn(i, "cif") : f(o.cif)}</td>
                  <td className="num">{edit ? numIn(i, "creditSurcharge") : f(o.creditSurcharge)}</td>
                  <td className="num">{edit ? numIn(i, "priceWithCredit") : f(r.priceWithCredit)}</td>
                  <td className="num">{edit ? <>{f(params.internacion)} + {numIn(i, "internacionExtra", "w-12")}</> : f(r.internacion)}</td>
                  <td className="num font-semibold">{f(r.plantPrice)}</td>
                  <td className="num">{edit ? numIn(i, "merma", "w-12") : f(o.merma)}</td>
                  <td className="num">{edit ? numIn(i, "tons") : f(o.tons, 1)}</td>
                  <td className="num">{edit ? numIn(i, "creditDays", "w-12") : o.creditDays}{o.advanceConditions ? <div className="text-[10px] text-gray-500">{o.advanceConditions}</div> : null}</td>
                  <td className="num">{p(r.impliedRate)}</td>
                  <td className="num">{r.factorDays}</td>
                  <td className="num">{f(r.paymentAdj)}</td>
                  <td className="num">{edit ? numIn(i, "claimsAmount") : f(r.claimsPerTon)} · {f(r.capitalCost)}</td>
                  <td className="num bg-green-50 font-bold">{f(r.transformedPrice)}</td>
                  <td className="num">{f(r.totalSbb)}</td>
                  <td className="num">{p(r.spread)}</td>
                  <td>{edit ? <input type="date" className="input-cell w-28" value={o.shipmentDate?.slice(0, 10) ?? ""} onChange={(e) => set(i, { shipmentDate: e.target.value || null })} /> : o.shipmentDate?.slice(0, 10) ?? "—"}</td>
                  <td className="num">{r.leadTime ?? "—"}</td>
                  <td>{r.etaPlant ? r.etaPlant.toISOString().slice(0, 10) : "—"}</td>
                  <td className="num">{p(r.scores.price)}</td>
                  <td className="num">{p(r.scores.payment)}</td>
                  <td className="num">{p(r.scores.delivery)}</td>
                  <td>{edit ? sel(i, "legal", "legalRisk") : ro(SCALES.legal.find((s) => s.code === o.legalRisk)?.labelEs)} <span className="text-gray-500">{p(r.scores.legal)}</span></td>
                  <td>{edit ? sel(i, "alliance", "alliance") : ro(SCALES.alliance.find((s) => s.code === o.alliance)?.labelEs)} <span className="text-gray-500">{p(r.scores.alliance)}</span></td>
                  <td>{edit ? sel(i, "penalty", "penalty") : ro(SCALES.penalty.find((s) => s.code === o.penalty)?.labelEs)} <span className="text-gray-500">{p(r.scores.penalty)}</span></td>
                  <td className="num bg-sky-50 font-semibold">{p(r.scores.vec)}</td>
                  <td className="num">{edit ? numIn(i, "supplierScore", "w-12") : f(o.supplierScore, 1)} <span className="text-gray-500">{p(r.scores.supplierEval)}</span></td>
                  <td>{edit ? sel(i, "specs", "specs") : ro(SCALES.specs.find((s) => s.code === o.specs)?.labelEs)} <span className="text-gray-500">{p(r.scores.specs)}</span></td>
                  <td>{edit ? sel(i, "claims", "claims") : ro(SCALES.claims.find((s) => s.code === o.claims)?.labelEs)} <span className="text-gray-500">{p(r.scores.claims)}</span></td>
                  <td className="num bg-amber-50 font-semibold">{p(r.scores.vtf)}</td>
                  <td className={`num font-bold ${r.scores.total < 0 ? "text-red-600" : ""}`}>{p(r.scores.total)}</td>
                  <td className="num">{rank[i]}</td>
                  <td className="min-w-48 text-gray-600">{edit ? txtIn(i, "gaps", "w-48") : o.gaps}{edit && <button type="button" className="ml-1 text-red-600" onClick={() => setRows((x) => x.filter((_, j) => j !== i))}>✕</button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
