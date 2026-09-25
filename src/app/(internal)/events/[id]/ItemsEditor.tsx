"use client";
import { useState, useTransition } from "react";
import { saveItems, importItemsExcel, type ItemInput } from "../actions";

interface SpecField {
  key: string;
  labelEs: string;
  unit?: string | null;
  type: string;
}

export function ItemsEditor({ eventId, initial, specs, editable }: { eventId: string; initial: ItemInput[]; specs: SpecField[]; editable: boolean }) {
  const [rows, setRows] = useState<ItemInput[]>(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (i: number, patch: Partial<ItemInput>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const setSpec = (i: number, k: string, v: string) =>
    setRows((r) => r.map((x, j) => (j === i ? { ...x, specs: { ...x.specs, [k]: v === "" ? undefined : isNaN(Number(v)) ? v : Number(v) } } : x)));

  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const text = e.clipboardData.getData("text");
    if (!text.includes("\t")) return;
    e.preventDefault();
    const add = text
      .split(/\r?\n/)
      .map((l) => l.split("\t"))
      .filter((c) => c.length >= 3 && c[1]?.trim() && !/c[oó]digo/i.test(c[1]))
      .map((c) => {
        const sp: Record<string, unknown> = {};
        specs.forEach((f, i) => {
          const v = c[4 + i]?.trim();
          if (v) sp[f.key] = isNaN(Number(v)) ? v : Number(v);
        });
        return { vtaCode: c[0]?.trim() || null, gCode: c[1].trim(), description: c[2]?.trim() ?? "", quantity: Number(c[3]) || 0, specs: sp };
      });
    setRows((r) => [...r, ...add]);
    setMsg(`${add.length} filas pegadas. Revise y guarde.`);
  };

  const total = rows.reduce((s, r) => s + (Number(r.quantity) || 0), 0);

  return (
    <div className="space-y-3">
      {editable && (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-md border border-dashed border-gray-300 p-3 text-sm">
            <b>Importar desde Excel</b> (formato actual: columnas Código VTA, Código G, Descripción, Cantidad y medidas)
            <form
              className="mt-2 flex gap-2"
              action={(fd) =>
                start(async () => {
                  const r = await importItemsExcel(eventId, fd);
                  if ("error" in r && r.error) return setMsg(r.error);
                  if ("items" in r && r.items) {
                    setRows(r.items.map((i) => ({ ...i, specs: i.specs })));
                    setMsg(`${r.items.length} SKUs importados. ${r.warnings?.join(" ") ?? ""} Revise y guarde.`);
                  }
                })
              }
            >
              <input type="file" name="file" accept=".xlsx" className="text-xs" />
              <button className="btn-secondary btn-sm">Importar</button>
            </form>
          </div>
          <div className="rounded-md border border-dashed border-gray-300 p-3 text-sm">
            <b>Pegar desde Excel</b> (copie filas: VTA, G, Descripción, Cantidad, {specs.map((s) => s.labelEs).join(", ")})
            <textarea className="input mt-2 h-10" placeholder="Pegue aquí (Ctrl+V)…" onPaste={onPaste} />
          </div>
        </div>
      )}
      {msg && <p className="rounded bg-blue-50 p-2 text-sm text-blue-800">{msg}</p>}
      <div className="overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th>#</th>
              <th>Código VTA</th>
              <th>Código G</th>
              <th className="min-w-64">Descripción</th>
              <th>Cantidad (TM)</th>
              {specs.map((s) => <th key={s.key}>{s.labelEs}{s.unit ? `, ${s.unit}` : ""}</th>)}
              {editable && <th />}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id ?? `n${i}`}>
                <td className="text-gray-400">{i + 1}</td>
                <td><input disabled={!editable} className="input py-0.5 text-xs" value={r.vtaCode ?? ""} onChange={(e) => set(i, { vtaCode: e.target.value })} /></td>
                <td><input disabled={!editable} className="input py-0.5 text-xs" value={r.gCode} onChange={(e) => set(i, { gCode: e.target.value })} /></td>
                <td><input disabled={!editable} className="input py-0.5 text-xs" value={r.description} onChange={(e) => set(i, { description: e.target.value })} /></td>
                <td><input disabled={!editable} className="input w-20 py-0.5 text-right text-xs" type="number" step="any" value={r.quantity} onChange={(e) => set(i, { quantity: Number(e.target.value) })} /></td>
                {specs.map((s) => (
                  <td key={s.key}>
                    <input disabled={!editable} className="input w-20 py-0.5 text-right text-xs" value={String(r.specs?.[s.key] ?? "")} onChange={(e) => setSpec(i, s.key, e.target.value)} />
                  </td>
                ))}
                {editable && <td><button type="button" className="text-red-600" onClick={() => setRows((x) => x.filter((_, j) => j !== i))}>✕</button></td>}
              </tr>
            ))}
            <tr className="font-semibold">
              <td colSpan={4} className="text-right">Total</td>
              <td className="num">{total.toLocaleString("en-US")}</td>
              <td colSpan={specs.length + 1} />
            </tr>
          </tbody>
        </table>
      </div>
      {editable && (
        <div className="flex gap-2">
          <button type="button" className="btn-secondary" onClick={() => setRows((r) => [...r, { gCode: "", description: "", quantity: 0, specs: {} }])}>+ Agregar fila</button>
          <button
            type="button"
            disabled={pending}
            className="btn"
            onClick={() =>
              start(async () => {
                const r = await saveItems(eventId, rows);
                setMsg(r.error ?? "SKUs guardados");
              })
            }
          >
            {pending ? "Guardando…" : "Guardar SKUs"}
          </button>
        </div>
      )}
    </div>
  );
}
