import { toDateInput, toLocalInput } from "@/lib/forms";
import { Field } from "@/components/ui";

export interface EventFormValues {
  title?: string;
  code?: string;
  family?: string;
  material?: string | null;
  templateId?: string;
  deadline?: Date;
  timezone?: string;
  committeeDate?: Date | null;
  priceValidity?: Date | null;
  shipmentDate?: Date | null;
  etaDays?: number | null;
  incoterm?: string | null;
  destination?: string | null;
  port?: string | null;
  freeDays?: number | null;
  containerTons?: number | null;
  surveyor?: string | null;
  introEs?: string | null;
  introEn?: string | null;
  conditions?: string | null;
  sealed?: boolean;
}

export function EventForm({ v, templates, lockTemplate }: { v: EventFormValues; templates: { id: string; name: string }[]; lockTemplate?: boolean }) {
  const tz = v.timezone ?? "America/Guatemala";
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
      <Field label="Título" className="md:col-span-2"><input name="title" className="input" required defaultValue={v.title} /></Field>
      <Field label="Código"><input name="code" className="input" required defaultValue={v.code} /></Field>
      <Field label="Familia"><input name="family" className="input" required defaultValue={v.family} placeholder="Perfiles, HRC, Palanquilla…" /></Field>
      <Field label="Plantilla" className="md:col-span-2">
        <select name="templateId" className="input" defaultValue={v.templateId} disabled={lockTemplate} required>
          {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </Field>
      <Field label="Material" className="md:col-span-2"><input name="material" className="input" defaultValue={v.material ?? ""} /></Field>
      <Field label="Fecha y hora límite"><input name="deadline" type="datetime-local" className="input" required defaultValue={toLocalInput(v.deadline, tz)} /></Field>
      <Field label="Zona horaria">
        <select name="timezone" className="input" defaultValue={tz}>
          {["America/Guatemala", "America/El_Salvador", "America/Tegucigalpa", "America/Mexico_City", "UTC", "Europe/Istanbul", "Asia/Shanghai"].map((z) => <option key={z}>{z}</option>)}
        </select>
      </Field>
      <Field label="Fecha comité de compras"><input name="committeeDate" type="date" className="input" defaultValue={toDateInput(v.committeeDate)} /></Field>
      <Field label="Vigencia de precios solicitada"><input name="priceValidity" type="date" className="input" defaultValue={toDateInput(v.priceValidity)} /></Field>
      <Field label="Última fecha de embarque"><input name="shipmentDate" type="date" className="input" defaultValue={toDateInput(v.shipmentDate)} /></Field>
      <Field label="ETA (días después del embarque)"><input name="etaDays" type="number" className="input" defaultValue={v.etaDays ?? 35} /></Field>
      <Field label="Incoterm"><input name="incoterm" className="input" defaultValue={v.incoterm ?? "CIF CY"} /></Field>
      <Field label="Destino"><input name="destination" className="input" defaultValue={v.destination ?? "Planta SIDEGUA"} /></Field>
      <Field label="Puerto"><input name="port" className="input" defaultValue={v.port ?? "Puerto Quetzal"} /></Field>
      <Field label="Días libres en destino"><input name="freeDays" type="number" className="input" defaultValue={v.freeDays ?? 21} /></Field>
      <Field label="TM por contenedor"><input name="containerTons" type="number" step="0.1" className="input" defaultValue={v.containerTons ?? ""} /></Field>
      <Field label="Surveyor"><input name="surveyor" className="input" defaultValue={v.surveyor ?? ""} /></Field>
      <Field label="Ofertas selladas" className="md:col-span-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="sealed" defaultChecked={v.sealed ?? true} />
          Ocultar precios hasta el cierre (Compras ve quién envió, pero no los precios) — recomendado
        </label>
      </Field>
      <Field label="Texto del correo (español)" className="md:col-span-2"><textarea name="introEs" rows={4} className="input" defaultValue={v.introEs ?? ""} /></Field>
      <Field label="Texto del correo (inglés)" className="md:col-span-2"><textarea name="introEn" rows={4} className="input" defaultValue={v.introEn ?? ""} /></Field>
      <Field label="Requisitos, aspectos legales y logísticos" className="md:col-span-4"><textarea name="conditions" rows={8} className="input" defaultValue={v.conditions ?? ""} /></Field>
    </div>
  );
}
