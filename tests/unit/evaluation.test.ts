import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMS, DEFAULT_WEIGHTS, evaluateOption, targetTransformed, type ReferenceParams } from "@/lib/evaluation";
import { proposeAllocation, scenarioMetrics } from "@/lib/allocation";

// Parámetros de la hoja "HRC TYPSA" (fila 16 y tiempos estándar CHINA/JAPON)
const P: ReferenceParams = {
  ...DEFAULT_PARAMS,
  date: "2026-07-20", // 46223
  requiredTons: 394,
  targetCif: 605,
  pexPrice: 606,
  internacion: 16.49,
  surveyor: 0,
  merma: 0,
  refCreditDays: 120,
  refFactorDays: 30,
  interestRate: 0.14,
  transitDays: 45,
  anchorageDays: 7,
  emDays: 9,
  refLeadTime: 68,
  sbbIndex: 530,
  sbbFreight: 91.64,
  dai: 0,
  sbbCredit: 0,
};
const ship1 = "2026-09-26"; // 46291
const ship2 = "2026-10-30"; // 46325
const fourBells = { supplierName: "FOUR BELLS", cif: 655, tons: 394, shipmentDate: ship1, legalRisk: "4", alliance: "3", penalty: "1", specs: "4", claims: "1", supplierScore: 89.5 };

describe("Matriz de evaluación – HRC TYPSA", () => {
  it("precio transformado objetivo (Y16) = 614.528", () => {
    expect(targetTransformed(P)).toBeCloseTo(614.528, 3);
  });

  it("FOUR BELLS contado", () => {
    const r = evaluateOption({ ...fourBells, creditDays: 0, creditSurcharge: 0 }, P);
    expect(r.plantPrice).toBeCloseTo(671.49, 2);
    expect(r.factorDays).toBe(-61);
    expect(r.paymentAdj).toBeCloseTo(15.325, 3);
    expect(r.transformedPrice).toBeCloseTo(686.815, 3);
    expect(r.spread).toBeCloseTo(0.0523, 3);
    expect(r.totalSbb).toBeCloseTo(638.13, 2);
    expect(r.leadTime).toBe(68);
    expect(r.scores.price).toBeCloseTo(0.009, 3);
    expect(r.scores.vec).toBeCloseTo(0.159, 3);
    expect(r.scores.vtf).toBeCloseTo(0.395, 3);
    expect(r.scores.total).toBeCloseTo(0.554, 3);
  });

  it("FOUR BELLS 30 y 90 días", () => {
    const r30 = evaluateOption({ ...fourBells, creditDays: 30, creditSurcharge: 4.3 }, P);
    expect(r30.impliedRate).toBeCloseTo(0.0788, 3);
    expect(r30.transformedPrice).toBeCloseTo(683.578, 3);
    expect(r30.scores.total).toBeCloseTo(0.602, 3);
    const r90 = evaluateOption({ ...fourBells, creditDays: 90, creditSurcharge: 12.92 }, P);
    expect(r90.transformedPrice).toBeCloseTo(677.124, 3);
    expect(r90.scores.payment).toBeCloseTo(0.1125, 4);
    expect(r90.scores.total).toBeCloseTo(0.699, 3);
  });

  it("STEEL RESOURCES solo precio con crédito, 120 días", () => {
    const r = evaluateOption(
      { supplierName: "STEEL RESOURCES", priceWithCredit: 681.61, tons: 394, creditDays: 120, shipmentDate: ship2, legalRisk: "2", alliance: "1", penalty: "1", specs: "4", claims: "1", supplierScore: 88 },
      P,
    );
    expect(r.transformedPrice).toBeCloseTo(698.1, 2);
    expect(r.leadTime).toBe(102);
    expect(r.scores.delivery).toBeCloseTo(0.0333, 3);
    expect(r.scores.total).toBeCloseTo(0.629, 3);
  });

  it("TERNIUM DPU con internación +126", () => {
    const r = evaluateOption(
      { supplierName: "TERNIUM", cif: 870, tons: 394, creditDays: 0, internacionExtra: 126, shipmentDate: ship1, legalRisk: "4", alliance: "1", penalty: "1", specs: "4", claims: "1", supplierScore: 93 },
      P,
      DEFAULT_WEIGHTS,
    );
    expect(r.transformedPrice).toBeCloseTo(1032.846, 3);
    expect(r.scores.total).toBeCloseTo(-0.548, 3);
  });
});

describe("Escenarios de split – ALEO VS ASE M", () => {
  const aleoAzc = { supplierName: "ALEO", termDays: 0, tons: 1000, unitPrice: 813.9 };
  const azcpp = { supplierName: "ALEO", termDays: 30, tons: 790, unitPrice: 912.1 };
  it("split 1000/2347 → ponderado 851.09", () => {
    const m = scenarioMetrics([aleoAzc, { supplierName: "ASE", termDays: 120, tons: 2347, unitPrice: 846.4 }, azcpp]);
    expect(m.total).toBeCloseTo(3520959.8, 1);
    expect(m.weighted).toBeCloseTo(851.09, 2);
  });
  it("con descuento negociado −18 → 840.878", () => {
    const m = scenarioMetrics([aleoAzc, { supplierName: "ASE", termDays: 120, tons: 2347, unitPrice: 846.4, priceAdjust: -18 }, azcpp]);
    expect(m.weighted).toBeCloseTo(840.878, 3);
  });
});

describe("Propuesta automática", () => {
  it("asigna al mejor precio respetando TM ofertadas y % máximo", () => {
    const r = proposeAllocation(
      [{ itemId: "A", itemLabel: "A", tons: 100 }],
      [
        { supplierName: "X", termDays: 0, itemId: "A", offeredTons: 100, unitPrice: 700, rankValue: 700 },
        { supplierName: "Y", termDays: 0, itemId: "A", offeredTons: 100, unitPrice: 710, rankValue: 710 },
      ],
      { maxSharePerSupplier: 0.6 },
    );
    expect(r.lines.map((l) => [l.supplierName, l.tons])).toEqual([
      ["X", 60],
      ["Y", 40],
    ]);
  });
  it("excluye proveedores bajo el mínimo de TM y reasigna", () => {
    const r = proposeAllocation(
      [
        { itemId: "A", itemLabel: "A", tons: 100 },
        { itemId: "B", itemLabel: "B", tons: 10 },
      ],
      [
        { supplierName: "X", termDays: 0, itemId: "A", offeredTons: 100, unitPrice: 700, rankValue: 700 },
        { supplierName: "X", termDays: 0, itemId: "B", offeredTons: 10, unitPrice: 705, rankValue: 705 },
        { supplierName: "Z", termDays: 0, itemId: "B", offeredTons: 10, unitPrice: 690, rankValue: 690 },
      ],
      { minTonsPerSupplier: 20 },
    );
    expect(r.lines.every((l) => l.supplierName === "X")).toBe(true);
    expect(r.explanations[0]).toContain("Z excluido");
  });
});
