// Flujo completo: publicar → ofertas (web y Excel) → cierre → comparativo → ronda 2 → matriz → escenario → adjudicación.
// Requiere la base sembrada (npm run db:seed) y la app corriendo.
import { test, expect, type Page } from "@playwright/test";
import ExcelJS from "exceljs";

const PASS = process.env.SEED_PASSWORD || "cambiar123";

async function login(page: Page) {
  await page.goto("/login");
  await page.fill("#email", "compras@grupoag.local");
  await page.fill("#password", PASS);
  await page.click("button[type=submit]");
  await expect(page.getByRole("heading", { name: "Inicio" })).toBeVisible();
}

async function portalLink(page: Page, eventUrl: string, supplier: string) {
  await page.goto(`${eventUrl}?tab=suppliers`);
  const row = page.locator("tr", { hasText: supplier });
  await row.getByRole("button", { name: "Obtener enlace" }).click();
  const code = page.locator("code.select-all");
  await expect(code).toBeVisible();
  const txt = (await code.textContent())!;
  return txt.slice(txt.indexOf("/portal/"));
}

async function fillWebLines(page: Page, n: number, fob: number) {
  const rows = page.locator("main table").last().locator("tbody tr");
  for (let i = 0; i < n; i++) {
    const r = rows.nth(i);
    const inputs = r.locator("input.input-cell");
    const qty = await r.locator("td").nth(2).textContent();
    await inputs.nth(0).fill(qty!.replace(/,/g, ""));
    await inputs.nth(1).fill("ACERÍA X");
    await inputs.nth(2).fill("MILL-X");
    const selects = r.locator("select");
    for (let s = 0; s < 5; s++) await selects.nth(s).selectOption(i === 1 && s === 0 ? "NO" : "OK");
    await inputs.nth(6).fill(String(fob + i));
    await inputs.nth(7).fill("100");
    await inputs.nth(8).fill("5");
    await inputs.nth(9).fill("5");
    await inputs.nth(10).fill("15");
    await inputs.nth(11).fill("28");
    await inputs.nth(12).fill("40");
  }
}

test("licitación de perfiles de punta a punta", async ({ page, request, baseURL }) => {
  await login(page);
  await page.goto("/events");
  await page.getByRole("link", { name: "RFQ-DEMO-PERFILES" }).click();
  await page.waitForURL(/\/events\/[a-z0-9]{20,}/);
  const eventUrl = new URL(page.url()).pathname;

  // Publicar
  await page.getByRole("button", { name: "Publicar y enviar invitaciones" }).click();
  await expect(page.getByText("Licitación publicada")).toBeVisible();

  // Proveedor 1: web
  const link1 = await portalLink(page, eventUrl, "Proveedor Demo Turquía");
  await page.goto(link1);
  await expect(page.getByText("Quotation portal")).toBeVisible();
  await page.getByPlaceholder("Applies to all lines").first().fill("DEFERRED AFTER BL DATE");
  await fillWebLines(page, 5, 680);
  await page.getByRole("button", { name: "Submit offer" }).click();
  await expect(page.getByText("Offer submitted!")).toBeVisible();

  // Proveedor 2: Excel pre-llenado, llenado y subido
  await login(page);
  const link2 = await portalLink(page, eventUrl, "Proveedor Demo México");
  const token2 = link2.split("/portal/")[1];
  const xl = await request.get(`${baseURL}/api/portal/${token2}/excel`);
  expect(xl.ok()).toBeTruthy();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await xl.body()) as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  const header = ws.getRow(16);
  const col = (prefix: string) => {
    let c = 0;
    header.eachCell((cell, n) => {
      if (!c && String(cell.value).toLowerCase().startsWith(prefix.toLowerCase())) c = n;
    });
    return c;
  };
  const cQty = col("Cantidad ofertada");
  const cFob = col("Precio FOB");
  const cFr = col("Flete");
  const cIns = col("Seguro");
  const c35 = col("35 DÍAS");
  const c60 = col("60 DÍAS");
  const cDim = col("Dimensional");
  for (let r = 17; r < 47; r++) {
    const row = ws.getRow(r);
    row.getCell(cQty).value = Number(row.getCell(5).value);
    row.getCell(cFob).value = 675 + (r % 3) * 10;
    row.getCell(cFr).value = 105;
    row.getCell(cIns).value = 5;
    row.getCell(c35).value = 6;
    row.getCell(c60).value = 14;
    for (let k = 0; k < 5; k++) row.getCell(cDim + k).value = "OK";
  }
  const filled = Buffer.from(await wb.xlsx.writeBuffer());
  await page.goto(link2);
  await page.setInputFiles("input[name=file][accept='.xlsx']", { name: "oferta.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: filled });
  await page.getByRole("button", { name: /Subir Excel lleno/ }).click();
  await expect(page.getByText(/Excel OK – 30 SKUs/)).toBeVisible();
  await page.getByRole("button", { name: "Enviar oferta" }).click();
  await expect(page.getByText("¡Oferta enviada!")).toBeVisible();

  // Proveedor 3: declina
  await login(page);
  const link3 = await portalLink(page, eventUrl, "Proveedor Demo China");
  await page.goto(link3);
  await page.getByRole("button", { name: "Decline to participate" }).click();
  await page.getByPlaceholder("Reason").fill("Sin capacidad");
  await page.getByRole("button", { name: "Decline to participate" }).click();
  await expect(page.getByText("Declined to participate")).toBeVisible();

  // Sellado → cerrar → comparativo
  await login(page);
  await page.goto(`${eventUrl}?tab=compare`);
  await expect(page.getByText("Ofertas selladas")).toBeVisible();
  await page.getByRole("button", { name: "Cerrar ahora" }).click();
  await expect(page.getByText("Resumen por proveedor")).toBeVisible();
  await expect(page.locator("td.bg-green-100").first()).toBeVisible();
  const cmp = await request.get(`${baseURL}/api/events/${eventUrl.split("/").pop()}/compare?round=1`, { headers: { cookie: (await page.context().cookies()).map((c) => `${c.name}=${c.value}`).join("; ") } });
  expect(cmp.headers()["content-type"]).toContain("spreadsheetml");

  // Ronda 2 solo con proveedor 1
  await page.goto(`${eventUrl}?tab=rounds`);
  await page.locator("label", { hasText: "Proveedor Demo México" }).locator("input").uncheck();
  const d = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 16);
  await page.fill("input[name=deadline][required]", d);
  await page.fill("textarea[name=note]", "Favor mejorar precio");
  await page.getByRole("button", { name: "Abrir ronda 2" }).click();
  await expect(page.getByText("Ronda 2 abierta")).toBeVisible();
  const link1b = await portalLink(page, eventUrl, "Proveedor Demo Turquía");
  await page.goto(link1b);
  await expect(page.getByText("Favor mejorar precio")).toBeVisible();
  const firstFob = page.locator("main table").last().locator("tbody tr").first().locator("input.input-cell").nth(6);
  await expect(firstFob).toHaveValue("680");
  await firstFob.fill("660");
  await page.getByRole("button", { name: "Submit offer" }).click();
  await expect(page.getByText("Offer submitted!")).toBeVisible();

  await login(page);
  await page.goto(eventUrl);
  await page.getByRole("button", { name: "Cerrar ahora" }).click();
  await expect(page.getByText("Licitación cerrada")).toBeVisible();
  await page.goto(`${eventUrl}?tab=compare&round=2&term=35`);
  await expect(page.getByRole("cell", { name: "770.00 80 TM" })).toBeVisible(); // 660+100+5+5

  // Matriz de evaluación → propuesta automática → aprobar
  await page.getByRole("button", { name: "Crear matriz de evaluación →" }).click();
  await expect(page.getByRole("heading", { name: /Perfiles – RFQ-DEMO-PERFILES/ })).toBeVisible();
  await expect(page.getByText("Matriz de evaluación de ofertas").first()).toBeVisible();
  await page.getByRole("button", { name: "Crear", exact: true }).click();
  await expect(page.getByText("Escenario creado")).toBeVisible();
  await page.getByRole("button", { name: "Aprobar (Torre)" }).first().click();
  await expect(page.getByText(/Se generó la adjudicación/)).toBeVisible();

  // Adjudicación
  await page.goto(`${eventUrl}/award`);
  await expect(page.getByText("Borrador")).toBeVisible();
  await page.getByRole("button", { name: "Aprobar adjudicación" }).click();
  await expect(page.getByText("Adjudicación aprobada")).toBeVisible();
  await page.getByRole("button", { name: "Notificar a proveedores" }).click();
  await expect(page.getByText(/Resultados notificados a 2 proveedores/)).toBeVisible();
});
