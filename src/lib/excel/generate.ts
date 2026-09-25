import ExcelJS from "exceljs";
import { sectionFields, type TemplateDef } from "../templates";
import type { ExcelBidLine, ExcelEventInfo, ExcelItem } from "./types";

const GREEN = "FFE2F0D9"; // casillas a llenar por el proveedor
const GREY = "FFF2F2F2";
const HEAD = "FF1F3864";

function colName(n: number): string {
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function d(date?: Date | null): string {
  return date ? date.toISOString().slice(0, 10) : "";
}

export interface ColumnMap {
  vta: number;
  g: number;
  desc: number;
  qty: number;
  specs: { key: string; col: number }[];
  offered: number;
  tech: { key: string; col: number }[];
  compliance: { key: string; col: number }[];
  components: { key: string; col: number }[];
  base: number;
  financing: { term: number; col: number }[];
  terms: { key: string; col: number }[];
  termPrices: { term: number; col: number }[];
  termTotals: { term: number; col: number }[];
}

export function columnMap(t: TemplateDef): ColumnMap {
  let c = 2;
  const next = () => c++;
  const vta = next();
  const g = next();
  const desc = next();
  const qty = next();
  const specs = sectionFields(t.fields, "SKU_SPEC").map((f) => ({ key: f.key, col: next() }));
  const offered = next();
  const tech = sectionFields(t.fields, "OFFER_TECH").map((f) => ({ key: f.key, col: next() }));
  const compliance = sectionFields(t.fields, "OFFER_COMPLIANCE").map((f) => ({ key: f.key, col: next() }));
  const components = t.priceComponents.map((p) => ({ key: p.key, col: next() }));
  const base = next();
  const financing = t.financingTerms.map((term) => ({ term, col: next() }));
  const terms = sectionFields(t.fields, "OFFER_TERMS").map((f) => ({ key: f.key, col: next() }));
  const termPrices = t.financingTerms.map((term) => ({ term, col: next() }));
  const termTotals = t.financingTerms.map((term) => ({ term, col: next() }));
  return { vta, g, desc, qty, specs, offered, tech, compliance, components, base, financing, terms, termPrices, termTotals };
}

/** Genera el Excel de cotización con el mismo layout del formato actual (pre-llenado si hay oferta). */
export async function generateOfferWorkbook(opts: {
  event: ExcelEventInfo;
  template: TemplateDef;
  items: ExcelItem[];
  supplierName?: string;
  invitationId?: string;
  lines?: ExcelBidLine[];
}): Promise<Buffer> {
  const { event, template: t, items } = opts;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Compras AG";
  const ws = wb.addWorksheet(event.family.slice(0, 28) || "Oferta", { views: [{ state: "frozen", xSplit: 4, ySplit: 16 }] });
  const m = columnMap(t);
  const fieldBy = new Map(t.fields.map((f) => [f.key, f]));

  ws.getCell("C2").value = "COTIZACION DE MATERIA PRIMA / RAW MATERIAL QUOTE REQUEST";
  ws.getCell("C2").font = { bold: true, size: 14, color: { argb: HEAD } };
  ws.getCell("C3").value = `${event.code} – ${event.title}${event.round > 1 ? ` – Ronda / Round ${event.round}` : ""}`;
  ws.getCell("C5").value = `Cotizar los siguientes materiales a nombre de ${event.companyName} / Quote on behalf of ${event.companyName} the following material`;
  const info: [string, string][] = [
    ["Embarque / Shipment", d(event.shipmentDate)],
    ["ETA", event.shipmentDate && event.etaDays != null ? d(new Date(event.shipmentDate.getTime() + event.etaDays * 86400000)) : ""],
    ["INCOTERM", [event.incoterm, event.containerTons ? `(${event.containerTons} TM PER CONTAINER)` : "", event.freeDays ? `| ${event.freeDays} DÍAS LIBRES / FREE DAYS` : ""].filter(Boolean).join(" ")],
    ["Destino / Destination", [event.destination, event.port].filter(Boolean).join(" – ")],
    ["Material", event.material ?? event.family],
    ["Fecha límite / Deadline", `${event.deadline.toISOString().replace("T", " ").slice(0, 16)} UTC`],
    ["Proveedor / Supplier", opts.supplierName ?? ""],
  ];
  info.forEach(([k, v], i) => {
    const r = 7 + i;
    ws.getCell(r, 3).value = k;
    ws.getCell(r, 3).font = { bold: true };
    ws.getCell(r, 4).value = v;
  });

  // Encabezados de grupo (fila 15) y columnas (fila 16)
  const H = 16;
  const group = (col: number, text: string) => {
    ws.getCell(15, col).value = text;
    ws.getCell(15, col).font = { bold: true, color: { argb: HEAD } };
  };
  if (m.specs.length) group(m.specs[0].col, "Medidas específicas de cada SKU");
  if (m.tech.length) group(m.tech[0].col, "Molino / Mill");
  if (m.compliance.length) group(m.compliance[0].col, "Compliance with material specifications");
  group(m.components[0]?.col ?? m.base, "Other Conditions");

  const header = (col: number, text: string, supplier = false) => {
    const cell = ws.getCell(H, col);
    cell.value = text;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: supplier ? "FF548235" : HEAD } };
    cell.alignment = { wrapText: true, vertical: "middle", horizontal: "center" };
    ws.getColumn(col).width = 14;
  };
  header(m.vta, "Código VTA/SKU");
  header(m.g, "Código G/SKU");
  header(m.desc, "Descripción / Description");
  ws.getColumn(m.desc).width = 34;
  header(m.qty, "Cantidad Solicitada/ Quantity (Tm)");
  const lbl = (key: string) => {
    const f = fieldBy.get(key)!;
    return `${f.labelEs}${f.unit ? `, ${f.unit}` : ""} / ${f.labelEn}`;
  };
  m.specs.forEach((s) => header(s.col, lbl(s.key)));
  header(m.offered, "Cantidad ofertada / Offered Quantity (Tm)", true);
  m.tech.forEach((s) => header(s.col, lbl(s.key), true));
  m.compliance.forEach((s) => header(s.col, lbl(s.key), true));
  m.components.forEach((s) => {
    const p = t.priceComponents.find((x) => x.key === s.key)!;
    header(s.col, `${p.labelEs} / ${p.labelEn}`, true);
  });
  header(m.base, `TOTAL ${t.baseLabel}`);
  m.financing.forEach((s) => header(s.col, `${s.term} DÍAS BL (COLOCAR VALOR DE FINANCIAMIENTO X TM)`, true));
  m.terms.forEach((s) => header(s.col, lbl(s.key), true));
  m.termPrices.forEach((s) => header(s.col, `PRECIO ${s.term} DÍAS BL`));
  m.termTotals.forEach((s) => header(s.col, `TOTAL PRECIO ${s.term} DÍAS BL`));
  ws.getRow(H).height = 60;

  const lineBy = new Map((opts.lines ?? []).map((l) => [l.itemId, l]));
  const first = H + 1;
  items.forEach((it, i) => {
    const r = first + i;
    const L = lineBy.get(it.id);
    const row = ws.getRow(r);
    row.getCell(m.vta).value = it.vtaCode ?? "";
    row.getCell(m.g).value = it.gCode;
    row.getCell(m.desc).value = it.description;
    row.getCell(m.qty).value = it.quantity;
    for (const s of m.specs) {
      const v = it.specs?.[s.key];
      row.getCell(s.col).value = v === undefined || v === null ? null : (v as ExcelJS.CellValue);
      row.getCell(s.col).numFmt = "0.00";
    }
    const supplierCells: number[] = [m.offered, ...m.tech.map((x) => x.col), ...m.compliance.map((x) => x.col), ...m.components.map((x) => x.col), ...m.financing.map((x) => x.col), ...m.terms.map((x) => x.col)];
    if (L) {
      row.getCell(m.offered).value = L.noOffer ? 0 : (L.offeredQty ?? null);
      for (const x of [...m.tech, ...m.compliance, ...m.terms]) row.getCell(x.col).value = (L.values?.[x.key] as ExcelJS.CellValue) ?? null;
      for (const x of m.components) row.getCell(x.col).value = (L.prices?.[x.key] as ExcelJS.CellValue) ?? null;
      for (const x of m.financing) row.getCell(x.col).value = (L.financing?.[String(x.term)] as ExcelJS.CellValue) ?? null;
    }
    for (const c of supplierCells) {
      const cell = row.getCell(c);
      cell.protection = { locked: false };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN } };
    }
    for (const c of [m.vta, m.g, m.desc, m.qty, ...m.specs.map((x) => x.col)]) row.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREY } };
    const compRefs = m.components.map((x) => `${colName(x.col)}${r}`);
    row.getCell(m.base).value = { formula: compRefs.join("+") } as ExcelJS.CellFormulaValue;
    const base = `${colName(m.base)}${r}`;
    const qty = `${colName(m.offered)}${r}`;
    m.termPrices.forEach((tp, j) => {
      const fin = `${colName(m.financing[j].col)}${r}`;
      row.getCell(tp.col).value = { formula: `IF(OR(${base}=0,${fin}=""),0,${base}+${fin})` } as ExcelJS.CellFormulaValue;
      row.getCell(m.termTotals[j].col).value = { formula: `${colName(tp.col)}${r}*${qty}` } as ExcelJS.CellFormulaValue;
    });
  });
  const last = first + items.length - 1;
  const tot = last + 1;
  const sum = (col: number) => ({ formula: `SUM(${colName(col)}${first}:${colName(col)}${last})` }) as ExcelJS.CellFormulaValue;
  ws.getCell(tot, m.desc).value = "TOTAL";
  ws.getCell(tot, m.qty).value = sum(m.qty);
  ws.getCell(tot, m.offered).value = sum(m.offered);
  m.termTotals.forEach((x) => (ws.getCell(tot, x.col).value = sum(x.col)));
  ws.getCell(tot + 1, m.desc).value = "Contenedores / Promedio ponderado por TM";
  if (t.containerTons) ws.getCell(tot + 1, m.offered).value = { formula: `${colName(m.offered)}${tot}/${t.containerTons}` } as ExcelJS.CellFormulaValue;
  m.termTotals.forEach(
    (x) => (ws.getCell(tot + 1, x.col).value = { formula: `IF(${colName(m.offered)}${tot}=0,0,${colName(x.col)}${tot}/${colName(m.offered)}${tot})` } as ExcelJS.CellFormulaValue),
  );
  for (const r of [tot, tot + 1]) ws.getRow(r).font = { bold: true };
  ws.autoFilter = { from: { row: H, column: 2 }, to: { row: last, column: m.termTotals.at(-1)?.col ?? m.base } };
  await ws.protect("", { selectLockedCells: true, selectUnlockedCells: true, formatColumns: true, formatRows: true, autoFilter: true, sort: true });

  if (event.conditions) {
    const cs = wb.addWorksheet("Condiciones");
    cs.getColumn(1).width = 120;
    event.conditions.split("\n").forEach((line, i) => {
      cs.getCell(i + 1, 1).value = line;
      cs.getCell(i + 1, 1).alignment = { wrapText: true };
    });
  }

  const meta = wb.addWorksheet("_meta", { state: "veryHidden" });
  meta.getCell("A1").value = "eventCode";
  meta.getCell("B1").value = event.code;
  meta.getCell("A2").value = "invitationId";
  meta.getCell("B2").value = opts.invitationId ?? "";
  meta.getCell("A3").value = "round";
  meta.getCell("B3").value = event.round;

  return Buffer.from(await wb.xlsx.writeBuffer());
}
