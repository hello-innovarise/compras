import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { toTemplateDef, type TemplateDef } from "@/lib/templates";
import { TemplateEditor } from "../TemplateEditor";
import { duplicateTemplate } from "../actions";

export const dynamic = "force-dynamic";

const BLANK: TemplateDef = {
  name: "",
  category: "",
  baseLabel: "CIF",
  priceComponents: [
    { key: "fob", labelEs: "Precio FOB contado", labelEn: "Price FOB cash" },
    { key: "freight", labelEs: "Flete", labelEn: "Freight" },
    { key: "insurance", labelEs: "Seguro", labelEn: "Insurance" },
  ],
  financingTerms: [30, 60, 90, 120],
  containerTons: null,
  requiredDocs: [{ key: "tc", labelEs: "Terms and conditions firmado", labelEn: "Signed Terms and Conditions" }],
  fields: [
    { key: "mill1", labelEs: "Molino", labelEn: "Mill", section: "OFFER_TECH", type: "TEXT" },
    { key: "comments", labelEs: "Comentarios", labelEn: "Comments", section: "OFFER_COMPLIANCE", type: "TEXT" },
    { key: "paymentTerms", labelEs: "Términos de pago", labelEn: "Payment terms", section: "OFFER_TERMS", type: "TEXT" },
    { key: "origin", labelEs: "Origen", labelEn: "Origin", section: "OFFER_TERMS", type: "TEXT" },
    { key: "incoterm", labelEs: "Incoterm", labelEn: "Incoterm", section: "OFFER_TERMS", type: "TEXT" },
    { key: "validity", labelEs: "Vigencia de precios", labelEn: "Price validity", section: "OFFER_TERMS", type: "TEXT" },
  ],
};

export default async function TemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (id === "new") return (<div className="space-y-4"><h1 className="h1">Nueva plantilla</h1><TemplateEditor id={null} initial={BLANK} readOnly={false} /></div>);
  const t = await prisma.template.findUnique({ where: { id }, include: { fields: true } });
  if (!t) notFound();
  const used = await prisma.event.count({ where: { templateId: id, status: { not: "DRAFT" } } });
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="h1">{t.name}</h1>
        <form action={duplicateTemplate.bind(null, id)}><button className="btn-secondary">Duplicar (nueva versión)</button></form>
      </div>
      {used > 0 && <p className="rounded bg-amber-50 p-2 text-sm text-amber-800">Esta plantilla está en uso por {used} licitación(es) publicada(s); es de solo lectura. Duplíquela para modificarla.</p>}
      <TemplateEditor id={id} initial={toTemplateDef(t)} readOnly={used > 0} />
    </div>
  );
}
