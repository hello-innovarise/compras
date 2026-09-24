import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parseOfferWorkbook } from "@/lib/excel/parse";
import { generateOfferWorkbook } from "@/lib/excel/generate";
import { PERFILES_TEMPLATE } from "@/lib/templates";
import { summarizeBid } from "@/lib/pricing";

const fixture = path.join(__dirname, "../fixtures/offer-perfiles.xlsx");
const C = PERFILES_TEMPLATE.priceComponents.map((p) => p.key);

describe.skipIf(!fs.existsSync(fixture))("Excel real del proveedor (Perfiles GT)", () => {
  it("lee las 30 líneas con los mismos totales del Excel", async () => {
    const r = await parseOfferWorkbook(fs.readFileSync(fixture), PERFILES_TEMPLATE);
    expect(r.lines).toHaveLength(30);
    const first = r.lines[0];
    expect(first.gCode).toBe("5500101");
    expect(first.offeredQty).toBe(80);
    expect(first.prices).toEqual({ fob: 680, freight: 110, insurance: 5 });
    expect(first.financing).toEqual({ "35": 5, "60": 15, "90": 30, "120": 40 });
    expect(first.values.mill1).toBe("CAGCELIK");
    expect(first.values.dimensional).toBe("OK");
    expect(first.values.origin).toBe("TURKEY");
    const noOffer = r.lines.find((l) => l.gCode === "5500158")!;
    expect(noOffer.noOffer).toBe(true);
    const s = summarizeBid(r.lines, C, PERFILES_TEMPLATE.financingTerms, 24.5);
    expect(s.offeredQty).toBe(1960);
    expect(s.totals[35]).toBe(1559400);
    expect(s.totals[120]).toBe(1628000);
    expect(s.weightedAvg[35]).toBeCloseTo(795.612, 3);
    expect(s.containers).toBe(80);
  });
});

describe("Excel generado por la app", () => {
  it("ida y vuelta: generar pre-llenado y volver a leer", async () => {
    const items = [
      { id: "i1", gCode: "5500101", vtaCode: "", description: 'PERFIL ANGULAR 3/4"X1/8X6M C', quantity: 80, specs: { widthNom: 19.05 } },
      { id: "i2", gCode: "5500154", vtaCode: "", description: 'PERFIL REDONDO 3/4"X6M', quantity: 80, specs: { diamNom: 19.05 } },
    ];
    const buf = await generateOfferWorkbook({
      event: { code: "RFQ-TEST", title: "Test", companyName: "Aceros de Guatemala, S.A.", family: "Perfiles", deadline: new Date(), timezone: "UTC", round: 1, containerTons: 24.5 },
      template: PERFILES_TEMPLATE,
      items,
      invitationId: "inv1",
      lines: [{ itemId: "i1", offeredQty: 80, prices: { fob: 680, freight: 110, insurance: 5 }, financing: { "35": 5 }, values: { mill1: "X", dimensional: "OK" } }],
    });
    const r = await parseOfferWorkbook(buf, PERFILES_TEMPLATE);
    expect(r.meta).toEqual({ eventCode: "RFQ-TEST", invitationId: "inv1", round: 1 });
    expect(r.lines).toHaveLength(2);
    expect(r.lines[0].prices.fob).toBe(680);
    expect(r.lines[0].financing["35"]).toBe(5);
    expect(r.lines[0].values.mill1).toBe("X");
    expect(r.lines[1].noOffer).toBe(true);
    expect(r.warnings).toEqual([]);
  });
});

describe.skipIf(!fs.existsSync(fixture))("Importar SKUs desde el Excel actual", async () => {
  const { parseItemsWorkbook } = await import("@/lib/excel/parse");
  it("30 SKUs con medidas", async () => {
    const r = await parseItemsWorkbook(fs.readFileSync(fixture), PERFILES_TEMPLATE);
    expect(r.items).toHaveLength(30);
    expect(r.items[0]).toMatchObject({ gCode: "5500101", quantity: 80, specs: { widthNom: 19.05, thickMin: 2 } });
    expect(r.items.find((i) => i.gCode === "5500125")!.specs.thickMin).toBe("No esp.");
    expect(r.warnings).toEqual([]);
  });
});
