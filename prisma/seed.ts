import { PrismaClient, type Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import fs from "node:fs";
import path from "node:path";
import { PERFILES_TEMPLATE, type TemplateDef } from "../src/lib/templates";

const prisma = new PrismaClient();

const PLANOS_TEMPLATE: TemplateDef = {
  name: "Aceros planos – Bobinas (HRC/CRC/GCRC/AZC)",
  category: "Aceros planos",
  description: "Bobinas laminadas en caliente, en frío, galvanizadas y aluzinc.",
  baseLabel: "CIF",
  priceComponents: [
    { key: "fob", labelEs: "Precio FOB contado", labelEn: "Price FOB cash" },
    { key: "freight", labelEs: "Flete", labelEn: "Freight" },
    { key: "insurance", labelEs: "Seguro", labelEn: "Insurance" },
  ],
  financingTerms: [30, 60, 90, 120],
  containerTons: null,
  requiredDocs: [
    { key: "tc", labelEs: "Terms and conditions firmado", labelEn: "Signed Terms and Conditions" },
    { key: "mill", labelEs: "Protocolo / certificado del molino", labelEn: "Mill certificate" },
  ],
  fields: [
    { key: "thickness", labelEs: "Espesor", labelEn: "Thickness", section: "SKU_SPEC", type: "NUMBER", unit: "mm", order: 1 },
    { key: "width", labelEs: "Ancho", labelEn: "Width", section: "SKU_SPEC", type: "NUMBER", unit: "mm", order: 2 },
    { key: "grade", labelEs: "Grado", labelEn: "Grade", section: "SKU_SPEC", type: "TEXT", order: 3 },
    { key: "coating", labelEs: "Recubrimiento", labelEn: "Coating", section: "SKU_SPEC", type: "TEXT", order: 4 },
    { key: "coilId", labelEs: "Diámetro interno", labelEn: "Coil ID", section: "SKU_SPEC", type: "TEXT", unit: "mm", order: 5 },
    { key: "coilWeight", labelEs: "Peso máx. bobina", labelEn: "Max coil weight", section: "SKU_SPEC", type: "NUMBER", unit: "TM", order: 6 },
    { key: "mill1", labelEs: "Molino", labelEn: "Mill", section: "OFFER_TECH", type: "TEXT", order: 20 },
    { key: "moq", labelEs: "MOQ", labelEn: "MOQ", section: "OFFER_TECH", type: "NUMBER", unit: "TM", order: 21 },
    { key: "shipment", labelEs: "Fecha de embarque", labelEn: "Shipment date", section: "OFFER_TECH", type: "DATE", order: 22 },
    { key: "dimensional", labelEs: "Dimensional", labelEn: "Dimensional", section: "OFFER_COMPLIANCE", type: "OKNO", required: true, order: 30 },
    { key: "chemistry", labelEs: "Química", labelEn: "Chemistry", section: "OFFER_COMPLIANCE", type: "OKNO", required: true, order: 31 },
    { key: "mechanical", labelEs: "Propiedades mecánicas", labelEn: "Mechanical properties", section: "OFFER_COMPLIANCE", type: "OKNO", required: true, order: 32 },
    { key: "comments", labelEs: "Comentarios", labelEn: "Comments", section: "OFFER_COMPLIANCE", type: "TEXT", order: 33 },
    { key: "paymentTerms", labelEs: "Términos de pago", labelEn: "Payment terms", section: "OFFER_TERMS", type: "TEXT", order: 40 },
    { key: "origin", labelEs: "Origen", labelEn: "Origin", section: "OFFER_TERMS", type: "TEXT", order: 41 },
    { key: "incoterm", labelEs: "Incoterm", labelEn: "Incoterm", section: "OFFER_TERMS", type: "TEXT", order: 42 },
    { key: "validity", labelEs: "Vigencia de precios", labelEn: "Price validity", section: "OFFER_TERMS", type: "TEXT", order: 43 },
  ],
};

async function upsertTemplate(t: TemplateDef) {
  const tpl = await prisma.template.upsert({
    where: { name: t.name },
    update: {},
    create: {
      name: t.name,
      category: t.category,
      description: t.description,
      baseLabel: t.baseLabel,
      priceComponents: t.priceComponents as unknown as Prisma.InputJsonValue,
      financingTerms: t.financingTerms,
      containerTons: t.containerTons ?? null,
      requiredDocs: t.requiredDocs as unknown as Prisma.InputJsonValue,
      fields: {
        create: t.fields.map((f) => ({
          key: f.key,
          labelEs: f.labelEs,
          labelEn: f.labelEn,
          section: f.section,
          type: f.type,
          unit: f.unit ?? null,
          required: f.required ?? false,
          options: (f.options ?? undefined) as Prisma.InputJsonValue | undefined,
          aliases: (f.aliases ?? undefined) as Prisma.InputJsonValue | undefined,
          order: f.order ?? 0,
        })),
      },
    },
  });
  return tpl;
}

const EMAIL_INTRO = `Adjunto solicitud de cotización de lote de perfiles especiales, estos son extras a los del comité de compras.
En el adjunto encontrarán una tabla de medidas específicas por cada SKU, sobre esas medidas deben cotizar por favor.`;

const CONDITIONS = `Requisitos para envío/operación de tarifas:
- Llenar el formato Excel (desglosar las tarifas según indica el formato).
- Llenar debidamente el Excel con lo que cumplen y no cumplen en cuanto a temas físicos y químicos de los materiales, usando como base el documento "Especificación de material".
- Leer, llenar y firmar el formato "Terms and conditions" + el Word con términos y condiciones logísticas (anexo al contrato).
- Compartir protocolo del y/o los molinos de los que oferta junto con la tarifa.
- Cotizar el material según Especificación de Material adjunta.
Surveyor: este material no requiere de surveyor en origen.
Aspectos legales: las especificaciones técnicas proporcionadas + los protocolos + las excepciones negociadas + embalaje + estiba + descarga + Terms & Conditions formarán parte de los contratos en caso de adjudicación, ya sea integrándolas directamente en el contrato o anexando una copia de este Excel.
Aspectos logísticos: cotizar CIF CY entrando por Puerto Quetzal a Guatemala. La carga debe ser embarcada exclusivamente en contenedores de 20 pies. Considerar 21 días libres de demoras y almacenajes en destino.`;

async function main() {
  const company = await prisma.company.upsert({ where: { name: "Aceros de Guatemala, S.A." }, update: {}, create: { name: "Aceros de Guatemala, S.A." } });
  const pw = await bcrypt.hash(process.env.SEED_PASSWORD || "cambiar123", 10);
  const users = [
    { email: "admin@grupoag.local", name: "Administrador", role: "ADMIN" as const },
    { email: "compras@grupoag.local", name: "Comprador", role: "BUYER" as const },
    { email: "torre@grupoag.local", name: "Torre de Compras", role: "COMMITTEE" as const },
  ];
  for (const u of users) await prisma.user.upsert({ where: { email: u.email }, update: {}, create: { ...u, passwordHash: pw, companyId: company.id } });

  const perfiles = await upsertTemplate(PERFILES_TEMPLATE);
  await upsertTemplate(PLANOS_TEMPLATE);

  const suppliers = [
    { code: "DEMO-001", name: "Proveedor Demo Turquía", country: "Turquía", locale: "en", email: "ventas@proveedor-tr.example" },
    { code: "DEMO-002", name: "Proveedor Demo México", country: "México", locale: "es", email: "ventas@proveedor-mx.example" },
    { code: "DEMO-003", name: "Proveedor Demo China", country: "China", locale: "en", email: "sales@proveedor-cn.example" },
  ];
  const created = [];
  for (const s of suppliers) {
    const sup = await prisma.supplier.upsert({
      where: { code: s.code },
      update: {},
      create: { code: s.code, name: s.name, country: s.country, locale: s.locale, contacts: { create: [{ email: s.email, name: "Ventas" }] } },
    });
    created.push(sup);
  }

  const code = "RFQ-DEMO-PERFILES";
  if (!(await prisma.event.findUnique({ where: { code } }))) {
    const skus = JSON.parse(fs.readFileSync(path.join(__dirname, "perfiles-skus.json"), "utf8")) as { g: string; d: string; q: number; s: Record<string, unknown> }[];
    const deadline = new Date(Date.now() + 7 * 86400000);
    deadline.setUTCHours(18, 0, 0, 0);
    await prisma.event.create({
      data: {
        code,
        title: "Perfiles especiales – Merchant Bars (demo)",
        family: "Perfiles",
        material: "Perfiles / Steel Bars and Angles",
        companyId: company.id,
        templateId: perfiles.id,
        deadline,
        committeeDate: new Date(deadline.getTime() + 2 * 86400000),
        priceValidity: new Date(deadline.getTime() + 2 * 86400000),
        shipmentDate: new Date(deadline.getTime() + 30 * 86400000),
        etaDays: 35,
        incoterm: "CIF CY",
        destination: "Planta SIDEGUA",
        port: "Puerto Quetzal",
        freeDays: 21,
        containerTons: 24.5,
        surveyor: "No requiere surveyor en origen",
        introEs: EMAIL_INTRO,
        introEn: "Please find attached a request for quotation for a lot of special merchant bars. Quote on the specific dimensions listed for each SKU.",
        conditions: CONDITIONS,
        items: { create: skus.map((s, i) => ({ gCode: s.g, description: s.d, quantity: s.q, specs: s.s as Prisma.InputJsonValue, order: i })) },
        invitations: { create: created.map((s, i) => ({ supplierId: s.id, tokenHash: `seed-${code}-${i}` })) },
      },
    });
  }
  console.log("Seed OK – usuarios: admin@grupoag.local / compras@grupoag.local / torre@grupoag.local (clave: SEED_PASSWORD o 'cambiar123')");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
