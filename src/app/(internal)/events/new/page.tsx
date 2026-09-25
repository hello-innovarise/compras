import { prisma } from "@/lib/db";
import { Flash } from "@/components/ui";
import { EventForm } from "../EventForm";
import { createEvent } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewEvent({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const templates = await prisma.template.findMany({ orderBy: { name: "asc" } });
  const n = await prisma.event.count();
  const d = new Date(Date.now() + 7 * 86400000);
  d.setUTCHours(18, 0, 0, 0);
  return (
    <div className="space-y-4">
      <h1 className="h1">Nueva licitación</h1>
      <Flash error={error} />
      <form action={createEvent} className="card space-y-4">
        <EventForm
          templates={templates}
          v={{
            code: `RFQ-${new Date().getFullYear()}-${String(n + 1).padStart(3, "0")}`,
            deadline: d,
            templateId: templates[0]?.id,
            sealed: true,
            introEs: "Adjunto solicitud de cotización. En el adjunto encontrarán una tabla de medidas específicas por cada SKU, sobre esas medidas deben cotizar por favor.",
            introEn: "Please find attached a request for quotation. Quote on the specific dimensions listed for each SKU.",
          }}
        />
        <button className="btn">Crear y agregar SKUs →</button>
      </form>
    </div>
  );
}
