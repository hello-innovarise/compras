import { describe, expect, it } from "vitest";
import { summarizeBid, termPrice, lineTotal, type LinePricing } from "@/lib/pricing";

const C = ["fob", "freight", "insurance"];
const TERMS = [35, 60, 90, 120];
const line = (fob: number, qty: number, fin = { "35": 5, "60": 15, "90": 30, "120": 40 }): LinePricing => ({
  offeredQty: qty,
  prices: { fob, freight: 110, insurance: 5 },
  financing: fin,
});

describe("pricing (Offer RFQ – Perfiles GT)", () => {
  it("SKU 5500101: CIF 795, 35 días 800, total 64 000", () => {
    const l = line(680, 80);
    expect(termPrice(l, C, 0)).toBe(795);
    expect(termPrice(l, C, 35)).toBe(800);
    expect(termPrice(l, C, 120)).toBe(835);
    expect(lineTotal(l, C, 35)).toBe(64000);
    expect(lineTotal(l, C, 120)).toBe(66800);
  });

  it("línea sin oferta (precio 0) no suma", () => {
    const l = line(0, 0);
    l.prices = { fob: 0, freight: 0, insurance: 0 };
    expect(termPrice(l, C, 35)).toBeNull();
  });

  it("promedio ponderado = total / Σ cantidad ofertada y contenedores = TM / 24.5", () => {
    const s = summarizeBid([line(680, 80), line(670, 30)], C, TERMS, 24.5);
    expect(s.offeredQty).toBe(110);
    expect(s.totals[35]).toBe(64000 + 23700);
    expect(s.weightedAvg[35]).toBeCloseTo(87700 / 110, 6);
    expect(s.containers).toBeCloseTo(110 / 24.5, 6);
  });
});
