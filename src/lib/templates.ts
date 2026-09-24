// Definición de plantillas de licitación (categorías de materia prima).
export type Section = "SKU_SPEC" | "OFFER_TECH" | "OFFER_COMPLIANCE" | "OFFER_TERMS";
export type FType = "NUMBER" | "TEXT" | "OKNO" | "SELECT" | "DATE";

export interface FieldDef {
  key: string;
  labelEs: string;
  labelEn: string;
  section: Section;
  type: FType;
  unit?: string | null;
  required?: boolean;
  options?: string[] | null;
  aliases?: string[] | null;
  order?: number;
}

export interface PriceComponent {
  key: string;
  labelEs: string;
  labelEn: string;
  aliases?: string[];
}

export interface DocReq {
  key: string;
  labelEs: string;
  labelEn: string;
}

export interface TemplateDef {
  name: string;
  category: string;
  description?: string;
  baseLabel: string;
  priceComponents: PriceComponent[];
  financingTerms: number[];
  containerTons?: number | null;
  requiredDocs: DocReq[];
  fields: FieldDef[];
}

const mm = (key: string, es: string, en: string, order: number): FieldDef => ({
  key,
  labelEs: es,
  labelEn: en,
  section: "SKU_SPEC",
  type: "NUMBER",
  unit: "mm",
  order,
  aliases: [`${es}, mm`],
});

const ok = (key: string, es: string, en: string, order: number): FieldDef => ({
  key,
  labelEs: es,
  labelEn: en,
  section: "OFFER_COMPLIANCE",
  type: "OKNO",
  required: true,
  order,
  aliases: [en],
});

export const PERFILES_TEMPLATE: TemplateDef = {
  name: "Aceros largos – Perfiles / Merchant Bars",
  category: "Aceros largos",
  description: "Angulares, platinas y redondos. Réplica del formato Offer RFQ – LONG Steel Products.",
  baseLabel: "CIF",
  priceComponents: [
    { key: "fob", labelEs: "Precio FOB contado", labelEn: "Price FOB cash", aliases: ["price fob"] },
    { key: "freight", labelEs: "Flete", labelEn: "Freight", aliases: ["price freigh"] },
    { key: "insurance", labelEs: "Seguro", labelEn: "Insurance", aliases: ["price insurance"] },
  ],
  financingTerms: [35, 60, 90, 120],
  containerTons: 24.5,
  requiredDocs: [
    { key: "tc", labelEs: "Terms and conditions firmado", labelEn: "Signed Terms and Conditions" },
    { key: "logistics", labelEs: "Anexo de términos logísticos firmado (Word)", labelEn: "Signed logistics terms annex (Word)" },
    { key: "mill", labelEs: "Protocolo del/los molino(s)", labelEn: "Mill protocol(s)" },
  ],
  fields: [
    mm("widthMin", "Ancho mínimo", "Min width", 1),
    mm("widthNom", "Ancho nominal", "Nominal width", 2),
    mm("widthMax", "Ancho máximo", "Max width", 3),
    mm("thickMin", "Espesor mínimo", "Min thickness", 4),
    mm("thickNom", "Espesor nominal", "Nominal thickness", 5),
    mm("thickMax", "Espesor máximo", "Max thickness", 6),
    mm("diamMin", "Diámetro mínimo", "Min diameter", 7),
    mm("diamNom", "Diámetro nominal", "Nominal diameter", 8),
    mm("diamMax", "Diámetro máximo", "Max diameter", 9),
    mm("ovalMax", "Ovalidad máxima", "Max ovality", 10),
    { key: "producer", labelEs: "Proveedor", labelEn: "Producer", section: "OFFER_TECH", type: "TEXT", order: 20 },
    { key: "mill1", labelEs: "Molino 1", labelEn: "Mill 1", section: "OFFER_TECH", type: "TEXT", order: 21, aliases: ["1"] },
    { key: "mill2", labelEs: "Molino 2", labelEn: "Mill 2", section: "OFFER_TECH", type: "TEXT", order: 22, aliases: ["2"] },
    { key: "mill3", labelEs: "Molino 3", labelEn: "Mill 3", section: "OFFER_TECH", type: "TEXT", order: 23, aliases: ["3"] },
    ok("dimensional", "Dimensional", "Dimensional", 30),
    ok("straightness", "Rectitud", "Straightness", 31),
    ok("tensile", "Requisitos de tensión", "Tensile requirements", 32),
    ok("chemistry", "Química", "Chemistry", 33),
    ok("surface", "Calidad superficial", "Superficial quality", 34),
    { key: "comments", labelEs: "Comentarios", labelEn: "Comments", section: "OFFER_COMPLIANCE", type: "TEXT", order: 35 },
    { key: "paymentTerms", labelEs: "Términos de pago", labelEn: "Payment terms", section: "OFFER_TERMS", type: "TEXT", order: 40 },
    { key: "origin", labelEs: "Origen", labelEn: "Origin", section: "OFFER_TERMS", type: "TEXT", order: 41, aliases: ["origin / origen"] },
    { key: "incoterm", labelEs: "Incoterm", labelEn: "Incoterm", section: "OFFER_TERMS", type: "TEXT", order: 42 },
    { key: "validity", labelEs: "Vigencia de precios", labelEn: "Price validity", section: "OFFER_TERMS", type: "TEXT", order: 43 },
  ],
};

export function sectionFields(fields: FieldDef[], section: Section): FieldDef[] {
  return fields.filter((f) => f.section === section).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

/** Convierte un registro Prisma Template (+fields) a TemplateDef. */
export function toTemplateDef(t: {
  name: string;
  category: string;
  description?: string | null;
  baseLabel: string;
  priceComponents: unknown;
  financingTerms: unknown;
  containerTons?: number | null;
  requiredDocs: unknown;
  fields: {
    key: string;
    labelEs: string;
    labelEn: string;
    section: string;
    type: string;
    unit?: string | null;
    required: boolean;
    options?: unknown;
    aliases?: unknown;
    order: number;
  }[];
}): TemplateDef {
  return {
    name: t.name,
    category: t.category,
    description: t.description ?? undefined,
    baseLabel: t.baseLabel,
    priceComponents: (t.priceComponents as PriceComponent[]) ?? [],
    financingTerms: ((t.financingTerms as number[]) ?? []).map(Number).sort((a, b) => a - b),
    containerTons: t.containerTons,
    requiredDocs: (t.requiredDocs as DocReq[]) ?? [],
    fields: t.fields
      .map((f) => ({
        key: f.key,
        labelEs: f.labelEs,
        labelEn: f.labelEn,
        section: f.section as Section,
        type: f.type as FType,
        unit: f.unit,
        required: f.required,
        options: (f.options as string[] | null) ?? null,
        aliases: (f.aliases as string[] | null) ?? null,
        order: f.order,
      }))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
  };
}

export function label(f: { labelEs: string; labelEn: string }, locale: string): string {
  return locale === "en" ? f.labelEn : f.labelEs;
}
