// Demo: botón "Simular ofertas de prueba" → cierre → comparativo → matriz → propuesta.
import { test, expect } from "@playwright/test";

test("simular ofertas y ver cálculos", async ({ page }) => {
  await page.goto("/login");
  await page.fill("#email", "compras@grupoag.local");
  await page.fill("#password", process.env.SEED_PASSWORD || "cambiar123");
  await page.click("button[type=submit]");
  await expect(page.getByRole("heading", { name: "Inicio" })).toBeVisible();
  await page.goto("/events");
  await page.getByRole("link", { name: "RFQ-DEMO-PERFILES" }).click();
  await page.waitForURL(/\/events\/[a-z0-9]{20,}/);
  // Trabajar sobre una copia para no depender del estado del evento demo
  const original = page.url();
  await page.getByRole("button", { name: "Duplicar" }).click();
  await page.waitForURL((u) => u.toString() !== original && /\/events\/[a-z0-9]{20,}$/.test(u.pathname));
  await page.getByRole("button", { name: /Simular ofertas de prueba/ }).click();
  await expect(page.getByText(/ofertas simuladas recibidas/)).toBeVisible();
  await page.getByRole("button", { name: "Cerrar ahora" }).click();
  await expect(page.getByText("Resumen por proveedor")).toBeVisible();
  await expect(page.locator("text=Proveedor Demo China").first()).toBeVisible();
  await expect(page.locator("td.bg-green-100").first()).toBeVisible();
  await page.getByRole("button", { name: "Crear matriz de evaluación →" }).click();
  await expect(page.getByText("Matriz de evaluación de ofertas").first()).toBeVisible();
  await page.getByRole("button", { name: "Crear", exact: true }).click();
  await expect(page.getByText("Escenario creado")).toBeVisible();
});
