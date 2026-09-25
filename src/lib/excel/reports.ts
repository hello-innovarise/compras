import ExcelJS from "exceljs";
import { comparison, type FullEvent } from "../events";
import { termLabel } from "../pricing";

const HEAD = "FF1F3864";
function styleHeader(row: ExcelJS.Row) {
  row.eachCell((c) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEAD } };
    c.alignment = { wrapText: true, vertical: "middle", horizontal: "center" };
  });
  row.height = 36;
}

export async function compareWorkbook(ev: FullEvent, round: number): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const base = comparison(ev, round, 0);
  const terms = base.terms;
  const res = wb.addWorksheet("Resumen");
  res.addRow([`${ev.code} – ${ev.title} – Ronda ${round}`]).font = { bold: true, size: 13 };
  res.addRow([]);
  const hr = res.addRow(["Proveedor", "TM ofertadas", "SKUs cotizados", ...terms.flatMap((t) => [`Total ${termLabel(t)}`, `Ponderado ${termLabel(t)}`])]);
  styleHeader(hr);
  const byTerm = terms.map((t) => comparison(ev, round, t));
  for (const s of base.summary) {
    res.addRow([s.name, s.qty, s.covered, ...byTerm.flatMap((c) => {
      const x = c.summary.find((y) => y.invitationId === s.invitationId)!;
      return [x.total, x.weighted];
    })]);
  }
  res.columns.forEach((c, i) => (c.width = i === 0 ? 34 : 16));

  for (const [ti, c] of byTerm.entries()) {
    const ws = wb.addWorksheet(termLabel(terms[ti]).slice(0, 30));
    const h = ws.addRow(["Código G", "Descripción", "TM solicitadas", ...c.suppliers.flatMap((s) => [`${s.name} USD/TM`, `${s.name} TM`, `${s.name} No cumple`]), "Mejor precio", "Mejor proveedor"]);
    styleHeader(h);
    for (const r of c.rows) {
      const bestCell = [...r.cells.values()].find((x) => x.best);
      const row = ws.addRow([
        r.gCode,
        r.description,
        r.quantity,
        ...c.suppliers.flatMap((s) => {
          const x = r.cells.get(s.invitationId);
          return [x?.price ?? null, x?.offeredQty ?? null, x?.noCompliance.join(", ") || null];
        }),
        r.bestPrice,
        bestCell?.supplierName ?? null,
      ]);
      c.suppliers.forEach((s, i) => {
        if (r.cells.get(s.invitationId)?.best) row.getCell(4 + i * 3).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFC6EFCE" } };
      });
    }
    ws.columns.forEach((col, i) => (col.width = i === 1 ? 36 : 14));
    ws.views = [{ state: "frozen", xSplit: 3, ySplit: 1 }];
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ---------- Adjudicación ----------
import { prisma } from "../db";
import { evaluateMatrix, familySummary, matrixInclude, type FullMatrix } from "../torre";
import { SCALES, scaleLabel } from "../evaluation";
import { scenarioMetrics } from "../allocation";

export async function awardWorkbook(ev: FullEvent): Promise<Buffer> {
  const a = await prisma.award.findFirst({ where: { eventId: ev.id }, orderBy: { createdAt: "desc" }, include: { lines: { include: { item: true, bidLine: true } } } });
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Adjudicación");
  ws.addRow([`${ev.company.name} – Adjudicación ${ev.code} – ${ev.title}`]).font = { bold: true, size: 13 };
  ws.addRow([`Estado: ${a?.status ?? "—"}  ·  Aprobada por: ${a?.approvedBy ?? "—"}  ·  ${a?.approvedAt?.toISOString().slice(0, 10) ?? ""}`]);
  ws.addRow([`Incoterm: ${ev.incoterm ?? ""} · Destino: ${ev.destination ?? ""} ${ev.port ?? ""} · Días libres: ${ev.freeDays ?? ""}`]);
  ws.addRow([]);
  styleHeader(ws.addRow(["Proveedor", "Código G", "Descripción", "TM adjudicadas", "Plazo", "USD/TM", "Total USD", "Molino", "Origen", "Comentarios / excepciones"]));
  const byId = new Map(ev.invitations.map((i) => [i.supplierId, i.supplier.name]));
  for (const l of [...(a?.lines ?? [])].sort((x, y) => (byId.get(x.supplierId) ?? "").localeCompare(byId.get(y.supplierId) ?? ""))) {
    const v = (l.bidLine?.values ?? {}) as Record<string, unknown>;
    ws.addRow([byId.get(l.supplierId) ?? l.supplierId, l.item.gCode, l.item.description, l.tons, termLabel(l.termDays), l.unitPrice, l.tons * l.unitPrice, [v.mill1, v.mill2, v.mill3].filter(Boolean).join(", "), v.origin ?? "", v.comments ?? ""]);
  }
  ws.columns.forEach((c, i) => (c.width = [30, 12, 36, 14, 14, 12, 16, 20, 14, 40][i] ?? 14));
  if (ev.conditions) {
    const cs = wb.addWorksheet("Condiciones");
    cs.getColumn(1).width = 120;
    ev.conditions.split("\n").forEach((l, i) => (cs.getCell(i + 1, 1).value = l));
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ---------- Matriz de evaluación (mismo orden de columnas que el Cuadro comparativo) ----------
function addMatrixSheet(wb: ExcelJS.Workbook, m: FullMatrix) {
  const { p, rows } = evaluateMatrix(m);
  const ws = wb.addWorksheet(m.name.replace(/[\\/*?:[\]]/g, " ").slice(0, 31));
  ws.addRow(["MATRIZ DE EVALUACIÓN DE OFERTAS"]).font = { bold: true, size: 13 };
  ws.addRow([`Negociación: ${m.name}`, `Negociador: ${m.negotiator ?? ""}`, `Fecha: ${p.date}`, `TM requeridas: ${p.requiredTons}`]);
  ws.addRow([`Precio CIF objetivo: ${p.targetCif}`, `PEX: ${p.pexPrice}`, `Internación: ${p.internacion}`, `Tasa: ${p.interestRate}`, `Tránsito/Fondeo/EM: ${p.transitDays}/${p.anchorageDays}/${p.emDays}`, `SBB: ${p.sbbIndex} + flete ${p.sbbFreight} + DAI ${p.dai}`]);
  ws.addRow([]);
  styleHeader(
    ws.addRow([
      "Proveedor", "Molino", "Moneda", "Precio FOB", "Flete", "Seguro", "Precio CIF contado", "Precio crédito", "Precio con crédito", "Internación", "Surveyor", "Precio en planta", "Merma", "TM total", "Días crédito", "Tasa interés", "Condiciones anticipo", "Factor días", "Términos de pago", "Reclamos $/tm", "Aumento costo capital", "Precio transformado", "Total SBB", "Spread", "Incoterm", "Embarque", "Lead time", "ETA planta", "Origen",
      "Precio", "Términos pago", "Términos entrega", "Riesgo legal", "", "Alianzas", "", "Penalizaciones", "", "Total VEC", "Evaluación proveedor", "", "Especificaciones", "", "Reclamos", "", "Total VTF", "Total", "Brechas del proveedor",
    ]),
  );
  for (const { o, r } of rows) {
    ws.addRow([
      o.supplierName, o.mill, o.currency, o.fob, o.freight, o.insurance, o.cif, o.creditSurcharge, r.priceWithCredit, r.internacion, r.surveyor, r.plantPrice, o.merma, o.tons, o.creditDays, r.impliedRate, o.advanceConditions, r.factorDays, r.paymentAdj, r.claimsPerTon, r.capitalCost, r.transformedPrice, r.totalSbb, r.spread, o.incoterm, o.shipmentDate?.toISOString().slice(0, 10), r.leadTime, r.etaPlant?.toISOString().slice(0, 10), o.origin,
      r.scores.price, r.scores.payment, r.scores.delivery, scaleLabel("legal", o.legalRisk), r.scores.legal, scaleLabel("alliance", o.alliance), r.scores.alliance, scaleLabel("penalty", o.penalty), r.scores.penalty, r.scores.vec, o.supplierScore, r.scores.supplierEval, scaleLabel("specs", o.specs), r.scores.specs, scaleLabel("claims", o.claims), r.scores.claims, r.scores.vtf, r.scores.total, o.gaps,
    ]);
  }
  const pctCols = [16, 24, 30, 31, 32, 34, 36, 38, 39, 41, 43, 45, 46, 47];
  pctCols.forEach((c) => (ws.getColumn(c).numFmt = "0.0%"));
  [4, 5, 6, 7, 8, 9, 10, 11, 12, 19, 20, 21, 22, 23].forEach((c) => (ws.getColumn(c).numFmt = "#,##0.00"));
  ws.columns.forEach((c, i) => (c.width = i === 0 ? 30 : i === 47 ? 50 : 12));
  ws.views = [{ state: "frozen", xSplit: 1, ySplit: 5 }];
  if (m.scenarios.length) {
    ws.addRow([]);
    ws.addRow(["ESCENARIOS DE SPLIT"]).font = { bold: true };
    styleHeader(ws.addRow(["Escenario", "Proveedor", "SKU", "Plazo", "TM", "Precio", "Ajuste", "Total"]));
    for (const s of m.scenarios) {
      const mt = scenarioMetrics(s.lines);
      for (const l of s.lines) ws.addRow([s.name, l.supplierName, l.itemLabel, l.termDays, l.tons, l.unitPrice, l.priceAdjust, l.tons * (l.unitPrice + l.priceAdjust)]);
      const r = ws.addRow([`${s.name}${s.approved ? " (APROBADO)" : ""}`, "TOTAL", "", "", mt.tons, mt.weighted, "", mt.total]);
      r.font = { bold: true };
    }
  }
  const sc = wb.getWorksheet("Nomenclatura") ?? wb.addWorksheet("Nomenclatura");
  if (sc.rowCount === 0) {
    for (const [k, title] of [["specs", "Especificaciones técnicas y calidad"], ["claims", "Reclamos"], ["penalty", "Penalizaciones comerciales"], ["alliance", "Alianzas estratégicas"], ["legal", "Riesgo legal"]] as const) {
      sc.addRow([title, "Nota equivalente"]).font = { bold: true };
      for (const e of SCALES[k]) sc.addRow([e.labelEs, e.value]);
      sc.addRow([]);
    }
    sc.getColumn(1).width = 45;
  }
}

export async function matrixWorkbook(id: string): Promise<Buffer> {
  const m = await prisma.evaluationMatrix.findUniqueOrThrow({ where: { id }, include: matrixInclude });
  const wb = new ExcelJS.Workbook();
  addMatrixSheet(wb, m);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function sessionWorkbook(id: string): Promise<Buffer> {
  const s = await prisma.committeeSession.findUniqueOrThrow({ where: { id }, include: { matrices: { include: matrixInclude } } });
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("RESUMEN");
  ws.addRow([`${s.name} – ${s.date.toISOString().slice(0, 10)}`]).font = { bold: true, size: 13 };
  ws.addRow([]);
  styleHeader(ws.addRow(["Grupo", "Familia", "Tons proyectadas", "Proveedor", "Precio puesto en planta", "Precio PEX", "Spread proyectado", "Precio FOB", "Flete", "Seguro", "Precio CIF", "Financiamiento", "Días crédito", "ETD", "ETA planta", "Total (miles)", "Spread meta", "Tons solicitadas", "Calidad", "Riesgo legal", "Dif vs PEX", "Internación", "Total SBB", "Precio anterior", "Extra anterior"]));
  for (const m of s.matrices) {
    const x = familySummary(m);
    ws.addRow([m.group, m.family, x.tonsProjected, x.selected, x.plantPrice, x.pex, x.spread, x.option?.fob, x.option?.freight, x.option?.insurance, x.option?.cif, x.option?.creditSurcharge, x.termDays.join(", "), x.option?.shipmentDate?.toISOString().slice(0, 10), x.eval?.etaPlant?.toISOString().slice(0, 10), x.total !== null ? x.total / 1000 : null, x.spreadGoal, x.tonsRequired, scaleLabel("specs", x.option?.specs), scaleLabel("legal", x.option?.legalRisk), x.difVsPex, x.eval?.internacion, x.eval?.totalSbb, m.prevPrice, m.prevExtra]);
  }
  [7, 17].forEach((c) => (ws.getColumn(c).numFmt = "0.0%"));
  ws.columns.forEach((c, i) => (c.width = i === 3 ? 30 : 13));
  for (const m of s.matrices) addMatrixSheet(wb, m);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
