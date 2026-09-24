// Envío de correos por SMTP (buzón del grupo). Si SMTP_HOST no está configurado, solo se registra.
import nodemailer from "nodemailer";
import { prisma } from "./db";

let transporter: nodemailer.Transporter | null = null;
function tx() {
  if (!process.env.SMTP_HOST) return null;
  transporter ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  return transporter;
}

export interface MailInput {
  to: string[];
  subject: string;
  html: string;
  kind: string;
  eventId?: string;
  attachments?: { filename: string; content: Buffer }[];
}

export async function sendMail(m: MailInput): Promise<boolean> {
  const t = tx();
  let error: string | null = null;
  if (t && m.to.length) {
    try {
      await t.sendMail({ from: process.env.MAIL_FROM || "compras@localhost", to: m.to.join(","), subject: m.subject, html: m.html, attachments: m.attachments });
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  } else if (!t) {
    console.log(`[mail:${m.kind}] → ${m.to.join(", ")} | ${m.subject}`);
  }
  await prisma.emailLog.create({ data: { to: m.to.join(","), subject: m.subject, kind: m.kind, eventId: m.eventId, error } });
  return !error;
}

export function appUrl(p: string) {
  return `${(process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "")}${p}`;
}
