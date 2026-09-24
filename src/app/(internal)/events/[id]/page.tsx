import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { loadEvent, templateOf, effectiveBids, comparison } from "@/lib/events";
import { sectionFields } from "@/lib/templates";
import { Badge, Empty, Flash, Tabs } from "@/components/ui";
import { fmtDate } from "@/lib/i18n";
import { toLocalInput } from "@/lib/forms";
import { baseUrl } from "@/lib/mail";
import { fmt, termLabel } from "@/lib/pricing";
import { EventForm } from "../EventForm";
import { ItemsEditor } from "./ItemsEditor";
import * as A from "../actions";
import { createMatrixFromEvent } from "../../torre/actions";

export const dynamic = "force-dynamic";

export default async function EventPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const ev = await loadEvent(id);
  if (!ev) notFound();
  const t = templateOf(ev);
  const tab = sp.tab ?? "general";
  const base = `/events/${id}`;
  const draft = ev.status === "DRAFT";
  const tabs = [
    { key: "general", label: "General", href: base },
    { key: "items", label: `SKUs (${ev.items.length})`, href: `${base}?tab=items` },
    { key: "suppliers", label: `Proveedores (${ev.invitations.length})`, href: `${base}?tab=suppliers` },
    { key: "documents", label: `Documentos (${ev.documents.length})`, href: `${base}?tab=documents` },
    { key: "compare", label: "Comparativo", href: `${base}?tab=compare` },
    { key: "rounds", label: `Rondas (${ev.currentRound})`, href: `${base}?tab=rounds` },
    { key: "award", label: "Adjudicación", href: `/events/${id}/award` },
    { key: "log", label: "Bitácora", href: `${base}?tab=log` },
  ];
  const submitted = effectiveBids(ev);
  const sealedNow = ev.sealed && ev.status === "OPEN";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-sm text-gray-500">{ev.code} · {ev.family} · {t.name}</div>
          <h1 className="h1">{ev.title}</h1>
          <div className="mt-1 flex items-center gap-3 text-sm">
            <Badge status={ev.status} />
            <span>Ronda {ev.currentRound}</span>
            <span>Cierre: <b>{fmtDate(ev.deadline, "es", ev.timezone, true)}</b> ({ev.timezone})</span>
            <span>{ev.sealed ? "🔒 Sellada" : "Visible"}</span>
            <span>Ofertas: {submitted.size}/{ev.invitations.length}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {draft && <form action={A.publish.bind(null, id)}><button className="btn">Publicar y enviar invitaciones</button></form>}
          {ev.status === "OPEN" && <form action={A.closeNow.bind(null, id)}><button className="btn-secondary">Cerrar ahora</button></form>}
          {(ev.status === "OPEN" || ev.status === "CLOSED") && (
            <form action={A.extendDeadline.bind(null, id)} className="flex gap-1">
              <input type="datetime-local" name="deadline" className="input py-1 text-xs" defaultValue={toLocalInput(ev.deadline, ev.timezone)} />
              <button className="btn-secondary btn-sm">{ev.status === "CLOSED" ? "Reabrir hasta" : "Cambiar cierre"}</button>
            </form>
          )}
          <form action={A.duplicateEvent.bind(null, id)}><button className="btn-secondary">Duplicar</button></form>
          {ev.status !== "CANCELLED" && ev.status !== "AWARDED" && <form action={A.cancelEvent.bind(null, id)}><button className="btn-secondary text-red-700">Cancelar</button></form>}
        </div>
      </div>
      <Flash msg={sp.msg} error={sp.error} />
      <Tabs tabs={tabs} active={tab} />

      {tab === "general" && (
        <form action={A.updateEvent.bind(null, id)} className="card space-y-4">
          {!draft && <p className="rounded bg-amber-50 p-2 text-sm text-amber-800">Evento publicado: solo se guardan título, textos, condiciones y fecha de comité. Use &quot;Cambiar cierre&quot; para la fecha límite.</p>}
          <EventForm v={ev} templates={await prisma.template.findMany()} lockTemplate={!draft} />
          <button className="btn">Guardar</button>
        </form>
      )}

      {tab === "items" && (
        <div className="card">
          <ItemsEditor
            eventId={id}
            editable={draft}
            specs={sectionFields(t.fields, "SKU_SPEC")}
            initial={ev.items.map((i) => ({ id: i.id, vtaCode: i.vtaCode, gCode: i.gCode, description: i.description, quantity: i.quantity, specs: i.specs as Record<string, unknown> }))}
          />
        </div>
      )}

      {tab === "suppliers" && <SuppliersTab ev={ev} sp={sp} />}

      {tab === "documents" && (
        <div className="card space-y-3">
          <p className="text-sm text-gray-600">Documentos que verán los proveedores en el portal (Especificación de material, Terms and conditions, anexo logístico…).</p>
          {ev.documents.length === 0 ? <Empty>Sin documentos.</Empty> : (
            <ul className="divide-y text-sm">
              {ev.documents.map((d) => (
                <li key={d.id} className="flex items-center justify-between py-2">
                  <a className="text-brand underline" href={`/api/files/event/${d.id}`}>{d.name}</a>
                  <span className="text-gray-500">{(d.size / 1024).toFixed(0)} KB</span>
                  <form action={A.deleteDocument.bind(null, id, d.id)}><button className="text-xs text-red-600">Eliminar</button></form>
                </li>
              ))}
            </ul>
          )}
          <form action={A.uploadDocument.bind(null, id)} className="flex gap-2">
            <input type="file" name="file" multiple className="text-sm" />
            <button className="btn-secondary">Subir</button>
          </form>
          <div className="text-sm">
            <b>Documentos requeridos al proveedor (plantilla):</b> {t.requiredDocs.map((d) => d.labelEs).join(" · ") || "—"}
          </div>
        </div>
      )}

      {tab === "compare" && <CompareTab ev={ev} sp={sp} sealed={sealedNow} />}

      {tab === "rounds" && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="card">
            <h2 className="h2 mb-2">Rondas</h2>
            <table className="tbl">
              <thead><tr><th>#</th><th>Cierre</th><th>Cerrada</th><th>Nota</th><th className="num">Ofertas</th></tr></thead>
              <tbody>
                {ev.rounds.map((r) => (
                  <tr key={r.id}>
                    <td>{r.number}</td>
                    <td>{fmtDate(r.deadline, "es", ev.timezone, true)}</td>
                    <td>{r.closedAt ? fmtDate(r.closedAt, "es", ev.timezone, true) : "—"}</td>
                    <td>{r.note}</td>
                    <td className="num">{ev.bids.filter((b) => b.round === r.number && b.status === "SUBMITTED").length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card">
            <h2 className="h2 mb-2">Abrir nueva ronda de negociación</h2>
            {ev.status !== "CLOSED" ? (
              <Empty>Disponible cuando la ronda actual esté cerrada.</Empty>
            ) : (
              <form action={A.newRound.bind(null, id)} className="space-y-3">
                <p className="text-sm text-gray-600">Los proveedores seleccionados recibirán un nuevo enlace; verán su oferta anterior para mejorarla. Los no seleccionados mantienen su última oferta.</p>
                <div className="space-y-1 text-sm">
                  {ev.invitations.filter((i) => submitted.has(i.id)).map((i) => (
                    <label key={i.id} className="flex items-center gap-2"><input type="checkbox" name="invitationId" value={i.id} defaultChecked /> {i.supplier.name}</label>
                  ))}
                </div>
                <div><span className="label">Nueva fecha límite</span><input type="datetime-local" name="deadline" required className="input" /></div>
                <div><span className="label">Mensaje / nota para la ronda</span><textarea name="note" className="input" rows={3} placeholder="Ej. favor mejorar precio y días de crédito" /></div>
                <button className="btn">Abrir ronda {ev.currentRound + 1}</button>
              </form>
            )}
          </div>
        </div>
      )}

      {tab === "log" && <LogTab eventId={id} invitationIds={ev.invitations.map((i) => i.id)} />}
    </div>
  );
}

async function SuppliersTab({ ev, sp }: { ev: NonNullable<Awaited<ReturnType<typeof loadEvent>>>; sp: Record<string, string | undefined> }) {
  const all = await prisma.supplier.findMany({ where: { active: true }, orderBy: { name: "asc" }, include: { contacts: true } });
  const invited = new Set(ev.invitations.map((i) => i.supplierId));
  const available = all.filter((s) => !invited.has(s.id));
  return (
    <div className="space-y-4">
      {sp.link && (
        <div className="rounded-md bg-blue-50 p-3 text-sm">
          Enlace del portal (compártalo solo con el proveedor): <code className="select-all break-all">{baseUrl() + sp.link}</code>
        </div>
      )}
      <div className="card">
        <h2 className="h2 mb-2">Monitor de proveedores</h2>
        {ev.invitations.length === 0 ? <Empty>Sin proveedores invitados.</Empty> : (
          <table className="tbl">
            <thead><tr><th>Proveedor</th><th>País</th><th>Contactos</th><th>Estado</th><th>Hasta ronda</th><th>Última oferta</th><th>Excel</th><th>Acciones</th></tr></thead>
            <tbody>
              {ev.invitations.map((i) => {
                const bids = ev.bids.filter((b) => b.invitationId === i.id).sort((a, b) => b.round - a.round);
                const last = bids[0];
                return (
                  <tr key={i.id}>
                    <td className="font-medium">{i.supplier.name}</td>
                    <td>{i.supplier.country}</td>
                    <td>{i.supplier.contacts.map((c) => c.email).join(", ")}</td>
                    <td><Badge status={i.status} />{i.declinedReason && <div className="text-xs text-gray-500">{i.declinedReason}</div>}</td>
                    <td>{i.maxRound}</td>
                    <td>{last ? <>R{last.round} · {last.status === "SUBMITTED" ? `v${last.version} ${fmtDate(last.submittedAt, "es", ev.timezone, true)}` : "borrador"} · {last.source}</> : "—"}</td>
                    <td><a className="text-brand underline" href={`/api/events/${ev.id}/excel?invitation=${i.id}`}>Descargar</a></td>
                    <td className="space-x-2 whitespace-nowrap">
                      {ev.status === "OPEN" && <form className="inline" action={A.resendInvitation.bind(null, ev.id, i.id)}><button className="text-xs text-brand underline">Reenviar</button></form>}
                      {ev.status !== "DRAFT" && <form className="inline" action={A.copyPortalLink.bind(null, ev.id, i.id)}><button className="text-xs text-brand underline">Obtener enlace</button></form>}
                      {ev.status === "DRAFT" && <form className="inline" action={A.removeInvitation.bind(null, ev.id, i.id)}><button className="text-xs text-red-600">Quitar</button></form>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      {ev.status !== "CANCELLED" && ev.status !== "AWARDED" && (
        <form action={A.inviteSuppliers.bind(null, ev.id)} className="card space-y-2">
          <h2 className="h2">Invitar proveedores</h2>
          {available.length === 0 ? <Empty>No hay más proveedores activos. <Link href="/suppliers" className="underline">Crear proveedor</Link></Empty> : (
            <div className="grid gap-1 text-sm md:grid-cols-3">
              {available.map((s) => (
                <label key={s.id} className="flex items-center gap-2"><input type="checkbox" name="supplierId" value={s.id} /> {s.name} <span className="text-gray-400">{s.country}</span></label>
              ))}
            </div>
          )}
          <button className="btn-secondary">Agregar seleccionados{ev.status === "OPEN" ? " y enviar invitación" : ""}</button>
        </form>
      )}
    </div>
  );
}

function CompareTab({ ev, sp, sealed }: { ev: NonNullable<Awaited<ReturnType<typeof loadEvent>>>; sp: Record<string, string | undefined>; sealed: boolean }) {
  if (sealed)
    return (
      <div className="card">
        <Empty>🔒 Ofertas selladas: los precios se muestran al cierre ({fmtDate(ev.deadline, "es", ev.timezone, true)}). Puede ver quién ya envió en la pestaña Proveedores.</Empty>
      </div>
    );
  const round = Number(sp.round ?? ev.currentRound);
  const term = Number(sp.term ?? 0);
  const c = comparison(ev, round, term);
  const base = `/events/${ev.id}?tab=compare`;
  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center gap-2 text-sm">
        <span className="label mb-0">Ronda</span>
        {ev.rounds.map((r) => <Link key={r.number} href={`${base}&round=${r.number}&term=${term}`} className={r.number === round ? "btn btn-sm" : "btn-secondary btn-sm"}>{r.number}</Link>)}
        <span className="label mb-0 ml-4">Plazo</span>
        {c.terms.map((x) => <Link key={x} href={`${base}&round=${round}&term=${x}`} className={x === term ? "btn btn-sm" : "btn-secondary btn-sm"}>{termLabel(x)}</Link>)}
        <a className="btn-secondary btn-sm ml-auto" href={`/api/events/${ev.id}/compare?round=${round}`}>Exportar Excel</a>
        <form action={createMatrixFromEvent.bind(null, ev.id)}><button className="btn btn-sm">Crear matriz de evaluación →</button></form>
      </div>
      {c.suppliers.length === 0 ? <div className="card"><Empty>Aún no hay ofertas enviadas.</Empty></div> : (
        <>
          <div className="card overflow-x-auto">
            <h2 className="h2 mb-2">Resumen por proveedor – {termLabel(term)}</h2>
            <table className="tbl">
              <thead><tr><th>Proveedor</th><th className="num">TM ofertadas</th><th className="num">SKUs cotizados</th><th className="num">Cobertura</th><th className="num">Mejor precio en</th><th className="num">Total USD</th><th className="num">Promedio ponderado / TM</th><th className="num">Contenedores</th><th>Ronda / fuente</th></tr></thead>
              <tbody>
                {c.summary.map((s) => (
                  <tr key={s.invitationId}>
                    <td className="font-medium">{s.name}</td>
                    <td className="num">{fmt(s.qty, 1)}</td>
                    <td className="num">{s.covered} / {c.rows.length}</td>
                    <td className="num">{(s.coverage * 100).toFixed(0)}%</td>
                    <td className="num">{s.bestCount} SKUs</td>
                    <td className="num">{fmt(s.total)}</td>
                    <td className="num font-semibold">{fmt(s.weighted)}</td>
                    <td className="num">{c.template.containerTons || ev.containerTons ? fmt(s.qty / (ev.containerTons ?? c.template.containerTons ?? 1), 1) : "—"}</td>
                    <td>R{s.bid.round} · v{s.bid.version} · {s.bid.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card overflow-x-auto">
            <h2 className="h2 mb-2">Comparativo por SKU – USD/TM {termLabel(term)}</h2>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Código G</th><th>Descripción</th><th className="num">TM</th>
                  {c.suppliers.map((s) => <th key={s.invitationId} className="num">{s.name}</th>)}
                  <th className="num">Mejor</th>
                </tr>
              </thead>
              <tbody>
                {c.rows.map((r) => (
                  <tr key={r.itemId}>
                    <td>{r.gCode}</td>
                    <td>{r.description}</td>
                    <td className="num">{fmt(r.quantity, 1)}</td>
                    {c.suppliers.map((s) => {
                      const cell = r.cells.get(s.invitationId);
                      if (!cell || cell.price === null) return <td key={s.invitationId} className="num text-gray-300">—</td>;
                      return (
                        <td key={s.invitationId} className={`num ${cell.best ? "bg-green-100 font-bold text-green-900" : ""}`} title={cell.comments ?? ""}>
                          {fmt(cell.price)}
                          <div className="text-[10px] font-normal text-gray-500">
                            {fmt(cell.offeredQty, 0)} TM{cell.shortQty && <span className="text-amber-600"> ▼</span>}
                            {cell.noCompliance.length > 0 && <span className="text-red-600" title={`No cumple: ${cell.noCompliance.join(", ")}`}> ⚠ {cell.noCompliance.length}</span>}
                            {cell.comments && cell.comments !== "NO" && <span title={cell.comments}> 💬</span>}
                          </div>
                        </td>
                      );
                    })}
                    <td className="num font-semibold">{fmt(r.bestPrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-gray-500">Verde = mejor precio · ▼ cantidad ofertada menor a la solicitada · ⚠ incumplimientos de especificación · 💬 comentarios del proveedor</p>
          </div>
        </>
      )}
    </div>
  );
}

async function LogTab({ eventId, invitationIds }: { eventId: string; invitationIds: string[] }) {
  const [logs, emails] = await Promise.all([
    prisma.auditLog.findMany({ where: { OR: [{ entityId: eventId }, { entityId: { in: invitationIds } }] }, orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.emailLog.findMany({ where: { eventId }, orderBy: { createdAt: "desc" }, take: 200 }),
  ]);
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="card">
        <h2 className="h2 mb-2">Bitácora de auditoría</h2>
        <table className="tbl">
          <thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Detalle</th></tr></thead>
          <tbody>{logs.map((l) => <tr key={l.id}><td className="whitespace-nowrap">{l.createdAt.toISOString().replace("T", " ").slice(0, 19)}</td><td>{l.actor}</td><td>{l.action}</td><td className="text-gray-500">{l.data ? JSON.stringify(l.data).slice(0, 120) : ""}</td></tr>)}</tbody>
        </table>
      </div>
      <div className="card">
        <h2 className="h2 mb-2">Correos enviados</h2>
        <table className="tbl">
          <thead><tr><th>Fecha</th><th>Tipo</th><th>Para</th><th>Asunto</th><th>Error</th></tr></thead>
          <tbody>{emails.map((l) => <tr key={l.id}><td className="whitespace-nowrap">{l.createdAt.toISOString().replace("T", " ").slice(0, 19)}</td><td>{l.kind}</td><td>{l.to}</td><td>{l.subject}</td><td className="text-red-600">{l.error}</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}
