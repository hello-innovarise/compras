// Almacenamiento de adjuntos.
//  - STORAGE_DRIVER=disk (por defecto): carpeta UPLOAD_DIR (volumen Docker en el servidor interno).
//  - STORAGE_DRIVER=db: dentro de PostgreSQL (Vercel y entornos sin disco persistente).
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { prisma } from "./db";

const root = () => path.resolve(process.env.UPLOAD_DIR || "./data/uploads");
const storeInDb = () => process.env.STORAGE_DRIVER === "db" || (!!process.env.VERCEL && process.env.STORAGE_DRIVER !== "disk");
const DB_PREFIX = "db:";

export async function saveFile(folder: string, file: File): Promise<{ path: string; size: number; mime: string; name: string }> {
  const buf = Buffer.from(await file.arrayBuffer());
  const mime = file.type || "application/octet-stream";
  if (storeInDb()) {
    const f = await prisma.storedFile.create({ data: { name: file.name, mime, size: buf.length, data: buf } });
    return { path: `${DB_PREFIX}${f.id}`, size: buf.length, mime, name: file.name };
  }
  const safe = file.name.replace(/[^\w.\- ]+/g, "_").slice(-120);
  const rel = path.join(folder, `${crypto.randomBytes(6).toString("hex")}-${safe}`);
  const abs = path.join(root(), rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, buf);
  return { path: rel, size: buf.length, mime, name: file.name };
}

export async function readFile(rel: string): Promise<Buffer> {
  if (rel.startsWith(DB_PREFIX)) {
    const f = await prisma.storedFile.findUniqueOrThrow({ where: { id: rel.slice(DB_PREFIX.length) } });
    return Buffer.from(f.data);
  }
  const abs = path.resolve(root(), rel);
  if (!abs.startsWith(root())) throw new Error("Ruta inválida");
  return fs.readFile(abs);
}

export async function removeFile(rel: string) {
  try {
    if (rel.startsWith(DB_PREFIX)) await prisma.storedFile.delete({ where: { id: rel.slice(DB_PREFIX.length) } });
    else await fs.unlink(path.resolve(root(), rel));
  } catch {
    /* ignore */
  }
}
