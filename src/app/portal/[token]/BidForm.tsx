"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveBid, uploadExcel, type LineInput } from "./actions";
import type { Dict } from "@/lib/i18n";

interface F {
  key: string;
  labelEs: string;
  labelEn: string;
  type: string;
  unit?: string | null;
  required?: boolean;
  options?: string[] | null;
}
interface Item {
  id: string;
  gCode: string;
  vtaCode?: string | null;
  description: string;
  quantity: number;
  specs: Record<string, unknown>;
}

export interface BidFormProps {
  token: string;
  locale: string;
  d: Dict;
  items: Item[];
  specFields: F[];
  techFields: F[];
  complianceFields: F[];
  termFields: F[];
  components: { key: string; labelEs: string; labelEn: string }[];
  baseLabel: string;
  terms: number[];
  containerTons?: number | null;
  initial: LineInput[];
  previous?: Record<string, { base: number | null; fin: Record<string, number | null> }>;
  header: Record<string, string | null>;
  editable: boolean;
  submittedVersion: number;
}

const n = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const x = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(x) ? x : null;
};
const f2 = (v: number | null | undefined, dec = 2) => (v === null || v === undefined || !Number.isFinite(v) ? "—" : v.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec }));

export function BidForm(p: BidFormProps) {
  const L = (x: { labelEs: string; labelEn: string }) => (p.locale === "en" ? x.labelEn : x.labelEs);
  const router = useRouter();
  const [lines, setLines] = useState<LineInput[]>(() =>
    p.items.map((it) => p.initial.find((l) => l.itemId === it.id) ?? { itemId: it.id, noOffer: false, offeredQty: null, prices: {}, financing: {}, values: {} }),
  );
  const [header, setHeader] = useState(p.header);
  const [msg, setMsg] = useState<{ ok?: string; error?: string; warnings?: string[] } | null>(null);
  const [pending, start] = useTransition();
  const upd = (i: number, fn: (l: LineInput) => LineInput) => setLines((ls) => ls.map((l, j) => (j === i ? fn(l) : l)));

  const calc = useMemo(
    () =>
      lines.map((l) => {
        const comps = p.components.map((c) => n(l.prices[c.key]));
        const base = l.noOffer || comps.every((x) => x === null) ? null : comps.reduce<number>((s, x) => s + (x ?? 0), 0);
        const q = l.noOffer ? 0 : n(l.offeredQty) ?? 0;
        const tp: Record<number, number | null> = {};
        for (const t of [0, ...p.terms]) {
          const fin = t === 0 ? 0 : n(l.financing[String(t)]);
          tp[t] = base && fin !== null ? base + fin : null;
        }
        return { base, q, tp };
      }),
    [lines, p.components, p.terms],
  );
  const totals = useMemo(() => {
    const q = calc.reduce((s, c) => s + c.q, 0);
    const out: Record<number, { total: number; avg: number | null }> = {};
    for (const t of [0, ...p.terms]) {
      const total = calc.reduce((s, c) => s + (c.tp[t] ?? 0) * c.q, 0);
      out[t] = { total, avg: q ? total / q : null };
    }
    return { q, out };
  }, [calc, p.terms]);

  const applyTermToAll = (key: string, v: string) => {
    setHeader((h) => ({ ...h, [key]: v }));
    setLines((ls) => ls.map((l) => (l.noOffer ? l : { ...l, values: { ...l.values, [key]: v } })));
  };

  const doSave = (submit: boolean) =>
    start(async () => {
      const r = await saveBid(p.token, lines, header, submit);
      setMsg(r.error ? { error: r.error } : { ok: submit ? p.d.submittedOk : p.d.savedOk });
      if (!r.error) router.refresh();
    });

  const cellInput = (i: number, value: unknown, onChange: (v: string) => void, opts: { w?: string; text?: boolean; disabled?: boolean } = {}) => (
    <input
      className={`input-cell ${opts.text ? "text-left" : ""} ${opts.w ?? ""}`}
      disabled={!p.editable || opts.disabled || lines[i].noOffer}
      value={value === null || value === undefined ? "" : String(value)}
      onChange={(e) => onChange(e.target.value)}
      inputMode={opts.text ? "text" : "decimal"}
    />
  );

  return (
    <div className="space-y-4">
      {p.editable && (
        <div className="card flex flex-wrap items-center gap-3 text-sm">
          <span className="text-gray-600">{p.d.excelHelp}</span>
          <a className="btn-secondary" href={`/api/portal/${p.token}/excel`}>⬇ {p.d.downloadExcel}</a>
          <form
            className="flex items-center gap-2"
            action={(fd) =>
              start(async () => {
                const r = await uploadExcel(p.token, fd);
                if (r.error) return setMsg({ error: r.error });
                if (r.lines) setLines(p.items.map((it) => r.lines!.find((l) => l.itemId === it.id) ?? lines.find((l) => l.itemId === it.id)!));
                setMsg({ ok: `Excel OK – ${r.lines?.length ?? 0} SKUs. ${p.locale === "en" ? "Review and submit." : "Revise y envíe."}`, warnings: r.warnings });
                router.refresh();
              })
            }
          >
            <input type="file" name="file" accept=".xlsx" className="text-xs" />
            <button className="btn-secondary">⬆ {p.d.uploadExcel}</button>
          </form>
        </div>
      )}

      {p.termFields.length > 0 && (
        <div className="card">
          <h3 className="h2 mb-2">{p.d.header}</h3>
          <div className="grid gap-3 md:grid-cols-4">
            {p.termFields.map((f) => (
              <label key={f.key} className="text-sm">
                <span className="label">{L(f)}</span>
                <input className="input" disabled={!p.editable} value={header[f.key] ?? ""} onChange={(e) => applyTermToAll(f.key, e.target.value)} placeholder={p.locale === "en" ? "Applies to all lines" : "Aplica a todas las líneas"} />
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="card overflow-x-auto p-0">
        <table className="tbl">
          <thead>
            <tr>
              <th colSpan={4 + p.specFields.length}>{p.d.items}</th>
              <th className="bg-green-100">{p.d.noOffer}</th>
              <th className="bg-green-100" colSpan={1 + p.techFields.length}>{p.d.tech}</th>
              <th className="bg-green-100" colSpan={p.complianceFields.length}>{p.d.compliance}</th>
              <th className="bg-green-100" colSpan={p.components.length + 1}>{p.d.prices}</th>
              <th className="bg-green-100" colSpan={p.terms.length}>{p.d.financingHelp}</th>
              <th colSpan={p.terms.length}>USD/TM</th>
            </tr>
            <tr>
              <th>Código G</th>
              <th className="min-w-56">{p.locale === "en" ? "Description" : "Descripción"}</th>
              <th>{p.d.requestedQty}</th>
              {p.specFields.map((f) => <th key={f.key}>{L(f)}{f.unit ? `, ${f.unit}` : ""}</th>)}
              <th />
              <th />
              <th>{p.d.offeredQty}</th>
              {p.techFields.map((f) => <th key={f.key}>{L(f)}</th>)}
              {p.complianceFields.map((f) => <th key={f.key}>{L(f)}{f.required ? " *" : ""}</th>)}
              {p.components.map((c) => <th key={c.key}>{L(c)}</th>)}
              <th>{p.baseLabel}</th>
              {p.terms.map((t) => <th key={t}>{t} {p.locale === "en" ? "days" : "días"}</th>)}
              {p.terms.map((t) => <th key={t}>{p.locale === "en" ? "Price" : "Precio"} {t}d</th>)}
            </tr>
          </thead>
          <tbody>
            {p.items.map((it, i) => {
              const l = lines[i];
              const c = calc[i];
              const prev = p.previous?.[it.id];
              return (
                <tr key={it.id} className={l.noOffer ? "bg-gray-100 text-gray-400" : ""}>
                  <td className="whitespace-nowrap">{it.gCode}</td>
                  <td>{it.description}</td>
                  <td className="num">{f2(it.quantity, 0)}</td>
                  {p.specFields.map((f) => <td key={f.key} className="num text-gray-600">{typeof it.specs[f.key] === "number" ? f2(it.specs[f.key] as number) : String(it.specs[f.key] ?? "")}</td>)}
                  <td />
                  <td className="text-center"><input type="checkbox" disabled={!p.editable} checked={l.noOffer} onChange={(e) => upd(i, (x) => ({ ...x, noOffer: e.target.checked }))} /></td>
                  <td>{cellInput(i, l.offeredQty, (v) => upd(i, (x) => ({ ...x, offeredQty: n(v) })), { w: "w-16" })}</td>
                  {p.techFields.map((f) => <td key={f.key}>{cellInput(i, l.values[f.key], (v) => upd(i, (x) => ({ ...x, values: { ...x.values, [f.key]: f.type === "NUMBER" ? n(v) : v } })), { text: f.type !== "NUMBER", w: "w-24" })}</td>)}
                  {p.complianceFields.map((f) => (
                    <td key={f.key}>
                      {f.type === "OKNO" ? (
                        <select
                          className={`input-cell w-16 text-left ${l.values[f.key] === "NO" ? "bg-red-100" : ""}`}
                          disabled={!p.editable || l.noOffer}
                          value={String(l.values[f.key] ?? "")}
                          onChange={(e) => upd(i, (x) => ({ ...x, values: { ...x.values, [f.key]: e.target.value || null } }))}
                        >
                          <option value="" />
                          <option value="OK">OK</option>
                          <option value="NO">NO</option>
                        </select>
                      ) : (
                        cellInput(i, l.values[f.key], (v) => upd(i, (x) => ({ ...x, values: { ...x.values, [f.key]: v } })), { text: true, w: "w-40" })
                      )}
                    </td>
                  ))}
                  {p.components.map((cp) => <td key={cp.key}>{cellInput(i, l.prices[cp.key], (v) => upd(i, (x) => ({ ...x, prices: { ...x.prices, [cp.key]: n(v) } })), { w: "w-16" })}</td>)}
                  <td className="num font-semibold">
                    {f2(c.base)}
                    {prev?.base ? <div className="text-[10px] font-normal text-gray-500" title={p.d.previousRound}>R-1: {f2(prev.base)}</div> : null}
                  </td>
                  {p.terms.map((t) => <td key={t}>{cellInput(i, l.financing[String(t)], (v) => upd(i, (x) => ({ ...x, financing: { ...x.financing, [String(t)]: n(v) } })), { w: "w-14" })}</td>)}
                  {p.terms.map((t) => <td key={t} className="num">{f2(c.tp[t])}</td>)}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="font-semibold">
              <td colSpan={5 + p.specFields.length} className="text-right">{p.d.totals}</td>
              <td className="num">{f2(totals.q, 1)}</td>
              <td colSpan={p.techFields.length + p.complianceFields.length + p.components.length} className="text-right">{p.d.weightedAvg} ({p.d.cash})</td>
              <td className="num">{f2(totals.out[0]?.avg)}</td>
              <td colSpan={p.terms.length} className="text-right">{p.d.weightedAvg}</td>
              {p.terms.map((t) => <td key={t} className="num">{f2(totals.out[t]?.avg)}</td>)}
            </tr>
            <tr>
              <td colSpan={5 + p.specFields.length} className="text-right">{p.containerTons ? `${p.d.containers} (${p.containerTons} TM)` : ""}</td>
              <td className="num">{p.containerTons ? f2(totals.q / p.containerTons, 1) : ""}</td>
              <td colSpan={p.techFields.length + p.complianceFields.length + p.components.length + 1 + p.terms.length} className="text-right">{p.d.total} USD</td>
              {p.terms.map((t) => <td key={t} className="num">{f2(totals.out[t]?.total, 0)}</td>)}
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="card space-y-3">
        <label className="block text-sm">
          <span className="label">{p.d.comments}</span>
          <textarea className="input" rows={3} disabled={!p.editable} value={header.comments ?? ""} onChange={(e) => setHeader((h) => ({ ...h, comments: e.target.value }))} />
        </label>
        {msg && (
          <div className={`rounded p-2 text-sm ${msg.error ? "bg-red-50 text-red-700" : "bg-green-50 text-green-800"}`}>
            {msg.error ?? msg.ok}
            {msg.warnings && msg.warnings.length > 0 && <ul className="mt-1 list-disc pl-5 text-xs text-amber-700">{msg.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
          </div>
        )}
        {p.editable && (
          <div className="flex gap-2">
            <button className="btn-secondary" disabled={pending} onClick={() => doSave(false)}>{p.d.saveDraft}</button>
            <button className="btn" disabled={pending} onClick={() => doSave(true)}>{pending ? "…" : p.submittedVersion > 0 ? p.d.resubmit : p.d.submit}</button>
          </div>
        )}
      </div>
    </div>
  );
}
