import Link from "next/link";
import { prisma } from "@/lib/db";
import { Empty, Field, Flash } from "@/components/ui";
import { createSupplier, importNep } from "./actions";

export const dynamic = "force-dynamic";

export default async function Suppliers({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const q = sp.q;
  const list = await prisma.supplier.findMany({
    where: q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { code: { contains: q } }, { country: { contains: q, mode: "insensitive" } }] } : {},
    orderBy: { name: "asc" },
    include: { contacts: true, evaluations: true, incidents: { where: { open: true } }, _count: { select: { invitations: true } } },
    take: 300,
  });
  return (
    <div className="space-y-4">
      <h1 className="h1">Proveedores</h1>
      <Flash msg={sp.msg} error={sp.error} />
      <div className="grid gap-4 md:grid-cols-3">
        <section className="card md:col-span-2">
          <form className="mb-2 flex gap-2"><input name="q" defaultValue={q} className="input max-w-xs" placeholder="Buscar" /><button className="btn-secondary">Buscar</button></form>
          {list.length === 0 ? <Empty>Sin proveedores.</Empty> : (
            <table className="tbl">
              <thead><tr><th>Código</th><th>Nombre</th><th>País</th><th>Idioma</th><th>Contactos</th><th className="num">N.E.P prom.</th><th className="num">Incidencias abiertas</th><th className="num">Licitaciones</th><th>Activo</th></tr></thead>
              <tbody>
                {list.map((s) => (
                  <tr key={s.id}>
                    <td>{s.code}</td>
                    <td><Link className="text-brand underline" href={`/suppliers/${s.id}`}>{s.name}</Link></td>
                    <td>{s.country}</td>
                    <td>{s.locale.toUpperCase()}</td>
                    <td>{s.contacts.map((c) => c.email).join(", ")}</td>
                    <td className="num">{s.evaluations.length ? (s.evaluations.reduce((a, e) => a + e.score, 0) / s.evaluations.length).toFixed(1) : "—"}</td>
                    <td className="num">{s.incidents.length || ""}</td>
                    <td className="num">{s._count.invitations}</td>
                    <td>{s.active ? "Sí" : "No"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <div className="space-y-4">
          <form action={createSupplier} className="card space-y-2">
            <h2 className="h2">Nuevo proveedor</h2>
            <Field label="Código ERP/SAP"><input name="code" className="input" /></Field>
            <Field label="Nombre"><input name="name" className="input" required /></Field>
            <Field label="País"><input name="country" className="input" /></Field>
            <Field label="Idioma"><select name="locale" className="input"><option value="es">Español</option><option value="en">English</option></select></Field>
            <Field label="Correos (separados por coma)"><input name="emails" className="input" /></Field>
            <button className="btn">Crear</button>
          </form>
          <form action={importNep} className="card space-y-2">
            <h2 className="h2">Importar evaluación N.E.P</h2>
            <p className="text-xs text-gray-500">Excel con CODIGO, PROVEEDOR y columnas S1/S2 bajo cada año (como la hoja N.E.P), o columnas CODIGO | AÑO | SEMESTRE | NOTA.</p>
            <input type="file" name="file" accept=".xlsx" className="text-sm" required />
            <button className="btn-secondary">Importar</button>
          </form>
        </div>
      </div>
    </div>
  );
}
