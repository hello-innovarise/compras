// Almacenamiento de adjuntos en disco local (volumen Docker). Interfaz simple para cambiar a S3/SharePoint.
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = () => path.resolve(process.env.UPLOAD_DIR || "./data/uploads");

export async function saveFile(folder: string, file: File): Promise<{ path: string; size: number; mime: string; name: string }> {
  const buf = Buffer.from(await file.arrayBuffer());
  const safe = file.name.replace(/[^\w.\- ]+/g, "_").slice(-120);
  const rel = path.join(folder, `${crypto.randomBytes(6).toString("hex")}-${safe}`);
  const abs = path.join(root(), rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, buf);
  return { path: rel, size: buf.length, mime: file.type || "application/octet-stream", name: file.name };
}

export async function readFile(rel: string): Promise<Buffer> {
  const abs = path.resolve(root(), rel);
  if (!abs.startsWith(root())) throw new Error("Ruta inválida");
  return fs.readFile(abs);
}

export async function removeFile(rel: string) {
  try {
    await fs.unlink(path.resolve(root(), rel));
  } catch {
    /* ignore */
  }
}
