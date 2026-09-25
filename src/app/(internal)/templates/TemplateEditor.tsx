"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { FieldDef, TemplateDef } from "@/lib/templates";
import { saveTemplate } from "./actions";

const SECTIONS = [
  ["SKU_SPEC", "Medida/especificación (Compras)"],
  ["OFFER_TECH", "Técnico (proveedor)"],
  ["OFFER_COMPLIANCE", "Cumplimiento (proveedor)"],
  ["OFFER_TERMS", "Términos (proveedor)"],
] as const;
const TYPES = [["NUMBER", "Número"], ["TEXT", "Texto"], ["OKNO", "OK / NO"], ["DATE", "Fecha"]] as const;

export function TemplateEditor({ id, initial, readOnly }: { id: string | null; initial: TemplateDef; readOnly: boolean }) {
  const [t, setT] = useState(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const setF = (i: number, p: Partial<FieldDef>) => setT((x) => ({ ...x, fields: x.fields.map((f, j) => (j === i ? { ...f, ...p } : f)) }));
  const move = (i: number, d: number) => setT((x) => { const fs = [...x.fields]; const j = i + d; if (j < 0 || j >= fs.length) return x; [fs[i], fs[j]] = [fs[j], fs[i]]; return { ...x, fields: fs }; });
  return (
    <fieldset disabled={readOnly} className="space-y-4">
      <div className="card grid gap-3 md:grid-cols-4">
        <label><span className="label">Nombre</span><input className="input" value={t.name} onChange={(e) => setT({ ...t, name: e.target.value })} /></label>
        <label><span className="label">Categoría</span><input className="input" value={t.category} onChange={(e) => setT({ ...t, category: e.target.value })} /></label>
        <label><span className="label">Etiqueta precio base</span><input className="input" value={t.baseLabel} onChange={(e) => setT({ ...t, baseLabel: e.target.value })} /></label>
        <label><span className="label">TM por contenedor</span><input className="input" type="number" step="any" value={t.containerTons ?? ""} onChange={(e) => setT({ ...t, containerTons: e.target.value ? Number(e.target.value) : null })} /></label>
        <label className="md:col-span-2"><span className="label">Plazos de financiamiento (días, separados por coma)</span><input className="input" value={t.financingTerms.join(", ")} onChange={(e) => setT({ ...t, financingTerms: e.target.value.split(/[,\s]+/).map(Number).filter((n) => n > 0) })} /></label>
        <label className="md:col-span-2"><span className="label">Descripción</span><input className="input" value={t.description ?? ""} onChange={(e) => setT({ ...t, description: e.target.value })} /></label>
      </div>
      <div className="card space-y-2">
        <h3 className="h2">Componentes del precio base (suman el {t.baseLabel})</h3>
        {t.priceComponents.map((c, i) => (
          <div key={i} className="flex gap-2">
            <input className="input max-w-32" placeholder="clave" value={c.key} onChange={(e) => setT({ ...t, priceComponents: t.priceComponents.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)) })} />
            <input className="input" placeholder="Etiqueta ES" value={c.labelEs} onChange={(e) => setT({ ...t, priceComponents: t.priceComponents.map((x, j) => (j === i ? { ...x, labelEs: e.target.value } : x)) })} />
            <input className="input" placeholder="Label EN" value={c.labelEn} onChange={(e) => setT({ ...t, priceComponents: t.priceComponents.map((x, j) => (j === i ? { ...x, labelEn: e.target.value } : x)) })} />
            <button type="button" className="text-red-600" onClick={() => setT({ ...t, priceComponents: t.priceComponents.filter((_, j) => j !== i) })}>✕</button>
          </div>
        ))}
        <button type="button" className="btn-secondary btn-sm" onClick={() => setT({ ...t, priceComponents: [...t.priceComponents, { key: "", labelEs: "", labelEn: "" }] })}>+ Componente</button>
      </div>
      <div className="card space-y-2">
        <h3 className="h2">Documentos requeridos al proveedor</h3>
        {t.requiredDocs.map((c, i) => (
          <div key={i} className="flex gap-2">
            <input className="input max-w-32" placeholder="clave" value={c.key} onChange={(e) => setT({ ...t, requiredDocs: t.requiredDocs.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)) })} />
            <input className="input" placeholder="Etiqueta ES" value={c.labelEs} onChange={(e) => setT({ ...t, requiredDocs: t.requiredDocs.map((x, j) => (j === i ? { ...x, labelEs: e.target.value } : x)) })} />
            <input className="input" placeholder="Label EN" value={c.labelEn} onChange={(e) => setT({ ...t, requiredDocs: t.requiredDocs.map((x, j) => (j === i ? { ...x, labelEn: e.target.value } : x)) })} />
            <button type="button" className="text-red-600" onClick={() => setT({ ...t, requiredDocs: t.requiredDocs.filter((_, j) => j !== i) })}>✕</button>
          </div>
        ))}
        <button type="button" className="btn-secondary btn-sm" onClick={() => setT({ ...t, requiredDocs: [...t.requiredDocs, { key: "", labelEs: "", labelEn: "" }] })}>+ Documento</button>
      </div>
      <div className="card overflow-x-auto">
        <h3 className="h2 mb-2">Columnas</h3>
        <table className="tbl">
          <thead><tr><th /><th>Clave</th><th>Etiqueta ES</th><th>Label EN</th><th>Sección</th><th>Tipo</th><th>Unidad</th><th>Oblig.</th><th>Encabezados alternos (Excel)</th><th /></tr></thead>
          <tbody>
            {t.fields.map((f, i) => (
              <tr key={i}>
                <td className="whitespace-nowrap"><button type="button" onClick={() => move(i, -1)}>▲</button><button type="button" onClick={() => move(i, 1)}>▼</button></td>
                <td><input className="input py-0.5 text-xs" value={f.key} onChange={(e) => setF(i, { key: e.target.value })} /></td>
                <td><input className="input py-0.5 text-xs" value={f.labelEs} onChange={(e) => setF(i, { labelEs: e.target.value })} /></td>
                <td><input className="input py-0.5 text-xs" value={f.labelEn} onChange={(e) => setF(i, { labelEn: e.target.value })} /></td>
                <td><select className="input py-0.5 text-xs" value={f.section} onChange={(e) => setF(i, { section: e.target.value as FieldDef["section"] })}>{SECTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></td>
                <td><select className="input py-0.5 text-xs" value={f.type} onChange={(e) => setF(i, { type: e.target.value as FieldDef["type"] })}>{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></td>
                <td><input className="input w-16 py-0.5 text-xs" value={f.unit ?? ""} onChange={(e) => setF(i, { unit: e.target.value })} /></td>
                <td className="text-center"><input type="checkbox" checked={!!f.required} onChange={(e) => setF(i, { required: e.target.checked })} /></td>
                <td><input className="input py-0.5 text-xs" value={(f.aliases ?? []).join(" | ")} onChange={(e) => setF(i, { aliases: e.target.value.split("|").map((s) => s.trim()).filter(Boolean) })} /></td>
                <td><button type="button" className="text-red-600" onClick={() => setT({ ...t, fields: t.fields.filter((_, j) => j !== i) })}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="button" className="btn-secondary btn-sm mt-2" onClick={() => setT({ ...t, fields: [...t.fields, { key: "", labelEs: "", labelEn: "", section: "SKU_SPEC", type: "NUMBER" }] })}>+ Columna</button>
      </div>
      {!readOnly && (
        <div className="flex items-center gap-2">
          <button type="button" className="btn" disabled={pending} onClick={() => start(async () => { const r = await saveTemplate(id, t); setMsg(r.error ?? "Plantilla guardada"); if (r.ok && !id) router.push(`/templates/${r.id}`); })}>{pending ? "Guardando…" : "Guardar plantilla"}</button>
          {msg && <span className="text-sm">{msg}</span>}
        </div>
      )}
    </fieldset>
  );
}
