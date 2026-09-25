import ExcelJS from "exceljs";
import { num } from "../pricing";
import { sectionFields, type TemplateDef } from "../templates";
import type { ParsedLine, ParsedOffer } from "./types";

export function norm(s: unknown): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function cellValue(v: ExcelJS.CellValue): unknown {
  if (v === null || v === undefined) return null;
  if (typeof v === "object") {
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if ("result" in v) return (v as ExcelJS.CellFormulaValue).result ?? null;
    if ("richText" in v) return (v as ExcelJS.CellRichTextValue).richText.map((r) => r.text).join("");
    if ("text" in v) return (v as ExcelJS.CellHyperlinkValue).text;
    if ("error" in v) return null;
  }
  return v;
}

function cleanText(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (s === "" || s === "-") return null;
  return s;
}

function gKey(v: unknown): string {
  return String(v ?? "").trim().replace(/\.0+$/, "");
}

type Target =
  | { kind: "g" }
  | { kind: "offered" }
  | { kind: "field"; key: string; type: string }
  | { kind: "component"; key: string }
  | { kind: "financing"; term: number };

/** Lee un Excel de oferta (el generado por la app o el formato manual actual) y lo mapea a la plantilla. */
export async function parseOfferWorkbook(buf: Buffer | ArrayBuffer, t: TemplateDef): Promise<ParsedOffer> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as ArrayBuffer);
  const warnings: string[] = [];
  const meta: ParsedOffer["meta"] = {};
  const ms = wb.getWorksheet("_meta");
  if (ms) {
    meta.eventCode = String(cellValue(ms.getCell("B1").value) ?? "") || undefined;
    meta.invitationId = String(cellValue(ms.getCell("B2").value) ?? "") || undefined;
    meta.round = num(cellValue(ms.getCell("B3").value)) ?? undefined;
  }

  // Buscar la hoja y fila de encabezados (celda "Código G")
  let ws: ExcelJS.Worksheet | undefined;
  let headerRow = 0;
  for (const s of wb.worksheets) {
    if (s.name === "_meta") continue;
    for (let r = 1; r <= Math.min(60, s.rowCount); r++) {
      const row = s.getRow(r);
      let found = false;
      row.eachCell((c) => {
        if (norm(cellValue(c.value)).startsWith("codigo g")) found = true;
      });
      if (found) {
        ws = s;
        headerRow = r;
        break;
      }
    }
    if (ws) break;
  }
  if (!ws) return { meta, lines: [], warnings: ["No se encontró la fila de encabezados (columna 'Código G/SKU')."] };

  // Candidatos por campo
  const cands: { target: Target; names: string[] }[] = [];
  const offerFields = [...sectionFields(t.fields, "OFFER_TECH"), ...sectionFields(t.fields, "OFFER_COMPLIANCE"), ...sectionFields(t.fields, "OFFER_TERMS")];
  cands.push({ target: { kind: "offered" }, names: ["cantidad ofertada", "offered quantity", "offered"] });
  for (const f of offerFields) {
    cands.push({
      target: { kind: "field", key: f.key, type: f.type },
      names: [`${f.labelEs}${f.unit ? `, ${f.unit}` : ""} / ${f.labelEn}`, f.labelEs, f.labelEn, ...(f.aliases ?? [])].map(norm),
    });
  }
  for (const p of t.priceComponents) cands.push({ target: { kind: "component", key: p.key }, names: [`${p.labelEs} / ${p.labelEn}`, p.labelEs, p.labelEn, ...(p.aliases ?? [])].map(norm) });

  const headers: { col: number; h: string }[] = [];
  ws.getRow(headerRow).eachCell((c, col) => headers.push({ col, h: norm(cellValue(c.value)) }));
  const map = new Map<number, Target>();
  const used = new Set<Target>();
  let gCol = 0;
  for (const { col, h } of headers) {
    if (h.startsWith("codigo g")) gCol = col;
    const fin = h.match(/^(\d+) dias bl/);
    if (fin) {
      const term = Number(fin[1]);
      if (t.financingTerms.includes(term)) map.set(col, { kind: "financing", term });
    }
  }
  // 1) coincidencia exacta, 2) prefijo
  for (const mode of ["exact", "prefix"] as const) {
    for (const { col, h } of headers) {
      if (map.has(col) || !h || col === gCol) continue;
      for (const c of cands) {
        if (used.has(c.target)) continue;
        const hit = c.names.some((n) => (mode === "exact" ? h === n : n.length > 2 && h.startsWith(n)));
        if (hit) {
          map.set(col, c.target);
          used.add(c.target);
          break;
        }
      }
    }
  }
  if (!gCol) warnings.push("No se encontró la columna Código G/SKU.");
  for (const c of cands) if (!used.has(c.target)) warnings.push(`Columna no encontrada: ${c.names[1] ?? c.names[0]}`);

  const lines: ParsedLine[] = [];
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const g = gKey(cellValue(row.getCell(gCol).value));
    if (!g) continue;
    const line: ParsedLine = { gCode: g, offeredQty: null, prices: {}, financing: {}, values: {}, noOffer: false };
    for (const [col, tg] of map) {
      const v = cellValue(row.getCell(col).value);
      if (tg.kind === "offered") line.offeredQty = num(v);
      else if (tg.kind === "component") line.prices[tg.key] = num(v);
      else if (tg.kind === "financing") line.financing[String(tg.term)] = num(v);
      else if (tg.kind === "field") {
        if (tg.type === "NUMBER") line.values[tg.key] = num(v);
        else if (tg.type === "OKNO") {
          const s = cleanText(v);
          line.values[tg.key] = s ? (/^ok|^si|^yes|^cumple/i.test(s) ? "OK" : "NO") : null;
        } else line.values[tg.key] = cleanText(v);
      }
    }
    const base = Object.values(line.prices).reduce<number>((s, v) => s + (v ?? 0), 0);
    line.noOffer = !line.offeredQty || base === 0;
    lines.push(line);
  }
  return { meta, lines, warnings };
}

export interface ParsedItem {
  vtaCode: string | null;
  gCode: string;
  description: string;
  quantity: number;
  specs: Record<string, number | string>;
}

/** Lee la tabla de SKUs (Código VTA, Código G, Descripción, Cantidad y medidas) desde un Excel con el formato actual. */
export async function parseItemsWorkbook(buf: Buffer | ArrayBuffer, t: TemplateDef): Promise<{ items: ParsedItem[]; warnings: string[] }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as ArrayBuffer);
  for (const ws of wb.worksheets) {
    for (let r = 1; r <= Math.min(60, ws.rowCount); r++) {
      const headers: { col: number; h: string }[] = [];
      ws.getRow(r).eachCell((c, col) => headers.push({ col, h: norm(cellValue(c.value)) }));
      const g = headers.find((x) => x.h.startsWith("codigo g"));
      if (!g) continue;
      const vta = headers.find((x) => x.h.startsWith("codigo vta"));
      const desc = headers.find((x) => x.h.startsWith("descripcion") || x.h.startsWith("description"));
      const qty = headers.find((x) => x.h.startsWith("cantidad solicitada") || x.h.startsWith("cantidad") || x.h.startsWith("quantity"));
      const specs = sectionFields(t.fields, "SKU_SPEC").map((f) => {
        const names = [`${f.labelEs}${f.unit ? `, ${f.unit}` : ""} / ${f.labelEn}`, `${f.labelEs}${f.unit ? `, ${f.unit}` : ""}`, f.labelEs, f.labelEn, ...(f.aliases ?? [])].map(norm);
        const h = headers.find((x) => names.includes(x.h)) ?? headers.find((x) => names.some((n) => x.h.startsWith(n)));
        return { f, col: h?.col };
      });
      const warnings = specs.filter((s) => !s.col).map((s) => `Columna de medida no encontrada: ${s.f.labelEs}`);
      const items: ParsedItem[] = [];
      for (let rr = r + 1; rr <= ws.rowCount; rr++) {
        const row = ws.getRow(rr);
        const gc = gKey(cellValue(row.getCell(g.col).value));
        if (!gc) continue;
        const sp: Record<string, number | string> = {};
        for (const s of specs) {
          if (!s.col) continue;
          const v = cellValue(row.getCell(s.col).value);
          if (v === null || v === undefined || String(v).trim() === "") continue;
          const n = num(v);
          sp[s.f.key] = s.f.type === "NUMBER" && n !== null ? Math.round(n * 10000) / 10000 : String(v).trim();
        }
        items.push({
          vtaCode: vta ? cleanText(cellValue(row.getCell(vta.col).value)) : null,
          gCode: gc,
          description: desc ? String(cellValue(row.getCell(desc.col).value) ?? "").trim() : gc,
          quantity: qty ? num(cellValue(row.getCell(qty.col).value)) ?? 0 : 0,
          specs: sp,
        });
      }
      return { items, warnings };
    }
  }
  return { items: [], warnings: ["No se encontró la columna 'Código G/SKU'."] };
}

/** Pegar desde Excel: columnas separadas por tabulador — VTA, G, Descripción, Cantidad, medidas en orden de plantilla. */
export function parseItemsPaste(text: string, t: TemplateDef): ParsedItem[] {
  const specs = sectionFields(t.fields, "SKU_SPEC");
  return text
    .split(/\r?\n/)
    .map((l) => l.split("\t"))
    .filter((c) => c.length >= 3 && c[1]?.trim() && !norm(c[1]).startsWith("codigo"))
    .map((c) => {
      const sp: Record<string, number | string> = {};
      specs.forEach((f, i) => {
        const v = c[4 + i]?.trim();
        if (!v) return;
        const n = num(v);
        sp[f.key] = f.type === "NUMBER" && n !== null ? n : v;
      });
      return { vtaCode: c[0]?.trim() || null, gCode: c[1].trim(), description: (c[2] ?? "").trim(), quantity: num(c[3]) ?? 0, specs: sp };
    });
}
