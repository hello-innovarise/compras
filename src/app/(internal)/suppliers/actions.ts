"use server";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { back, datef, numf, str } from "@/lib/forms";
import { norm } from "@/lib/excel/parse";
import { num } from "@/lib/pricing";

export async function createSupplier(fd: FormData) {
  const u = await requireUser(["BUYER"]);
  const emails = (str(fd, "emails") ?? "").split(/[,;\s]+/).filter((e) => e.includes("@"));
  const s = await prisma.supplier.create({
    data: { code: str(fd, "code"), name: str(fd, "name") ?? "Proveedor", country: str(fd, "country"), locale: str(fd, "locale") ?? "es", contacts: { create: emails.map((email) => ({ email })) } },
  });
  await audit(u.email, "supplier.created", "Supplier", s.id);
  back("/suppliers", "Proveedor creado");
}

export async function updateSupplier(id: string, fd: FormData) {
  const u = await requireUser(["BUYER"]);
  const emails = (str(fd, "emails") ?? "").split(/[,;\s]+/).filter((e) => e.includes("@"));
  await prisma.$transaction([
    prisma.supplier.update({ where: { id }, data: { code: str(fd, "code"), name: str(fd, "name") ?? undefined, country: str(fd, "country"), locale: str(fd, "locale") ?? "es", notes: str(fd, "notes"), active: fd.get("active") === "on" } }),
    prisma.supplierContact.deleteMany({ where: { supplierId: id } }),
    prisma.supplierContact.createMany({ data: emails.map((email) => ({ supplierId: id, email })) }),
  ]);
  await audit(u.email, "supplier.updated", "Supplier", id);
  back(`/suppliers/${id}`, "Proveedor actualizado");
}

export async function addIncident(id: string, fd: FormData) {
  const u = await requireUser(["BUYER"]);
  await prisma.supplierIncident.create({
    data: { supplierId: id, type: (str(fd, "type") as "CLAIM" | "PENALTY") ?? "CLAIM", impact: str(fd, "impact") ?? "LOW", date: datef(fd, "date") ?? new Date(), description: str(fd, "description"), amount: numf(fd, "amount") },
  });
  await audit(u.email, "supplier.incident", "Supplier", id);
  back(`/suppliers/${id}`, "Incidencia registrada");
}

export async function toggleIncident(supplierId: string, id: string) {
  await requireUser(["BUYER"]);
  const i = await prisma.supplierIncident.findUniqueOrThrow({ where: { id } });
  await prisma.supplierIncident.update({ where: { id }, data: { open: !i.open } });
  back(`/suppliers/${supplierId}`);
}

export async function addEvaluation(id: string, fd: FormData) {
  await requireUser(["BUYER"]);
  const year = numf(fd, "year");
  const semester = numf(fd, "semester");
  const score = numf(fd, "score");
  if (year && semester && score !== null)
    await prisma.supplierEvaluation.upsert({ where: { supplierId_year_semester: { supplierId: id, year, semester } }, update: { score }, create: { supplierId: id, year, semester, score } });
  back(`/suppliers/${id}`, "Evaluación guardada");
}

/**
 * Importa la hoja N.E.P (CODIGO, PROVEEDOR, columnas por año/semestre S1/S2, Sostenibilidad).
 * Estructura esperada (como el Cuadro comparativo): fila de años (2023, 2024…) sobre fila de encabezados (CODIGO, PROVEEDOR, S1, S2…).
 * También acepta formato plano: CODIGO | PROVEEDOR | AÑO | SEMESTRE | NOTA.
 */
export async function importNep(fd: FormData) {
  const u = await requireUser(["BUYER"]);
  const file = fd.get("file") as File | null;
  if (!file?.size) back("/suppliers", undefined, "Seleccione un archivo");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(await file.arrayBuffer()) as unknown as ArrayBuffer);
  const val = (c: ExcelJS.Cell) => {
    const v = c.value as unknown;
    return v && typeof v === "object" && "result" in (v as object) ? (v as { result: unknown }).result : v;
  };
  let created = 0;
  let scores = 0;
  const ws = wb.worksheets.find((w) => /n\.?e\.?p/i.test(w.name)) ?? wb.worksheets[0];
  let hr = 0;
  for (let r = 1; r <= Math.min(20, ws.rowCount); r++) {
    const cells: string[] = [];
    ws.getRow(r).eachCell((c) => cells.push(norm(val(c))));
    if (cells.includes("codigo")) {
      hr = r;
      break;
    }
  }
  if (!hr) back("/suppliers", undefined, "No se encontró la columna CODIGO");
  const headers = new Map<number, string>();
  ws.getRow(hr).eachCell((c, col) => headers.set(col, norm(val(c))));
  const colOf = (name: string) => [...headers.entries()].find(([, h]) => h === name || h.startsWith(name))?.[0];
  const cCode = colOf("codigo")!;
  const cName = colOf("proveedor");
  const cSust = colOf("sostenibilidad");
  const cYear = colOf("ano") ?? colOf("año") ?? colOf("year");
  const cSem = colOf("semestre");
  const cScore = colOf("nota") ?? colOf("score") ?? colOf("calificacion");
  // columnas S1/S2 con el año en la fila superior (celdas combinadas)
  const semCols: { col: number; year: number; sem: number }[] = [];
  let lastYear = 0;
  for (let col = 1; col <= ws.columnCount; col++) {
    const y = num(val(ws.getRow(hr - 1).getCell(col)));
    if (y && y > 2000 && y < 2100) lastYear = y;
    const h = headers.get(col) ?? "";
    const m = h.match(/^s([12])$/);
    if (m && lastYear) semCols.push({ col, year: lastYear, sem: Number(m[1]) });
  }
  for (let r = hr + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const code = String(val(row.getCell(cCode)) ?? "").trim().replace(/\.0+$/, "");
    if (!code) continue;
    const name = cName ? String(val(row.getCell(cName)) ?? "").trim() : code;
    let s = await prisma.supplier.findUnique({ where: { code } });
    if (!s) {
      s = await prisma.supplier.create({ data: { code, name: name || code } });
      created++;
    }
    const entries: { year: number; sem: number; score: number }[] = [];
    for (const sc of semCols) {
      const v = num(val(row.getCell(sc.col)));
      if (v !== null) entries.push({ year: sc.year, sem: sc.sem, score: v });
    }
    if (cYear && cSem && cScore) {
      const y = num(val(row.getCell(cYear)));
      const se = num(val(row.getCell(cSem)));
      const v = num(val(row.getCell(cScore)));
      if (y && se && v !== null) entries.push({ year: y, sem: se, score: v });
    }
    const sust = cSust ? /^s/i.test(String(val(row.getCell(cSust)) ?? "")) : undefined;
    for (const e of entries) {
      await prisma.supplierEvaluation.upsert({
        where: { supplierId_year_semester: { supplierId: s.id, year: e.year, semester: e.sem } },
        update: { score: e.score, sustainability: sust ?? null, importedAt: new Date() },
        create: { supplierId: s.id, year: e.year, semester: e.sem, score: e.score, sustainability: sust ?? null },
      });
      scores++;
    }
  }
  await audit(u.email, "nep.imported", "Supplier", null, { created, scores });
  back("/suppliers", `N.E.P importado: ${scores} notas, ${created} proveedores nuevos`);
}
