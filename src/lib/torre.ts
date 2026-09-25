// Matriz de evaluación y Torre de Compras: construcción de opciones desde licitaciones, candidatos y resumen.
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { DEFAULT_PARAMS, DEFAULT_WEIGHTS, evaluateOption, type EvaluationWeights, type OptionInput, type ReferenceParams } from "./evaluation";
import { type AllocationRules, type Candidate, proposeAllocation, scenarioMetrics } from "./allocation";
import { effectiveBids, loadEvent, templateOf, componentKeys } from "./events";
import { basePrice, num, termPrice } from "./pricing";

export interface MatrixParams extends ReferenceParams {
  rules?: AllocationRules;
  rankBy?: "price" | "score";
}

export const matrixInclude = {
  options: { orderBy: { order: "asc" } },
  scenarios: { include: { lines: true }, orderBy: { order: "asc" } },
  actions: { orderBy: { createdAt: "asc" } },
  event: { include: { items: { orderBy: { order: "asc" } } } },
  session: true,
} satisfies Prisma.EvaluationMatrixInclude;
export type FullMatrix = Prisma.EvaluationMatrixGetPayload<{ include: typeof matrixInclude }>;

export function paramsOf(m: { params: unknown }): MatrixParams {
  return { ...DEFAULT_PARAMS, ...(m.params as object) } as MatrixParams;
}
export function weightsOf(m: { weights: unknown }): EvaluationWeights {
  return { ...DEFAULT_WEIGHTS, ...(m.weights as object) };
}

export function optionInput(o: FullMatrix["options"][number]): OptionInput {
  return {
    supplierName: o.supplierName,
    cif: o.cif,
    creditSurcharge: o.creditSurcharge,
    priceWithCredit: o.priceWithCredit,
    tons: o.tons,
    creditDays: o.creditDays,
    claimsAmount: o.claimsAmount,
    merma: o.merma,
    internacionExtra: o.internacionExtra,
    shipmentDate: o.shipmentDate,
    legalRisk: o.legalRisk,
    alliance: o.alliance,
    penalty: o.penalty,
    specs: o.specs,
    claims: o.claims,
    supplierScore: o.supplierScore,
  };
}

export function evaluateMatrix(m: FullMatrix) {
  const p = paramsOf(m);
  const w = weightsOf(m);
  const rows = m.options.map((o) => ({ o, r: evaluateOption(optionInput(o), p, w) }));
  const ranked = [...rows].sort((a, b) => b.r.scores.total - a.r.scores.total);
  return { p, w, rows, ranked };
}

/** Promedio de las evaluaciones N.E.P de un proveedor. */
export async function supplierScoreAvg(supplierId: string): Promise<number | null> {
  const ev = await prisma.supplierEvaluation.findMany({ where: { supplierId } });
  if (!ev.length) return null;
  return ev.reduce((s, e) => s + e.score, 0) / ev.length;
}

/** Escalas de reclamos y penalizaciones sugeridas desde incidencias abiertas. */
export async function incidentScales(supplierId: string): Promise<{ claims: string; penalty: string }> {
  const inc = await prisma.supplierIncident.findMany({ where: { supplierId, open: true } });
  const scale = (type: "CLAIM" | "PENALTY") => {
    const xs = inc.filter((i) => i.type === type);
    if (xs.some((i) => i.impact === "BLOCKED")) return "5";
    const high = xs.filter((i) => i.impact === "HIGH").length;
    const low = xs.filter((i) => i.impact !== "HIGH").length;
    if (type === "PENALTY") return high ? "4" : xs.some((i) => i.impact === "MEDIUM") ? "3" : low ? "2" : "1";
    if (high > 2) return "5";
    if (high) return "4";
    if (low > 2) return "3";
    if (low) return "2";
    return "1";
  };
  return { claims: scale("CLAIM"), penalty: scale("PENALTY") };
}

/** Crea una matriz a partir de las ofertas de una licitación: una opción por proveedor × plazo (promedios ponderados por TM). */
export async function buildMatrixFromEvent(eventId: string) {
  const ev = await loadEvent(eventId);
  if (!ev) throw new Error("Evento no encontrado");
  const t = templateOf(ev);
  const keys = componentKeys(t);
  const bids = effectiveBids(ev);
  if (!bids.size) throw new Error("No hay ofertas enviadas");
  const prev = await prisma.evaluationMatrix.findFirst({ where: { family: ev.family }, orderBy: { createdAt: "desc" } });
  const required = ev.items.reduce((s, i) => s + i.quantity, 0);
  const params: MatrixParams = {
    ...DEFAULT_PARAMS,
    ...((prev?.params as object) ?? {}),
    date: new Date().toISOString().slice(0, 10),
    requiredTons: required,
    rules: { containerTons: ev.containerTons ?? t.containerTons ?? null, ...((prev?.params as MatrixParams | undefined)?.rules ?? {}) },
  };
  const complianceKeys = t.fields.filter((f) => f.type === "OKNO").map((f) => f.key);
  const options: Prisma.EvaluationOptionCreateWithoutMatrixInput[] = [];
  let order = 0;
  for (const inv of ev.invitations) {
    const bid = bids.get(inv.id);
    if (!bid) continue;
    const lines = bid.lines.filter((l) => !l.noOffer && (num(l.offeredQty) ?? 0) > 0 && (basePrice({ prices: l.prices as Record<string, number>, financing: {} }, keys) ?? 0) > 0);
    if (!lines.length) continue;
    const tons = lines.reduce((s, l) => s + (num(l.offeredQty) ?? 0), 0);
    const wavg = (f: (l: (typeof lines)[number]) => number | null) => {
      let q = 0;
      let s = 0;
      for (const l of lines) {
        const v = f(l);
        if (v === null) continue;
        const w = num(l.offeredQty) ?? 0;
        q += w;
        s += v * w;
      }
      return q ? s / q : null;
    };
    const lp = (l: (typeof lines)[number]) => ({ prices: l.prices as Record<string, number>, financing: l.financing as Record<string, number>, offeredQty: l.offeredQty });
    const cif = wavg((l) => basePrice(lp(l), keys));
    const comp = (k: string) => wavg((l) => num((l.prices as Record<string, unknown>)[k]));
    const nonCompliant = lines.filter((l) => complianceKeys.some((k) => (l.values as Record<string, unknown>)[k] === "NO")).length;
    const specs = nonCompliant === 0 ? "4" : nonCompliant === lines.length ? "1" : "2";
    const vals = lines.map((l) => l.values as Record<string, unknown>);
    const pick = (k: string) => (bid as unknown as Record<string, string | null>)[k] ?? (vals.find((v) => v[k])?.[k] as string) ?? null;
    const mill = [...new Set(vals.flatMap((v) => [v.mill1, v.mill2, v.mill3]).filter(Boolean))].join(", ") || null;
    const comments = [...new Set(vals.map((v) => v.comments).filter((c) => c && c !== "NO"))].join(" | ");
    const gaps = [
      tons < required ? `Cubre ${tons.toFixed(1)} de ${required.toFixed(1)} TM (${lines.length}/${ev.items.length} SKUs)` : null,
      nonCompliant ? `${nonCompliant} SKUs con incumplimientos de especificación` : null,
      comments || null,
    ]
      .filter(Boolean)
      .join(". ");
    const score = await supplierScoreAvg(inv.supplierId);
    const inc = await incidentScales(inv.supplierId);
    for (const term of [0, ...t.financingTerms]) {
      const termAvg = wavg((l) => termPrice(lp(l), keys, term));
      if (termAvg === null || cif === null) continue;
      // si algún SKU no tiene financiamiento para el plazo, se omite el plazo
      if (term > 0 && lines.some((l) => termPrice(lp(l), keys, term) === null)) continue;
      options.push({
        supplierId: inv.supplierId,
        supplierName: inv.supplier.name,
        mill,
        fob: comp("fob"),
        freight: comp("freight"),
        insurance: comp("insurance"),
        cif,
        creditSurcharge: termAvg - cif,
        tons,
        creditDays: term,
        advanceConditions: term === 0 ? "CONTADO" : null,
        incoterm: pick("incoterm") ?? ev.incoterm,
        origin: pick("origin"),
        shipmentDate: ev.shipmentDate,
        specs,
        claims: inc.claims,
        penalty: inc.penalty,
        supplierScore: score,
        gaps: gaps || null,
        order: order++,
      });
    }
  }
  const m = await prisma.evaluationMatrix.create({
    data: {
      name: `${ev.family} – ${ev.code}`,
      family: ev.family,
      group: t.category.toLowerCase().includes("plano") ? "Planos" : "Largos",
      eventId: ev.id,
      params: params as unknown as Prisma.InputJsonValue,
      weights: ((prev?.weights as object) ?? DEFAULT_WEIGHTS) as Prisma.InputJsonValue,
      prevPrice: null,
      options: { create: options },
    },
  });
  return m;
}

/** Candidatos para la asignación. Si la matriz viene de una licitación, por SKU; si no, a nivel familia. */
export function candidatesFor(m: FullMatrix, ev?: Awaited<ReturnType<typeof loadEvent>> | null): { reqs: { itemId: string | null; itemLabel: string; tons: number }[]; cands: Candidate[] } {
  const { p, w, rows } = evaluateMatrix(m);
  const rankBy = p.rankBy ?? "price";
  if (!ev) {
    return {
      reqs: [{ itemId: null, itemLabel: m.family, tons: p.requiredTons }],
      cands: rows.map(({ o, r }) => ({
        optionId: o.id,
        supplierId: o.supplierId,
        supplierName: o.supplierName,
        country: o.origin,
        termDays: o.creditDays,
        itemId: null,
        itemLabel: m.family,
        offeredTons: o.tons,
        unitPrice: r.plantPrice,
        rankValue: rankBy === "score" ? -r.scores.total : r.transformedPrice,
        score: r.scores.total,
        eligible: o.specs !== "1" && o.penalty !== "5",
      })),
    };
  }
  const t = templateOf(ev);
  const keys = componentKeys(t);
  const bids = effectiveBids(ev);
  // un plazo por proveedor: el de mayor puntaje
  const bestBySupplier = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const cur = bestBySupplier.get(row.o.supplierName);
    if (!cur || row.r.scores.total > cur.r.scores.total) bestBySupplier.set(row.o.supplierName, row);
  }
  const cands: Candidate[] = [];
  for (const { o, r } of bestBySupplier.values()) {
    const inv = ev.invitations.find((i) => i.supplierId === o.supplierId);
    const bid = inv ? bids.get(inv.id) : undefined;
    if (!bid) continue;
    for (const l of bid.lines) {
      if (l.noOffer) continue;
      const lp = { prices: l.prices as Record<string, number>, financing: l.financing as Record<string, number>, offeredQty: l.offeredQty };
      const price = termPrice(lp, keys, o.creditDays);
      const cif = basePrice(lp, keys);
      if (!price || !cif) continue;
      const item = ev.items.find((i) => i.id === l.itemId)!;
      const skuEval = evaluateOption({ ...optionInput(o), cif, creditSurcharge: price - cif, priceWithCredit: null }, p, w);
      cands.push({
        optionId: o.id,
        supplierId: o.supplierId,
        supplierName: o.supplierName,
        country: o.origin,
        termDays: o.creditDays,
        itemId: item.id,
        itemLabel: `${item.gCode} ${item.description}`,
        offeredTons: num(l.offeredQty) ?? 0,
        unitPrice: skuEval.plantPrice,
        rankValue: rankBy === "score" ? -r.scores.total : skuEval.transformedPrice,
        score: r.scores.total,
        eligible: o.specs !== "1" && o.penalty !== "5" && !Object.values(l.values as Record<string, unknown>).includes("NO"),
      });
    }
  }
  return { reqs: ev.items.map((i) => ({ itemId: i.id, itemLabel: `${i.gCode} ${i.description}`, tons: i.quantity })), cands };
}

export async function autoScenario(matrixId: string) {
  const m = (await prisma.evaluationMatrix.findUnique({ where: { id: matrixId }, include: matrixInclude }))!;
  const ev = m.eventId ? await loadEvent(m.eventId) : null;
  const { reqs, cands } = candidatesFor(m, ev);
  const rules = paramsOf(m).rules ?? {};
  const res = proposeAllocation(reqs, cands, rules);
  const s = await prisma.scenario.create({
    data: {
      matrixId,
      name: `Propuesta automática ${new Date().toISOString().slice(0, 16).replace("T", " ")}`,
      auto: true,
      order: m.scenarios.length,
      notes: res.explanations.join("\n") || null,
      lines: {
        create: res.lines.map((l) => ({
          optionId: l.optionId ?? null,
          supplierId: l.supplierId ?? null,
          supplierName: l.supplierName,
          termDays: l.termDays,
          itemId: l.itemId ?? null,
          itemLabel: l.itemLabel ?? null,
          tons: l.tons,
          unitPrice: l.unitPrice,
          note: l.note,
        })),
      },
    },
  });
  return s;
}

/** Resumen por familia para la Torre (como hoja RESUMEN). */
export function familySummary(m: FullMatrix) {
  const { p, rows, ranked } = evaluateMatrix(m);
  const approved = m.scenarios.find((s) => s.approved);
  const scenario = approved ?? m.scenarios.find((s) => s.isBase) ?? null;
  const metrics = scenario ? scenarioMetrics(scenario.lines, p.rules?.containerTons) : null;
  const best = ranked[0];
  const selected = metrics?.bySupplier.map((s) => s.supplierName).join(" + ") || best?.o.supplierName || "—";
  const selOpt = scenario ? rows.find((r) => r.o.id === scenario.lines[0]?.optionId) ?? best : best;
  const plant = metrics?.weighted ?? selOpt?.r.plantPrice ?? null;
  const totalSbb = selOpt?.r.totalSbb ?? null;
  return {
    matrix: m,
    params: p,
    scenario,
    approved: !!approved,
    selected,
    tonsProjected: metrics?.tons ?? p.requiredTons,
    tonsRequired: p.requiredTons,
    plantPrice: plant,
    pex: p.pexPrice || null,
    difVsPex: plant !== null && p.pexPrice ? plant - p.pexPrice : null,
    spread: plant !== null && totalSbb ? plant / totalSbb - 1 : null,
    spreadGoal: m.spreadGoal,
    option: selOpt?.o ?? null,
    eval: selOpt?.r ?? null,
    total: metrics?.total ?? (plant !== null ? plant * p.requiredTons : null),
    termDays: metrics ? [...new Set(metrics.bySupplier.flatMap((s) => s.termDays))] : selOpt ? [selOpt.o.creditDays] : [],
  };
}

/** Precio en planta por SKU para cada opción (proveedor × plazo) – para editar escenarios por SKU. */
export function optionSkuPrices(m: FullMatrix, ev: NonNullable<Awaited<ReturnType<typeof loadEvent>>>) {
  const p = paramsOf(m);
  const w = weightsOf(m);
  const t = templateOf(ev);
  const keys = componentKeys(t);
  const bids = effectiveBids(ev);
  const out: Record<string, Record<string, { price: number; offered: number }>> = {};
  for (const o of m.options) {
    const inv = ev.invitations.find((i) => i.supplierId === o.supplierId);
    const bid = inv ? bids.get(inv.id) : undefined;
    const map: Record<string, { price: number; offered: number }> = {};
    for (const l of bid?.lines ?? []) {
      if (l.noOffer) continue;
      const lp = { prices: l.prices as Record<string, number>, financing: l.financing as Record<string, number> };
      const price = termPrice(lp, keys, o.creditDays);
      const cif = basePrice(lp, keys);
      if (!price || !cif) continue;
      const r = evaluateOption({ ...optionInput(o), cif, creditSurcharge: price - cif, priceWithCredit: null }, p, w);
      map[l.itemId] = { price: Math.round(r.plantPrice * 100) / 100, offered: num(l.offeredQty) ?? 0 };
    }
    out[o.id] = map;
  }
  return out;
}
