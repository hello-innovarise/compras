"use client";
import { useMemo, useState, useTransition } from "react";
import { scenarioMetrics, ruleViolations, type AllocationRules } from "@/lib/allocation";
import { saveScenario, type ScenarioLineRow } from "../../actions";

export interface OptionChoice {
  id: string;
  supplierId: string | null;
  supplierName: string;
  termDays: number;
  plantPrice: number;
  prices?: Record<string, { price: number; offered: number }>; // por SKU
}

const f = (v: number | null | undefined, d = 2) => (v === null || v === undefined || !Number.isFinite(v) ? "—" : v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }));

export function ScenarioEditor({
  scenario,
  options,
  items,
  required,
  rules,
  containerTons,
  baseMetrics,
  locked,
}: {
  scenario: { id: string; name: string; notes: string | null; lines: ScenarioLineRow[] };
  options: OptionChoice[];
  items: { id: string; label: string; tons: number }[] | null;
  required: number;
  rules: AllocationRules;
  containerTons?: number | null;
  baseMetrics?: { total: number; weighted: number | null; tons: number } | null;
  locked: boolean;
}) {
  const [name, setName] = useState(scenario.name);
  const [notes, setNotes] = useState(scenario.notes ?? "");
  const [lines, setLines] = useState<ScenarioLineRow[]>(scenario.lines);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const m = useMemo(() => scenarioMetrics(lines, containerTons), [lines, containerTons]);
  const viol = useMemo(() => ruleViolations(m, required, rules), [m, required, rules]);
  const set = (i: number, patch: Partial<ScenarioLineRow>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const priceFor = (optId: string | null | undefined, itemId: string | null | undefined) => {
    const o = options.find((x) => x.id === optId);
    if (!o) return null;
    if (itemId && o.prices) return o.prices[itemId]?.price ?? null;
    return o.plantPrice;
  };
  const chooseOption = (i: number, optId: string) => {
    const o = options.find((x) => x.id === optId);
    if (!o) return;
    const price = priceFor(optId, lines[i].itemId) ?? o.plantPrice;
    set(i, { optionId: o.id, supplierId: o.supplierId, supplierName: o.supplierName, termDays: o.termDays, unitPrice: price });
  };
  const chooseItem = (i: number, itemId: string) => {
    const it = items?.find((x) => x.id === itemId);
    const price = priceFor(lines[i].optionId, itemId);
    set(i, { itemId, itemLabel: it?.label ?? null, ...(price ? { unitPrice: price } : {}) });
  };

  const byItem = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of lines) if (l.itemId) map.set(l.itemId, (map.get(l.itemId) ?? 0) + l.tons);
    return map;
  }, [lines]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input className="input max-w-md font-semibold" value={name} disabled={locked} onChange={(e) => setName(e.target.value)} />
        {!locked && (
          <>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setLines((l) => [...l, { supplierName: options[0]?.supplierName ?? "", optionId: options[0]?.id, supplierId: options[0]?.supplierId, termDays: options[0]?.termDays ?? 0, tons: 0, unitPrice: options[0]?.plantPrice ?? 0, priceAdjust: 0, itemId: null }])}>+ Línea</button>
            <button type="button" className="btn btn-sm" disabled={pending} onClick={() => start(async () => { const r = await saveScenario(scenario.id, name, notes || null, lines); setMsg(r.error ?? "Guardado"); })}>{pending ? "Guardando…" : "Guardar escenario"}</button>
          </>
        )}
        {msg && <span className="text-sm text-green-700">{msg}</span>}
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-md bg-gray-50 p-3"><div className="text-xs text-gray-500">TM asignadas</div><div className="text-xl font-bold">{f(m.tons, 1)} <span className="text-sm font-normal text-gray-500">/ {f(required, 1)}</span></div></div>
        <div className="rounded-md bg-gray-50 p-3"><div className="text-xs text-gray-500">Total cash (USD)</div><div className="text-xl font-bold">{f(m.total, 0)}</div></div>
        <div className="rounded-md bg-gray-50 p-3"><div className="text-xs text-gray-500">Precio ponderado / TM</div><div className="text-xl font-bold text-brand">{f(m.weighted)}</div></div>
        <div className="rounded-md bg-gray-50 p-3">
          <div className="text-xs text-gray-500">vs escenario base</div>
          <div className={`text-xl font-bold ${baseMetrics && m.total - baseMetrics.total > 0 ? "text-red-600" : "text-green-700"}`}>
            {baseMetrics && baseMetrics.weighted !== null && m.weighted !== null ? <>{f(m.weighted - baseMetrics.weighted)} /TM · {f(m.total - baseMetrics.total, 0)}</> : "—"}
          </div>
        </div>
      </div>
      {viol.length > 0 && <ul className="list-disc rounded bg-amber-50 p-2 pl-6 text-xs text-amber-800">{viol.map((v) => <li key={v}>{v}</li>)}</ul>}
      <div className="overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              {items && <th>SKU</th>}
              <th>Proveedor · plazo</th><th className="num">TM</th><th className="num">Precio planta</th><th className="num">Ajuste negociado</th><th className="num">Precio final</th><th className="num">Total</th><th>Nota</th>{!locked && <th />}
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => {
              const offered = l.itemId ? options.find((o) => o.id === l.optionId)?.prices?.[l.itemId]?.offered : undefined;
              return (
                <tr key={i}>
                  {items && (
                    <td>
                      <select className="input-cell w-56 text-left" disabled={locked} value={l.itemId ?? ""} onChange={(e) => chooseItem(i, e.target.value)}>
                        <option value="">—</option>
                        {items.map((it) => <option key={it.id} value={it.id}>{it.label}</option>)}
                      </select>
                    </td>
                  )}
                  <td>
                    <select className="input-cell w-64 text-left" disabled={locked} value={l.optionId ?? ""} onChange={(e) => chooseOption(i, e.target.value)}>
                      <option value="">{l.supplierName || "—"}</option>
                      {options.map((o) => <option key={o.id} value={o.id}>{o.supplierName} · {o.termDays} d</option>)}
                    </select>
                  </td>
                  <td className="num"><input className="input-cell w-20" disabled={locked} value={l.tons} onChange={(e) => set(i, { tons: Number(e.target.value) || 0 })} />{offered !== undefined && l.tons > offered && <div className="text-[10px] text-red-600">ofertó {offered}</div>}</td>
                  <td className="num"><input className="input-cell w-20" disabled={locked} value={l.unitPrice} onChange={(e) => set(i, { unitPrice: Number(e.target.value) || 0 })} /></td>
                  <td className="num"><input className="input-cell w-16" disabled={locked} value={l.priceAdjust ?? 0} onChange={(e) => set(i, { priceAdjust: Number(e.target.value) || 0 })} /></td>
                  <td className="num font-semibold">{f(l.unitPrice + (l.priceAdjust ?? 0))}</td>
                  <td className="num">{f(l.tons * (l.unitPrice + (l.priceAdjust ?? 0)), 0)}</td>
                  <td><input className="input-cell w-48 text-left" disabled={locked} value={l.note ?? ""} onChange={(e) => set(i, { note: e.target.value })} /></td>
                  {!locked && <td><button type="button" className="text-red-600" onClick={() => setLines((x) => x.filter((_, j) => j !== i))}>✕</button></td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {items && (
        <details className="text-xs">
          <summary className="cursor-pointer text-gray-600">Cobertura por SKU</summary>
          <table className="tbl mt-1">
            <thead><tr><th>SKU</th><th className="num">Requerido</th><th className="num">Asignado</th></tr></thead>
            <tbody>{items.map((it) => { const a = byItem.get(it.id) ?? 0; return <tr key={it.id} className={Math.abs(a - it.tons) > 0.01 ? "bg-amber-50" : ""}><td>{it.label}</td><td className="num">{f(it.tons, 1)}</td><td className="num">{f(a, 1)}</td></tr>; })}</tbody>
          </table>
        </details>
      )}
      <div>
        <span className="label">Por proveedor</span>
        <table className="tbl">
          <thead><tr><th>Proveedor</th><th className="num">TM</th><th className="num">%</th><th className="num">Contenedores</th><th className="num">Total</th><th className="num">Ponderado</th><th>Plazos</th></tr></thead>
          <tbody>{m.bySupplier.map((s) => <tr key={s.supplierName}><td>{s.supplierName}</td><td className="num">{f(s.tons, 1)}</td><td className="num">{(s.share * 100).toFixed(1)}%</td><td className="num">{f(s.containers, 1)}</td><td className="num">{f(s.total, 0)}</td><td className="num">{f(s.weighted)}</td><td>{s.termDays.map((d) => `${d} d`).join(", ")}</td></tr>)}</tbody>
        </table>
      </div>
      <textarea className="input text-xs" rows={2} disabled={locked} placeholder="Notas / explicación" value={notes} onChange={(e) => setNotes(e.target.value)} />
    </div>
  );
}
