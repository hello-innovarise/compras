import Link from "next/link";
import { prisma } from "@/lib/db";
import { resolveToken, canBid } from "@/lib/portal";
import { templateOf, componentKeys } from "@/lib/events";
import { sectionFields } from "@/lib/templates";
import { t as tr, fmtDate } from "@/lib/i18n";
import { basePrice } from "@/lib/pricing";
import { audit } from "@/lib/audit";
import { BidForm } from "./BidForm";
import { DocUpload, Decline } from "./Extras";
import type { LineInput } from "./actions";

export const dynamic = "force-dynamic";

export default async function Portal({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ lang?: string }> }) {
  const { token } = await params;
  const { lang } = await searchParams;
  const r = await resolveToken(token);
  if (!r) {
    return <main className="p-10 text-center text-gray-600">Enlace inválido o expirado · Invalid or expired link</main>;
  }
  const { inv, ev } = r;
  const locale = lang === "en" || lang === "es" ? lang : inv.supplier.locale;
  const d = tr(locale);
  if (!inv.viewedAt || inv.status === "SENT" || inv.status === "PENDING") {
    await prisma.invitation.update({ where: { id: inv.id }, data: { viewedAt: inv.viewedAt ?? new Date(), status: inv.status === "SENT" || inv.status === "PENDING" ? "VIEWED" : inv.status } });
    if (!inv.viewedAt) await audit(`proveedor:${inv.supplier.name}`, "invitation.viewed", "Invitation", inv.id);
  }
  const t = templateOf(ev);
  const keys = componentKeys(t);
  const editable = canBid(ev, inv);
  const myBids = ev.bids.filter((b) => b.invitationId === inv.id).sort((a, b) => b.round - a.round);
  const current = myBids.find((b) => b.round === ev.currentRound);
  const previous = myBids.find((b) => b.round < ev.currentRound && b.status === "SUBMITTED");
  const source = current ?? previous;
  const initial: LineInput[] = (source?.lines ?? []).map((l) => ({
    itemId: l.itemId,
    noOffer: l.noOffer,
    offeredQty: l.offeredQty,
    prices: l.prices as Record<string, number | null>,
    financing: l.financing as Record<string, number | null>,
    values: l.values as Record<string, string | number | null>,
  }));
  const prevMap = previous
    ? Object.fromEntries(previous.lines.map((l) => [l.itemId, { base: basePrice({ prices: l.prices as Record<string, number>, financing: {} }, keys), fin: l.financing as Record<string, number | null> }]))
    : undefined;
  const termFields = sectionFields(t.fields, "OFFER_TERMS");
  const header: Record<string, string | null> = { comments: source?.comments ?? null };
  for (const f of termFields) {
    const fromBid = (source as unknown as Record<string, string | null> | undefined)?.[f.key];
    header[f.key] = fromBid ?? (initial.find((l) => !l.noOffer)?.values[f.key] as string) ?? null;
  }
  const L = (x: { labelEs: string; labelEn: string }) => (locale === "en" ? x.labelEn : x.labelEs);
  const docsBid = current ?? previous;
  const round = ev.rounds.find((x) => x.number === ev.currentRound);

  return (
    <main className="mx-auto max-w-[1800px] space-y-4 p-4">
      <header className="flex flex-wrap items-start justify-between gap-4 rounded-lg bg-brand p-4 text-white">
        <div>
          <div className="text-sm opacity-80">{d.portalTitle} · {ev.company.name}</div>
          <h1 className="text-2xl font-bold">{ev.title}</h1>
          <div className="text-sm opacity-90">{ev.code} · {inv.supplier.name}</div>
        </div>
        <div className="text-right text-sm">
          <div>{d.deadline}: <b>{fmtDate(ev.deadline, locale, ev.timezone, true)}</b> ({ev.timezone})</div>
          <div>{d.round} {ev.currentRound}</div>
          <Link className="underline" href={`?lang=${locale === "en" ? "es" : "en"}`}>{d.language}</Link>
        </div>
      </header>

      {!editable && (
        <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
          {inv.status === "DECLINED" ? d.declined : inv.maxRound < ev.currentRound ? d.notInvitedRound : d.closed}
        </div>
      )}
      {current?.status === "SUBMITTED" && (
        <div className="rounded-md bg-green-50 p-3 text-sm text-green-800">✔ {d.submittedAt} {fmtDate(current.submittedAt, locale, ev.timezone, true)} (v{current.version})</div>
      )}
      {round?.note && ev.currentRound > 1 && <div className="rounded-md bg-blue-50 p-3 text-sm text-blue-900">{round.note}</div>}

      <div className="grid gap-4 md:grid-cols-3">
        <section className="card md:col-span-2">
          <h2 className="h2 mb-2">{d.conditions}</h2>
          <dl className="mb-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm md:grid-cols-3">
            {[
              ["Incoterm", ev.incoterm],
              [locale === "en" ? "Destination" : "Destino", [ev.destination, ev.port].filter(Boolean).join(" – ")],
              [locale === "en" ? "Latest shipment" : "Última fecha de embarque", fmtDate(ev.shipmentDate, locale, ev.timezone)],
              [locale === "en" ? "Free days at destination" : "Días libres en destino", ev.freeDays],
              [locale === "en" ? "MT per container" : "TM por contenedor", ev.containerTons],
              [locale === "en" ? "Price validity requested" : "Vigencia solicitada", fmtDate(ev.priceValidity, locale, ev.timezone)],
              ["Surveyor", ev.surveyor],
            ]
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={String(k)}><dt className="text-xs text-gray-500">{k}</dt><dd className="font-medium">{String(v)}</dd></div>
              ))}
          </dl>
          {ev.conditions && <div className="whitespace-pre-line text-sm text-gray-700">{ev.conditions}</div>}
        </section>
        <section className="card space-y-3">
          <div>
            <h2 className="h2 mb-1">{d.documents}</h2>
            {ev.documents.length === 0 ? <p className="text-sm text-gray-500">—</p> : (
              <ul className="text-sm">{ev.documents.map((doc) => <li key={doc.id}><a className="text-brand underline" href={`/api/portal/${token}/doc/${doc.id}`}>{doc.name}</a></li>)}</ul>
            )}
          </div>
          <div>
            <h2 className="h2 mb-1">{d.requiredDocs}</h2>
            <ul className="divide-y text-sm">
              {[...t.requiredDocs, { key: "other", labelEs: "Otros documentos", labelEn: "Other documents" }].map((rd) => (
                <DocUpload key={rd.key} token={token} kind={rd.key} label={L(rd)} editable={editable} uploadText={d.upload} uploaded={(docsBid?.documents ?? []).filter((x) => x.kind === rd.key).map((x) => x.name)} />
              ))}
            </ul>
          </div>
          {editable && current?.status !== "SUBMITTED" && <Decline token={token} label={d.decline} reasonLabel={d.declineReason} />}
        </section>
      </div>

      <BidForm
        token={token}
        locale={locale}
        d={d}
        items={ev.items.map((i) => ({ id: i.id, gCode: i.gCode, vtaCode: i.vtaCode, description: i.description, quantity: i.quantity, specs: i.specs as Record<string, unknown> }))}
        specFields={sectionFields(t.fields, "SKU_SPEC")}
        techFields={sectionFields(t.fields, "OFFER_TECH")}
        complianceFields={sectionFields(t.fields, "OFFER_COMPLIANCE")}
        termFields={termFields}
        components={t.priceComponents}
        baseLabel={t.baseLabel}
        terms={t.financingTerms}
        containerTons={ev.containerTons ?? t.containerTons}
        initial={initial}
        previous={prevMap}
        header={header}
        editable={editable}
        submittedVersion={current?.version ?? 0}
      />
    </main>
  );
}
