"use client";
import { useMemo, useState, useTransition } from "react";
import { saveAward, type AwardLineRow } from "./actions";

interface Item { id: string; gCode: string; description: string; quantity: number }
interface Offer { supplierId: string; supplierName: string; bidLineId: string; offered: number; prices: Record<number, number | null> }

const f = (v: number | null | undefined, d = 2) => (v === null || v === undefined || !Number.isFinite(v) ? "—" : v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }));

export function AwardEditor({ awardId, items, offers, terms, initial, notes: n0, locked }: { awardId: string; items: Item[]; offers: Record<string, Offer[]>; terms: number[]; initial: AwardLineRow[]; notes: string; locked: boolean }) {
  const [lines, setLines] = useState(initial);
  const [notes, setNotes] = useState(n0);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (i: number, patch: Partial<AwardLineRow>) =>
    setLines((ls) =>
      ls.map((l, j) => {
        if (j !== i) return l;
        const nl = { ...l, ...patch };
        if ("supplierId" in patch || "termDays" in patch) {
          const o = offers[nl.itemId]?.find((x) => x.supplierId === nl.supplierId);
          nl.bidLineId = o?.bidLineId ?? null;
          nl.unitPrice = o?.prices[nl.termDays] ?? nl.unitPrice;
        }
        return nl;
      }),
    );
  const bySupplier = useMemo(() => {
    const m = new Map<string, { tons: number; total: number }>();
    for (const l of lines) {
      const name = Object.values(offers).flat().find((o) => o.supplierId === l.supplierId)?.supplierName ?? "?";
      const e = m.get(name) ?? { tons: 0, total: 0 };
      e.tons += l.tons;
      e.total += l.tons * l.unitPrice;
      m.set(name, e);
    }
    return [...m.entries()];
  }, [lines, offers]);
  const tot = bySupplier.reduce((a, [, e]) => ({ tons: a.tons + e.tons, total: a.total + e.total }), { tons: 0, total: 0 });

  return (
    <div className="space-y-3">
      <table className="tbl">
        <thead><tr><th>SKU</th><th className="num">Solicitado</th><th>Proveedor</th><th>Plazo</th><th className="num">TM</th><th className="num">USD/TM</th><th className="num">Total</th>{!locked && <th />}</tr></thead>
        <tbody>
          {items.map((it) => {
            const idx = lines.map((l, i) => ({ l, i })).filter((x) => x.l.itemId === it.id);
            const assigned = idx.reduce((s, x) => s + x.l.tons, 0);
            const rows = idx.length ? idx : [{ l: null, i: -1 }];
            return rows.map(({ l, i }, k) => (
              <tr key={`${it.id}-${k}`} className={Math.abs(assigned - it.quantity) > 0.01 ? "bg-amber-50" : ""}>
                {k === 0 && <td rowSpan={rows.length}>{it.gCode} {it.description}</td>}
                {k === 0 && <td rowSpan={rows.length} className="num">{f(it.quantity, 1)}<div className="text-[10px] text-gray-500">asignado {f(assigned, 1)}</div></td>}
                {l ? (
                  <>
                    <td>
                      <select className="input-cell w-48 text-left" disabled={locked} value={l.supplierId} onChange={(e) => set(i, { supplierId: e.target.value })}>
                        <option value="">—</option>
                        {(offers[it.id] ?? []).map((o) => <option key={o.supplierId} value={o.supplierId}>{o.supplierName} ({f(o.offered, 0)} TM)</option>)}
                      </select>
                    </td>
                    <td>
                      <select className="input-cell w-24 text-left" disabled={locked} value={l.termDays} onChange={(e) => set(i, { termDays: Number(e.target.value) })}>
                        {terms.map((t) => <option key={t} value={t}>{t === 0 ? "Contado" : `${t} d`}</option>)}
                      </select>
                    </td>
                    <td className="num"><input className="input-cell w-20" disabled={locked} value={l.tons} onChange={(e) => set(i, { tons: Number(e.target.value) || 0 })} /></td>
                    <td className="num"><input className="input-cell w-20" disabled={locked} value={l.unitPrice} onChange={(e) => set(i, { unitPrice: Number(e.target.value) || 0 })} /></td>
                    <td className="num">{f(l.tons * l.unitPrice, 0)}</td>
                    {!locked && (
                      <td className="whitespace-nowrap">
                        <button type="button" className="text-xs text-brand" title="Dividir" onClick={() => setLines((ls) => [...ls, { itemId: it.id, supplierId: "", tons: 0, termDays: l.termDays, unitPrice: 0 }])}>+ split</button>{" "}
                        <button type="button" className="text-red-600" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>✕</button>
                      </td>
                    )}
                  </>
                ) : (
                  <td colSpan={6} className="text-gray-400">
                    Sin adjudicar {!locked && <button type="button" className="ml-2 text-xs text-brand underline" onClick={() => setLines((ls) => [...ls, { itemId: it.id, supplierId: "", tons: it.quantity, termDays: terms[0] ?? 0, unitPrice: 0 }])}>asignar</button>}
                  </td>
                )}
              </tr>
            ));
          })}
        </tbody>
      </table>
      <div className="grid gap-4 md:grid-cols-2">
        <table className="tbl">
          <thead><tr><th>Proveedor</th><th className="num">TM</th><th className="num">Total USD</th><th className="num">Ponderado</th></tr></thead>
          <tbody>{bySupplier.map(([n, e]) => <tr key={n}><td>{n}</td><td className="num">{f(e.tons, 1)}</td><td className="num">{f(e.total, 0)}</td><td className="num">{f(e.tons ? e.total / e.tons : null)}</td></tr>)}</tbody>
          <tfoot><tr className="font-semibold"><td>Total</td><td className="num">{f(tot.tons, 1)}</td><td className="num">{f(tot.total, 0)}</td><td className="num">{f(tot.tons ? tot.total / tot.tons : null)}</td></tr></tfoot>
        </table>
        <textarea className="input" rows={4} disabled={locked} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notas de adjudicación" />
      </div>
      {!locked && (
        <div className="flex items-center gap-2">
          <button className="btn" disabled={pending} onClick={() => start(async () => { const r = await saveAward(awardId, lines, notes || null); setMsg(r.error ?? "Guardado"); })}>{pending ? "Guardando…" : "Guardar adjudicación"}</button>
          {msg && <span className="text-sm text-green-700">{msg}</span>}
        </div>
      )}
    </div>
  );
}
