// Matriz de Evaluación de Ofertas – réplica de las fórmulas del "Cuadro comparativo – Comité"
// (hojas HRC/CRC/GCRC TYPSA…) con pesos y parámetros configurables.

export interface ReferenceParams {
  date: string; // fecha de negociación (Y10)
  requiredTons: number; // TM total requerida (P16)
  targetCif: number; // precio CIF objetivo (I16)
  pexPrice: number; // precio PEX / precio en planta objetivo (N16)
  internacion: number; // L16
  surveyor: number; // M16
  merma: number; // O16
  refCreditDays: number; // Q16 (ej. 120)
  refFactorDays: number; // T16 (en el Excel = Q16-45-30-15 = 30)
  interestRate: number; // U18 (ej. 0.14)
  transitDays: number; // tránsito marítimo (AC4)
  anchorageDays: number; // fondeo (AC5)
  emDays: number; // EM (AC6)
  refLeadTime: number; // AJ16 (días)
  sbbIndex: number; // Z16
  sbbFreight: number; // AA16
  dai: number; // AB16
  sbbCredit: number; // AE16
}

export interface EvaluationWeights {
  price: number; // AM16 = 25%
  priceBelowTarget: number; // 30% si el precio transformado es menor al objetivo
  pricePenaltyPerStep: number; // 1%
  priceStep: number; // cada $3 sobre objetivo
  payment: number; // AN16 = 15%
  paymentCap: number; // tope 20%
  delivery: number; // AO16 = 5%
  deliveryCap: number; // 5%
  deliveryOverCapValue: number; // el Excel asigna 8% cuando supera el tope
  legal: number; // AQ16 = 10%
  alliance: number; // AS16 = 5%
  penalty: number; // AV16 = 10%
  supplierEval: number; // AY16 = 5%
  specs: number; // BA16 = 35%
  claims: number; // BC16 = 10%
}

export const DEFAULT_WEIGHTS: EvaluationWeights = {
  price: 0.25,
  priceBelowTarget: 0.3,
  pricePenaltyPerStep: 0.01,
  priceStep: 3,
  payment: 0.15,
  paymentCap: 0.2,
  delivery: 0.05,
  deliveryCap: 0.05,
  deliveryOverCapValue: 0.08,
  legal: 0.1,
  alliance: 0.05,
  penalty: 0.1,
  supplierEval: 0.05,
  specs: 0.35,
  claims: 0.1,
};

export const DEFAULT_PARAMS: ReferenceParams = {
  date: new Date().toISOString().slice(0, 10),
  requiredTons: 0,
  targetCif: 0,
  pexPrice: 0,
  internacion: 0,
  surveyor: 0,
  merma: 0,
  refCreditDays: 120,
  refFactorDays: 30,
  interestRate: 0.14,
  transitDays: 45,
  anchorageDays: 7,
  emDays: 9,
  refLeadTime: 68,
  sbbIndex: 0,
  sbbFreight: 0,
  dai: 0,
  sbbCredit: 0,
};

// ---- Nomenclatura de evaluación (FRM-0DL20100-13) ----
export interface ScaleEntry {
  code: string;
  labelEs: string;
  labelEn: string;
  value: number;
}
export type ScaleKey = "specs" | "claims" | "penalty" | "alliance" | "legal";

export const SCALES: Record<ScaleKey, ScaleEntry[]> = {
  specs: [
    { code: "1", labelEs: "1. No cumple", labelEn: "1. Does not comply", value: 0.1 },
    { code: "2", labelEs: "2. Cumple parcialmente", labelEn: "2. Partially complies", value: 0.3 },
    { code: "3", labelEs: "3. Cumple básico", labelEn: "3. Basic compliance", value: 0.6 },
    { code: "4", labelEs: "4. Cumple adecuadamente", labelEn: "4. Fully complies", value: 1.0 },
    { code: "5", labelEs: "5. Excede", labelEn: "5. Exceeds", value: 1.5 },
  ],
  claims: [
    { code: "1", labelEs: "1. Ningún reclamo", labelEn: "1. No claims", value: 0 },
    { code: "2", labelEs: "2. Tiene 1-2 reclamos poco impacto", labelEn: "2. 1-2 low-impact claims", value: -2 / 14 },
    { code: "3", labelEs: "3. Tiene >2 reclamos poco impacto", labelEn: "3. >2 low-impact claims", value: -5 / 14 },
    { code: "4", labelEs: "4. Tiene 1-2 reclamos alto impacto", labelEn: "4. 1-2 high-impact claims", value: -9 / 14 },
    { code: "5", labelEs: "5. Tiene >2 reclamos alto impacto", labelEn: "5. >2 high-impact claims", value: -1 },
  ],
  penalty: [
    { code: "1", labelEs: "1. Ninguna penalización", labelEn: "1. No penalty", value: 0 },
    { code: "2", labelEs: "2. Penalización de bajo impacto", labelEn: "2. Low-impact penalty", value: -2 / 14 },
    { code: "3", labelEs: "3. Penalización de impacto medio", labelEn: "3. Medium-impact penalty", value: -5 / 14 },
    { code: "4", labelEs: "4. Penalización de alto impacto", labelEn: "4. High-impact penalty", value: -9 / 14 },
    { code: "5", labelEs: "5. Proveedor bloqueado para compras", labelEn: "5. Supplier blocked", value: -1 },
  ],
  alliance: [
    { code: "1", labelEs: "1. Alta", labelEn: "1. High", value: 1 },
    { code: "2", labelEs: "2. Media", labelEn: "2. Medium", value: 0.5 },
    { code: "3", labelEs: "3. Baja", labelEn: "3. Low", value: 0 },
  ],
  legal: [
    { code: "1", labelEs: "1. Crítico", labelEn: "1. Critical", value: 0.1 },
    { code: "2", labelEs: "2. Alto", labelEn: "2. High", value: 0.3 },
    { code: "3", labelEs: "3. Moderado", labelEn: "3. Moderate", value: 0.6 },
    { code: "4", labelEs: "4. Bajo", labelEn: "4. Low", value: 1.0 },
  ],
};

export function scaleValue(key: ScaleKey, code: string | null | undefined): number {
  const e = SCALES[key].find((s) => s.code === String(code ?? "").trim().charAt(0));
  return e ? e.value : 0;
}
export function scaleLabel(key: ScaleKey, code: string | null | undefined): string {
  return SCALES[key].find((s) => s.code === String(code ?? "").trim().charAt(0))?.labelEs ?? "—";
}

// ---- Cálculo por opción (proveedor × plazo de pago) ----
export interface OptionInput {
  supplierName: string;
  cif?: number | null; // Precio CIF contado (I)
  creditSurcharge?: number | null; // Precio crédito (J)
  priceWithCredit?: number | null; // K si el proveedor solo da precio con crédito
  tons: number; // P
  creditDays: number; // Q
  claimsAmount?: number | null; // V
  merma?: number | null; // O
  internacionExtra?: number | null; // se suma a internación (ej. +126 en DPU)
  shipmentDate?: string | Date | null; // AI
  legalRisk?: string | null;
  alliance?: string | null;
  penalty?: string | null;
  specs?: string | null;
  claims?: string | null;
  supplierScore?: number | null; // nota N.E.P 0-100
}

export interface OptionResult {
  priceWithCredit: number; // K
  internacion: number; // L
  surveyor: number; // M
  plantPrice: number; // N – precio en planta
  impliedRate: number; // R
  factorDays: number; // T
  paymentAdj: number; // U
  claimsPerTon: number; // W
  capitalCost: number; // X
  transformedPrice: number; // Y – precio transformado
  totalSbb: number; // AF
  spread: number; // AG
  leadTime: number | null; // AJ
  etaPlant: Date | null; // AK
  scores: {
    price: number;
    payment: number;
    delivery: number;
    legal: number;
    alliance: number;
    penalty: number;
    vec: number;
    supplierEval: number;
    specs: number;
    claims: number;
    vtf: number;
    total: number;
  };
}

const DAY = 86_400_000;
function toDate(d: string | Date | null | undefined): Date | null {
  if (!d) return null;
  const x = d instanceof Date ? d : new Date(d);
  return Number.isNaN(x.getTime()) ? null : x;
}
function daysBetween(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / DAY);
}

export function totalSbb(p: ReferenceParams): number {
  return p.sbbIndex + p.sbbFreight + p.dai + p.internacion + p.surveyor + p.sbbCredit;
}

/** Fila de referencia (fila 16): precio transformado objetivo Y16. */
export function targetTransformed(p: ReferenceParams): number {
  const u = p.targetCif ? p.targetCif - p.targetCif * (1 + (p.interestRate / 365) * p.refFactorDays) : 0;
  return p.targetCif + p.internacion + p.merma + u;
}

export function evaluateOption(o: OptionInput, p: ReferenceParams, w: EvaluationWeights = DEFAULT_WEIGHTS): OptionResult {
  const cif = o.cif ?? 0;
  const K = o.priceWithCredit ?? cif + (o.creditSurcharge ?? 0);
  const L = p.internacion + (o.internacionExtra ?? 0);
  const M = p.surveyor;
  const N = K + L + M;
  const Q = o.creditDays;
  const R = cif && Q ? ((K / cif - 1) / Q) * 360 : 0;
  const T = Q - p.transitDays - p.anchorageDays - p.emDays;
  const U = cif ? cif - cif * (1 + (p.interestRate / 365) * T) : 0;
  const W = o.tons ? (o.claimsAmount ?? 0) / o.tons : 0;
  const X = o.tons && o.tons - p.requiredTons > 0 ? ((o.tons - p.requiredTons) * p.interestRate * N * (30 / 365)) / o.tons : 0;
  const Y = N + (o.merma ?? 0) + U + W + X;
  const AF = totalSbb(p);
  const AG = AF ? N / AF - 1 : 0;

  const ship = toDate(o.shipmentDate);
  const base = toDate(p.date);
  const lead = ship && base ? daysBetween(ship, base) : null;
  const eta = ship ? new Date(ship.getTime() + (p.transitDays + p.anchorageDays + p.emDays) * DAY) : null;

  // Precio
  const Y16 = targetTransformed(p);
  const priceScore = Y < Y16 ? w.priceBelowTarget : w.price + ((Y - Y16) / w.priceStep) * -w.pricePenaltyPerStep;
  // Términos de pago
  let pay = p.refCreditDays ? (Q / p.refCreditDays) * w.payment : 0;
  if (pay < 0) pay = 0;
  if (pay > w.paymentCap) pay = w.paymentCap;
  // Términos de entrega
  let del = lead && lead > 0 ? (p.refLeadTime / lead) * w.delivery : 0;
  if (del < 0) del = 0;
  if (del > w.deliveryCap) del = w.deliveryOverCapValue;

  const legal = scaleValue("legal", o.legalRisk ?? "4") * w.legal;
  const alliance = scaleValue("alliance", o.alliance ?? "3") * w.alliance;
  const penalty = scaleValue("penalty", o.penalty ?? "1") * w.penalty;
  const vec = priceScore + pay + del + legal + alliance + penalty;
  const supplierEval = ((o.supplierScore ?? 0) * w.supplierEval) / 100;
  const specs = scaleValue("specs", o.specs ?? "4") * w.specs;
  const claims = scaleValue("claims", o.claims ?? "1") * w.claims;
  const vtf = supplierEval + specs + claims;

  return {
    priceWithCredit: K,
    internacion: L,
    surveyor: M,
    plantPrice: N,
    impliedRate: R,
    factorDays: T,
    paymentAdj: U,
    claimsPerTon: W,
    capitalCost: X,
    transformedPrice: Y,
    totalSbb: AF,
    spread: AG,
    leadTime: lead,
    etaPlant: eta,
    scores: { price: priceScore, payment: pay, delivery: del, legal, alliance, penalty, vec, supplierEval, specs, claims, vtf, total: vec + vtf },
  };
}

/** Observaciones sobre reglas del Excel original que conviene revisar con Compras. */
export function weightWarnings(w: EvaluationWeights, p: ReferenceParams): string[] {
  const out: string[] = [];
  if (w.deliveryOverCapValue > w.deliveryCap)
    out.push(
      `Términos de entrega: si el puntaje supera el tope (${(w.deliveryCap * 100).toFixed(0)}%) se asigna ${(w.deliveryOverCapValue * 100).toFixed(0)}% (regla heredada del Excel; normalmente debería ser igual al tope).`,
    );
  const std = p.transitDays + p.anchorageDays + p.emDays;
  if (p.refCreditDays - p.refFactorDays !== std)
    out.push(
      `El precio objetivo usa factor días ${p.refFactorDays} (crédito ref. ${p.refCreditDays} − ${p.refCreditDays - p.refFactorDays}), mientras las ofertas usan tránsito+fondeo+EM = ${std} días.`,
    );
  const max = w.priceBelowTarget + w.paymentCap + Math.max(w.deliveryCap, w.deliveryOverCapValue) + w.legal + w.alliance + w.supplierEval + w.specs * 1.5;
  if (max > 1.0001) out.push(`El puntaje máximo alcanzable es ${(max * 100).toFixed(0)}% (bonos por precio bajo objetivo, crédito y "Excede").`);
  return out;
}
