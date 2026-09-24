// Fórmulas del formato de cotización (Offer RFQ). Única fuente de verdad:
// la usan el portal, el Excel, el comparativo y la adjudicación.

export type Num = number | null | undefined;

export function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).trim().replace(/,/g, "");
  if (s === "" || s === "-") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function round(v: number, decimals = 2): number {
  const f = 10 ** decimals;
  return Math.round((v + Number.EPSILON) * f) / f;
}

export interface LinePricing {
  noOffer?: boolean;
  offeredQty?: Num;
  prices: Record<string, Num>; // componentes del precio base (fob, freight, insurance)
  financing: Record<string, Num>; // recargo por TM según días de crédito
}

/** Precio base (ej. CIF = FOB + Flete + Seguro). Null si no hay ningún componente. */
export function basePrice(line: LinePricing, componentKeys: string[]): number | null {
  if (line.noOffer) return null;
  let any = false;
  let sum = 0;
  for (const k of componentKeys) {
    const v = num(line.prices?.[k]);
    if (v !== null) {
      any = true;
      sum += v;
    }
  }
  return any ? sum : null;
}

/** Precio al plazo: term=0 es contado (precio base); si no, base + financiamiento del plazo. */
export function termPrice(line: LinePricing, componentKeys: string[], term: number): number | null {
  const base = basePrice(line, componentKeys);
  if (base === null || base === 0) return null;
  if (term === 0) return base;
  const fin = num(line.financing?.[String(term)]);
  if (fin === null) return null;
  return base + fin;
}

export function lineTotal(line: LinePricing, componentKeys: string[], term: number): number | null {
  const p = termPrice(line, componentKeys, term);
  const q = num(line.offeredQty);
  if (p === null || q === null) return null;
  return p * q;
}

export interface BidSummary {
  offeredQty: number;
  linesOffered: number;
  totals: Record<number, number>;
  weightedAvg: Record<number, number | null>;
  containers: number | null;
}

/** Totales como filas 47/48 del Excel: Σ total por plazo y promedio ponderado = total / Σ cantidad ofertada. */
export function summarizeBid(
  lines: LinePricing[],
  componentKeys: string[],
  terms: number[],
  containerTons?: number | null,
): BidSummary {
  const allTerms = [0, ...terms];
  let offeredQty = 0;
  let linesOffered = 0;
  const totals: Record<number, number> = {};
  for (const t of allTerms) totals[t] = 0;
  for (const l of lines) {
    if (l.noOffer) continue;
    const q = num(l.offeredQty) ?? 0;
    if (q > 0 && (basePrice(l, componentKeys) ?? 0) > 0) linesOffered++;
    offeredQty += q;
    for (const t of allTerms) totals[t] += lineTotal(l, componentKeys, t) ?? 0;
  }
  const weightedAvg: Record<number, number | null> = {};
  for (const t of allTerms) weightedAvg[t] = offeredQty > 0 && totals[t] > 0 ? totals[t] / offeredQty : null;
  return {
    offeredQty,
    linesOffered,
    totals,
    weightedAvg,
    containers: containerTons ? offeredQty / containerTons : null,
  };
}

export function termLabel(term: number, locale: "es" | "en" = "es"): string {
  if (term === 0) return locale === "es" ? "Contado" : "Cash";
  return locale === "es" ? `${term} días BL` : `${term} days BL`;
}

export function fmt(v: Num, decimals = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function pct(v: Num, decimals = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return `${(v * 100).toFixed(decimals)}%`;
}
