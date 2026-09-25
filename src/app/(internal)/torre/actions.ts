"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { back, datef, errMsg, numf, str } from "@/lib/forms";
import { DEFAULT_PARAMS, DEFAULT_WEIGHTS, type EvaluationWeights } from "@/lib/evaluation";
import { autoScenario, buildMatrixFromEvent, matrixInclude, paramsOf, type MatrixParams } from "@/lib/torre";

const J = (v: unknown) => v as Prisma.InputJsonValue;

export async function createSession(fd: FormData) {
  const u = await requireUser(["BUYER", "COMMITTEE"]);
  const s = await prisma.committeeSession.create({ data: { name: str(fd, "name") ?? "Torre de Compras", date: datef(fd, "date") ?? new Date(), notes: str(fd, "notes") } });
  await audit(u.email, "session.created", "CommitteeSession", s.id);
  redirect(`/torre/${s.id}`);
}

export async function updateSession(id: string, fd: FormData) {
  const u = await requireUser(["BUYER", "COMMITTEE"]);
  const status = str(fd, "status") as "DRAFT" | "IN_SESSION" | "APPROVED" | null;
  await prisma.committeeSession.update({ where: { id }, data: { name: str(fd, "name") ?? undefined, date: datef(fd, "date") ?? undefined, notes: str(fd, "notes"), ...(status ? { status } : {}) } });
  await audit(u.email, "session.updated", "CommitteeSession", id, { status });
  back(`/torre/${id}`, "Sesión actualizada");
}

export async function createMatrix(fd: FormData) {
  const u = await requireUser(["BUYER"]);
  const sessionId = str(fd, "sessionId");
  const m = await prisma.evaluationMatrix.create({
    data: {
      name: str(fd, "name") ?? "Nueva matriz",
      family: str(fd, "family") ?? "General",
      group: str(fd, "group") ?? "Largos",
      purchaseType: str(fd, "purchaseType"),
      sessionId,
      negotiator: u.name,
      params: J({ ...DEFAULT_PARAMS, requiredTons: numf(fd, "requiredTons") ?? 0 }),
      weights: J(DEFAULT_WEIGHTS),
    },
  });
  await audit(u.email, "matrix.created", "EvaluationMatrix", m.id);
  redirect(`/torre/matrix/${m.id}`);
}

export async function createMatrixFromEvent(eventId: string) {
  const u = await requireUser(["BUYER"]);
  let id: string;
  try {
    const m = await buildMatrixFromEvent(eventId);
    await prisma.evaluationMatrix.update({ where: { id: m.id }, data: { negotiator: u.name } });
    id = m.id;
  } catch (e) {
    back(`/events/${eventId}?tab=compare`, undefined, errMsg(e));
  }
  await audit(u.email, "matrix.fromEvent", "EvaluationMatrix", id, { eventId });
  redirect(`/torre/matrix/${id}`);
}

const PARAM_KEYS: (keyof MatrixParams)[] = ["requiredTons", "targetCif", "pexPrice", "internacion", "surveyor", "merma", "refCreditDays", "refFactorDays", "interestRate", "transitDays", "anchorageDays", "emDays", "refLeadTime", "sbbIndex", "sbbFreight", "dai", "sbbCredit"];
const WEIGHT_KEYS = Object.keys(DEFAULT_WEIGHTS) as (keyof EvaluationWeights)[];

export async function updateMatrix(id: string, fd: FormData) {
  const u = await requireUser(["BUYER"]);
  const m = await prisma.evaluationMatrix.findUniqueOrThrow({ where: { id } });
  const p = paramsOf(m);
  const params: MatrixParams = { ...p, date: str(fd, "date") ?? p.date, rankBy: (str(fd, "rankBy") as MatrixParams["rankBy"]) ?? p.rankBy };
  for (const k of PARAM_KEYS) {
    const v = numf(fd, `p_${k}`);
    if (v !== null) (params as unknown as Record<string, number>)[k] = v;
  }
  const pctOrNull = (k: string) => {
    const v = numf(fd, k);
    return v === null ? null : v / 100;
  };
  params.rules = {
    ...p.rules,
    maxSharePerSupplier: pctOrNull("r_maxSharePerSupplier"),
    maxSharePerCountry: pctOrNull("r_maxSharePerCountry"),
    minTonsPerSupplier: numf(fd, "r_minTonsPerSupplier"),
    containerTons: numf(fd, "r_containerTons"),
    minScore: pctOrNull("r_minScore"),
  };
  const w = { ...DEFAULT_WEIGHTS, ...(m.weights as object) } as EvaluationWeights;
  for (const k of WEIGHT_KEYS) {
    const v = numf(fd, `w_${k}`);
    if (v !== null) w[k] = k === "priceStep" ? v : v / 100;
  }
  await prisma.evaluationMatrix.update({
    where: { id },
    data: {
      name: str(fd, "name") ?? m.name,
      family: str(fd, "family") ?? m.family,
      group: str(fd, "group") ?? m.group,
      purchaseType: str(fd, "purchaseType"),
      negotiator: str(fd, "negotiator"),
      prevPrice: numf(fd, "prevPrice"),
      prevExtra: numf(fd, "prevExtra"),
      spreadGoal: pctOrNull("spreadGoal"),
      sessionId: str(fd, "sessionId"),
      params: J(params),
      weights: J(w),
    },
  });
  await audit(u.email, "matrix.updated", "EvaluationMatrix", id);
  back(`/torre/matrix/${id}`, "Parámetros guardados");
}

export interface OptionRow {
  id?: string;
  supplierId?: string | null;
  supplierName: string;
  mill?: string | null;
  fob?: number | null;
  freight?: number | null;
  insurance?: number | null;
  cif?: number | null;
  creditSurcharge?: number | null;
  priceWithCredit?: number | null;
  tons: number;
  creditDays: number;
  advanceConditions?: string | null;
  claimsAmount?: number | null;
  merma?: number | null;
  internacionExtra?: number | null;
  incoterm?: string | null;
  shipmentDate?: string | null;
  origin?: string | null;
  legalRisk: string;
  alliance: string;
  penalty: string;
  specs: string;
  claims: string;
  supplierScore?: number | null;
  gaps?: string | null;
}

export async function saveOptions(matrixId: string, rows: OptionRow[]) {
  const u = await requireUser(["BUYER"]);
  const existing = await prisma.evaluationOption.findMany({ where: { matrixId }, select: { id: true } });
  const keep = new Set(rows.map((r) => r.id).filter(Boolean) as string[]);
  const ops: Prisma.PrismaPromise<unknown>[] = [prisma.evaluationOption.deleteMany({ where: { matrixId, id: { notIn: [...keep] } } })];
  rows.forEach((r, order) => {
    const data = {
      supplierId: r.supplierId ?? null,
      supplierName: r.supplierName || "Sin nombre",
      mill: r.mill ?? null,
      fob: r.fob ?? null,
      freight: r.freight ?? null,
      insurance: r.insurance ?? null,
      cif: r.cif ?? null,
      creditSurcharge: r.creditSurcharge ?? 0,
      priceWithCredit: r.priceWithCredit ?? null,
      tons: Number(r.tons) || 0,
      creditDays: Number(r.creditDays) || 0,
      advanceConditions: r.advanceConditions ?? null,
      claimsAmount: r.claimsAmount ?? 0,
      merma: r.merma ?? 0,
      internacionExtra: r.internacionExtra ?? 0,
      incoterm: r.incoterm ?? null,
      shipmentDate: r.shipmentDate ? new Date(r.shipmentDate) : null,
      origin: r.origin ?? null,
      legalRisk: r.legalRisk,
      alliance: r.alliance,
      penalty: r.penalty,
      specs: r.specs,
      claims: r.claims,
      supplierScore: r.supplierScore ?? null,
      gaps: r.gaps ?? null,
      order,
    };
    ops.push(r.id && existing.some((e) => e.id === r.id) ? prisma.evaluationOption.update({ where: { id: r.id }, data }) : prisma.evaluationOption.create({ data: { ...data, matrixId } }));
  });
  await prisma.$transaction(ops);
  await audit(u.email, "matrix.options", "EvaluationMatrix", matrixId, { count: rows.length });
  revalidatePath(`/torre/matrix/${matrixId}`);
  return { ok: true };
}

export async function deleteMatrix(id: string) {
  const u = await requireUser(["BUYER"]);
  const m = await prisma.evaluationMatrix.delete({ where: { id } });
  await audit(u.email, "matrix.deleted", "EvaluationMatrix", id);
  redirect(m.sessionId ? `/torre/${m.sessionId}` : "/torre");
}

export async function createScenario(matrixId: string, fd: FormData) {
  const u = await requireUser(["BUYER", "COMMITTEE"]);
  const mode = str(fd, "mode") ?? "empty";
  const m = await prisma.evaluationMatrix.findUniqueOrThrow({ where: { id: matrixId }, include: matrixInclude });
  if (mode === "auto") {
    await autoScenario(matrixId);
  } else if (mode.startsWith("copy:")) {
    const src = m.scenarios.find((s) => s.id === mode.slice(5));
    if (src)
      await prisma.scenario.create({
        data: {
          matrixId,
          name: `${src.name} (copia)`,
          order: m.scenarios.length,
          lines: { create: src.lines.map(({ id: _id, scenarioId: _s, ...l }) => l) },
        },
      });
  } else if (mode.startsWith("all:")) {
    // todo a un proveedor/plazo (a nivel familia)
    const o = m.options.find((x) => x.id === mode.slice(4));
    if (o) {
      const { evaluateOption } = await import("@/lib/evaluation");
      const { optionInput, weightsOf } = await import("@/lib/torre");
      const r = evaluateOption(optionInput(o), paramsOf(m), weightsOf(m));
      await prisma.scenario.create({
        data: {
          matrixId,
          name: `Todo a ${o.supplierName} (${o.creditDays} d)`,
          order: m.scenarios.length,
          lines: { create: [{ optionId: o.id, supplierId: o.supplierId, supplierName: o.supplierName, termDays: o.creditDays, tons: paramsOf(m).requiredTons || o.tons, unitPrice: r.plantPrice }] },
        },
      });
    }
  } else {
    await prisma.scenario.create({ data: { matrixId, name: str(fd, "name") ?? `Escenario ${m.scenarios.length + 1}`, order: m.scenarios.length } });
  }
  const first = await prisma.scenario.count({ where: { matrixId } });
  if (first === 1) await prisma.scenario.updateMany({ where: { matrixId }, data: { isBase: true } });
  await audit(u.email, "scenario.created", "EvaluationMatrix", matrixId, { mode });
  back(`/torre/matrix/${matrixId}#scenarios`, "Escenario creado");
}

export interface ScenarioLineRow {
  optionId?: string | null;
  supplierId?: string | null;
  supplierName: string;
  termDays: number;
  itemId?: string | null;
  itemLabel?: string | null;
  tons: number;
  unitPrice: number;
  priceAdjust?: number | null;
  note?: string | null;
}

export async function saveScenario(scenarioId: string, name: string, notes: string | null, lines: ScenarioLineRow[]) {
  const u = await requireUser(["BUYER", "COMMITTEE"]);
  const s = await prisma.scenario.findUniqueOrThrow({ where: { id: scenarioId } });
  if (s.approved) return { error: "El escenario aprobado no se puede editar" };
  await prisma.$transaction([
    prisma.scenarioLine.deleteMany({ where: { scenarioId } }),
    prisma.scenario.update({ where: { id: scenarioId }, data: { name, notes } }),
    prisma.scenarioLine.createMany({
      data: lines
        .filter((l) => l.tons > 0 || l.supplierName)
        .map((l) => ({
          scenarioId,
          optionId: l.optionId ?? null,
          supplierId: l.supplierId ?? null,
          supplierName: l.supplierName,
          termDays: Number(l.termDays) || 0,
          itemId: l.itemId ?? null,
          itemLabel: l.itemLabel ?? null,
          tons: Number(l.tons) || 0,
          unitPrice: Number(l.unitPrice) || 0,
          priceAdjust: Number(l.priceAdjust) || 0,
          note: l.note ?? null,
        })),
    }),
  ]);
  await audit(u.email, "scenario.saved", "Scenario", scenarioId, { lines: lines.length });
  revalidatePath(`/torre/matrix/${s.matrixId}`);
  return { ok: true };
}

export async function setBaseScenario(matrixId: string, scenarioId: string) {
  await requireUser(["BUYER", "COMMITTEE"]);
  await prisma.$transaction([
    prisma.scenario.updateMany({ where: { matrixId }, data: { isBase: false } }),
    prisma.scenario.update({ where: { id: scenarioId }, data: { isBase: true } }),
  ]);
  back(`/torre/matrix/${matrixId}#scenarios`, "Escenario base actualizado");
}

export async function deleteScenario(matrixId: string, scenarioId: string) {
  const u = await requireUser(["BUYER", "COMMITTEE"]);
  await prisma.scenario.delete({ where: { id: scenarioId } });
  await audit(u.email, "scenario.deleted", "EvaluationMatrix", matrixId);
  back(`/torre/matrix/${matrixId}#scenarios`, "Escenario eliminado");
}

/** Aprobación de la Torre: marca el escenario y, si la matriz viene de una licitación, genera la adjudicación por SKU. */
export async function approveScenario(matrixId: string, scenarioId: string) {
  const u = await requireUser(["COMMITTEE", "BUYER"]);
  const m = await prisma.evaluationMatrix.findUniqueOrThrow({ where: { id: matrixId }, include: matrixInclude });
  const s = m.scenarios.find((x) => x.id === scenarioId);
  if (!s) back(`/torre/matrix/${matrixId}`, undefined, "Escenario no encontrado");
  await prisma.$transaction([
    prisma.scenario.updateMany({ where: { matrixId }, data: { approved: false } }),
    prisma.scenario.update({ where: { id: scenarioId }, data: { approved: true } }),
  ]);
  const now = new Date();
  await prisma.priceHistory.createMany({
    data: s.lines.map((l) => ({ family: m.family, itemCode: l.itemLabel?.split(" ")[0] ?? null, supplierName: l.supplierName, price: l.unitPrice + l.priceAdjust, tons: l.tons, date: now, source: `Torre: ${m.name} / ${s.name}` })),
  });
  let awardMsg = "";
  if (m.eventId) {
    const lines = s.lines.filter((l) => l.itemId && l.tons > 0);
    if (lines.length) {
      await prisma.award.deleteMany({ where: { eventId: m.eventId, status: "DRAFT" } });
      await prisma.award.create({
        data: {
          eventId: m.eventId,
          scenarioId,
          notes: `Aprobado en Torre de Compras – ${m.name} / ${s.name}`,
          lines: { create: lines.map((l) => ({ itemId: l.itemId!, supplierId: l.supplierId ?? "", tons: l.tons, termDays: l.termDays, unitPrice: l.unitPrice + l.priceAdjust })) },
        },
      });
      awardMsg = " Se generó la adjudicación en la licitación (revise y notifique).";
    }
  }
  await audit(u.email, "scenario.approved", "Scenario", scenarioId, { matrixId });
  back(`/torre/matrix/${matrixId}#scenarios`, `Escenario aprobado.${awardMsg}`);
}

export async function addAction(matrixId: string, fd: FormData) {
  const u = await requireUser(["BUYER", "COMMITTEE"]);
  const text = str(fd, "text");
  if (text) await prisma.actionItem.create({ data: { matrixId, text, owner: str(fd, "owner"), dueDate: datef(fd, "dueDate") } });
  await audit(u.email, "action.added", "EvaluationMatrix", matrixId);
  back(str(fd, "return") ?? `/torre/matrix/${matrixId}#actions`);
}

export async function toggleAction(id: string, ret: string) {
  await requireUser(["BUYER", "COMMITTEE"]);
  const a = await prisma.actionItem.findUniqueOrThrow({ where: { id } });
  await prisma.actionItem.update({ where: { id }, data: { status: a.status === "OPEN" ? "DONE" : "OPEN" } });
  back(ret);
}

export async function addPriceHistory(fd: FormData) {
  await requireUser(["BUYER"]);
  const family = str(fd, "family");
  const price = numf(fd, "price");
  if (family && price !== null)
    await prisma.priceHistory.create({ data: { family, itemCode: str(fd, "itemCode"), supplierName: str(fd, "supplierName"), price, extra: numf(fd, "extra"), tons: numf(fd, "tons"), date: datef(fd, "date") ?? new Date(), source: "manual" } });
  back(str(fd, "return") ?? "/torre");
}
