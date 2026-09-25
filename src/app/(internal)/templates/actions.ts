"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import type { TemplateDef } from "@/lib/templates";

export async function saveTemplate(id: string | null, def: TemplateDef) {
  const u = await requireUser(["BUYER"]);
  const keys = def.fields.map((f) => f.key.trim());
  if (keys.some((k) => !/^[a-zA-Z][\w]*$/.test(k))) return { error: "Las claves deben ser alfanuméricas sin espacios" };
  if (new Set(keys).size !== keys.length) return { error: "Claves de campo duplicadas" };
  if (!def.priceComponents.length) return { error: "Defina al menos un componente de precio" };
  const data = {
    name: def.name,
    category: def.category,
    description: def.description ?? null,
    baseLabel: def.baseLabel,
    priceComponents: def.priceComponents as unknown as Prisma.InputJsonValue,
    financingTerms: def.financingTerms.map(Number).filter((n) => n > 0),
    containerTons: def.containerTons ?? null,
    requiredDocs: def.requiredDocs as unknown as Prisma.InputJsonValue,
  };
  const fields = def.fields.map((f, i) => ({
    key: f.key.trim(),
    labelEs: f.labelEs,
    labelEn: f.labelEn || f.labelEs,
    section: f.section,
    type: f.type,
    unit: f.unit || null,
    required: !!f.required,
    options: (f.options ?? undefined) as Prisma.InputJsonValue | undefined,
    aliases: (f.aliases ?? undefined) as Prisma.InputJsonValue | undefined,
    order: i,
  }));
  let tid = id;
  try {
    if (id) {
      const used = await prisma.event.count({ where: { templateId: id, status: { not: "DRAFT" } } });
      if (used) return { error: "Plantilla en uso por licitaciones publicadas: duplíquela para crear una nueva versión" };
      await prisma.$transaction([prisma.template.update({ where: { id }, data }), prisma.templateField.deleteMany({ where: { templateId: id } }), prisma.templateField.createMany({ data: fields.map((f) => ({ ...f, templateId: id })) })]);
    } else {
      const t = await prisma.template.create({ data: { ...data, fields: { create: fields } } });
      tid = t.id;
    }
  } catch (e) {
    return { error: String(e).includes("Unique") ? "Ya existe una plantilla con ese nombre" : String(e) };
  }
  await audit(u.email, "template.saved", "Template", tid);
  revalidatePath("/templates");
  return { ok: true, id: tid };
}

export async function duplicateTemplate(id: string) {
  await requireUser(["BUYER"]);
  const t = await prisma.template.findUniqueOrThrow({ where: { id }, include: { fields: true } });
  const copy = await prisma.template.create({
    data: {
      name: `${t.name} (copia ${new Date().toISOString().slice(0, 10)})`,
      category: t.category,
      description: t.description,
      baseLabel: t.baseLabel,
      priceComponents: t.priceComponents as Prisma.InputJsonValue,
      financingTerms: t.financingTerms as Prisma.InputJsonValue,
      containerTons: t.containerTons,
      requiredDocs: t.requiredDocs as Prisma.InputJsonValue,
      fields: { create: t.fields.map(({ id: _i, templateId: _t, options, aliases, ...f }) => ({ ...f, options: (options ?? undefined) as Prisma.InputJsonValue | undefined, aliases: (aliases ?? undefined) as Prisma.InputJsonValue | undefined })) },
    },
  });
  redirect(`/templates/${copy.id}`);
}
