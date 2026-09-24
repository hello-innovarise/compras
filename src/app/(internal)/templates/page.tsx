import Link from "next/link";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Templates() {
  const list = await prisma.template.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { fields: true, events: true } } } });
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="h1">Plantillas de licitación</h1>
        <Link className="btn" href="/templates/new">+ Nueva plantilla</Link>
      </div>
      <div className="card">
        <table className="tbl">
          <thead><tr><th>Nombre</th><th>Categoría</th><th>Precio base</th><th>Plazos</th><th className="num">Columnas</th><th className="num">Licitaciones</th></tr></thead>
          <tbody>{list.map((t) => <tr key={t.id}><td><Link className="text-brand underline" href={`/templates/${t.id}`}>{t.name}</Link></td><td>{t.category}</td><td>{t.baseLabel}</td><td>{(t.financingTerms as number[]).join(", ")} días</td><td className="num">{t._count.fields}</td><td className="num">{t._count.events}</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}
