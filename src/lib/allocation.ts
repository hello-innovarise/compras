// Propuesta automática de split y métricas de escenarios (Torre de Compras).

export interface Candidate {
  optionId?: string | null;
  supplierId?: string | null;
  supplierName: string;
  country?: string | null;
  termDays: number;
  itemId?: string | null; // null = nivel familia
  itemLabel?: string | null;
  offeredTons: number;
  unitPrice: number; // precio puesto en planta al plazo
  rankValue: number; // menor es mejor (precio transformado) – o -score
  score?: number | null;
  eligible?: boolean;
  reasonIneligible?: string;
}

export interface Requirement {
  itemId?: string | null;
  itemLabel?: string | null;
  tons: number;
}

export interface AllocationRules {
  maxSharePerSupplier?: number | null; // 0-1
  maxSharePerCountry?: number | null; // 0-1
  minTonsPerSupplier?: number | null;
  containerTons?: number | null;
  minScore?: number | null;
}

export interface AllocatedLine {
  optionId?: string | null;
  supplierId?: string | null;
  supplierName: string;
  termDays: number;
  itemId?: string | null;
  itemLabel?: string | null;
  tons: number;
  unitPrice: number;
  note: string;
}

export interface AllocationResult {
  lines: AllocatedLine[];
  unassigned: { itemLabel?: string | null; tons: number }[];
  explanations: string[];
}

const key = (id?: string | null) => id ?? "__family__";

export function proposeAllocation(reqs: Requirement[], candidates: Candidate[], rules: AllocationRules = {}): AllocationResult {
  const totalRequired = reqs.reduce((s, r) => s + r.tons, 0);
  const explanations: string[] = [];
  let excluded = new Set<string>();

  const run = () => {
    const bySupplier = new Map<string, number>();
    const byCountry = new Map<string, number>();
    const lines: AllocatedLine[] = [];
    const unassigned: { itemLabel?: string | null; tons: number }[] = [];
    const supCap = rules.maxSharePerSupplier ? rules.maxSharePerSupplier * totalRequired : Infinity;
    const ctyCap = rules.maxSharePerCountry ? rules.maxSharePerCountry * totalRequired : Infinity;
    const sorted = [...reqs].sort((a, b) => b.tons - a.tons);
    for (const r of sorted) {
      let remaining = r.tons;
      const cands = candidates
        .filter((c) => key(c.itemId) === key(r.itemId))
        .filter((c) => c.eligible !== false && c.offeredTons > 0 && c.unitPrice > 0)
        .filter((c) => rules.minScore == null || (c.score ?? 0) >= rules.minScore)
        .filter((c) => !excluded.has(c.supplierName))
        .sort((a, b) => a.rankValue - b.rankValue);
      for (const c of cands) {
        if (remaining <= 1e-9) break;
        const usedS = bySupplier.get(c.supplierName) ?? 0;
        const usedC = c.country ? byCountry.get(c.country) ?? 0 : 0;
        const cap = Math.min(remaining, c.offeredTons, supCap - usedS, c.country ? ctyCap - usedC : Infinity);
        if (cap <= 1e-9) continue;
        const why: string[] = [`mejor precio transformado disponible (${c.rankValue.toFixed(2)})`];
        if (cap < remaining && cap === c.offeredTons) why.push("limitado a TM ofertadas");
        else if (cap < remaining && cap === supCap - usedS) why.push("limitado por % máximo por proveedor");
        else if (cap < remaining) why.push("limitado por % máximo por país");
        lines.push({
          optionId: c.optionId,
          supplierId: c.supplierId,
          supplierName: c.supplierName,
          termDays: c.termDays,
          itemId: c.itemId,
          itemLabel: c.itemLabel ?? r.itemLabel,
          tons: cap,
          unitPrice: c.unitPrice,
          note: why.join("; "),
        });
        bySupplier.set(c.supplierName, usedS + cap);
        if (c.country) byCountry.set(c.country, usedC + cap);
        remaining -= cap;
      }
      if (remaining > 1e-9) unassigned.push({ itemLabel: r.itemLabel, tons: remaining });
    }
    return { lines, unassigned, bySupplier };
  };

  let res = run();
  if (rules.minTonsPerSupplier) {
    for (let i = 0; i < 5; i++) {
      const small = [...res.bySupplier.entries()].filter(([, t]) => t < (rules.minTonsPerSupplier ?? 0)).map(([s]) => s);
      if (!small.length) break;
      for (const s of small) {
        explanations.push(`${s} excluido: ${res.bySupplier.get(s)?.toFixed(1)} TM < mínimo ${rules.minTonsPerSupplier} TM por proveedor.`);
        excluded = new Set([...excluded, s]);
      }
      res = run();
    }
  }
  for (const u of res.unassigned) explanations.push(`${u.itemLabel ?? "Familia"}: ${u.tons.toFixed(1)} TM sin asignar (sin oferta suficiente dentro de las reglas).`);
  return { lines: res.lines, unassigned: res.unassigned, explanations };
}

export interface ScenarioLineInput {
  supplierName: string;
  termDays: number;
  itemId?: string | null;
  tons: number;
  unitPrice: number;
  priceAdjust?: number | null;
}

export interface ScenarioMetrics {
  tons: number;
  total: number;
  weighted: number | null;
  bySupplier: { supplierName: string; tons: number; total: number; weighted: number | null; share: number; containers: number | null; termDays: number[] }[];
}

export function scenarioMetrics(lines: ScenarioLineInput[], containerTons?: number | null): ScenarioMetrics {
  let tons = 0;
  let total = 0;
  const m = new Map<string, { tons: number; total: number; terms: Set<number> }>();
  for (const l of lines) {
    const price = l.unitPrice + (l.priceAdjust ?? 0);
    tons += l.tons;
    total += l.tons * price;
    const e = m.get(l.supplierName) ?? { tons: 0, total: 0, terms: new Set<number>() };
    e.tons += l.tons;
    e.total += l.tons * price;
    if (l.tons > 0) e.terms.add(l.termDays);
    m.set(l.supplierName, e);
  }
  return {
    tons,
    total,
    weighted: tons > 0 ? total / tons : null,
    bySupplier: [...m.entries()]
      .map(([supplierName, e]) => ({
        supplierName,
        tons: e.tons,
        total: e.total,
        weighted: e.tons > 0 ? e.total / e.tons : null,
        share: tons > 0 ? e.tons / tons : 0,
        containers: containerTons ? e.tons / containerTons : null,
        termDays: [...e.terms].sort((a, b) => a - b),
      }))
      .sort((a, b) => b.tons - a.tons),
  };
}

export function ruleViolations(metrics: ScenarioMetrics, required: number, rules: AllocationRules): string[] {
  const out: string[] = [];
  if (Math.abs(metrics.tons - required) > 0.01)
    out.push(`Total asignado ${metrics.tons.toFixed(1)} TM vs requerido ${required.toFixed(1)} TM.`);
  for (const s of metrics.bySupplier) {
    if (rules.maxSharePerSupplier && s.share > rules.maxSharePerSupplier + 1e-9)
      out.push(`${s.supplierName}: ${(s.share * 100).toFixed(0)}% supera el máximo de ${(rules.maxSharePerSupplier * 100).toFixed(0)}%.`);
    if (rules.minTonsPerSupplier && s.tons > 0 && s.tons < rules.minTonsPerSupplier)
      out.push(`${s.supplierName}: ${s.tons.toFixed(1)} TM bajo el mínimo de ${rules.minTonsPerSupplier} TM.`);
    if (rules.containerTons && s.tons > 0) {
      const c = s.tons / rules.containerTons;
      if (Math.abs(c - Math.round(c)) > 0.05) out.push(`${s.supplierName}: ${c.toFixed(2)} contenedores (no es múltiplo exacto de ${rules.containerTons} TM).`);
    }
  }
  return out;
}
