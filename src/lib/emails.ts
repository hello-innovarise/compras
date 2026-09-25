// Plantillas de correo bilingües.
import { fmtDate } from "./i18n";

interface EvInfo {
  code: string;
  title: string;
  companyName: string;
  deadline: Date;
  timezone: string;
  introEs?: string | null;
  introEn?: string | null;
  conditions?: string | null;
  committeeDate?: Date | null;
}

const wrap = (body: string) =>
  `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2937;max-width:720px">${body}<hr style="margin-top:24px;border:none;border-top:1px solid #e5e7eb"/><p style="color:#6b7280;font-size:12px">Compras Grupo AG – mensaje automático / automated message</p></div>`;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const para = (s?: string | null) => (s ? esc(s).split("\n").map((l) => (l.trim() ? `<p style="margin:4px 0">${l}</p>` : "<br/>")).join("") : "");
const btn = (href: string, text: string) =>
  `<p style="margin:20px 0"><a href="${href}" style="background:#1f3864;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:bold">${text}</a></p>`;

export function invitationEmail(ev: EvInfo, supplierName: string, link: string, locale: string, round = 1) {
  const es = locale !== "en";
  const dl = fmtDate(ev.deadline, locale, ev.timezone, true);
  const subject = es
    ? `${round > 1 ? `Ronda ${round} – ` : ""}Solicitud de cotización ${ev.code}: ${ev.title}`
    : `${round > 1 ? `Round ${round} – ` : ""}Request for quotation ${ev.code}: ${ev.title}`;
  const html = wrap(
    `<p>${es ? "Estimados" : "Dear"} ${esc(supplierName)},</p>` +
      para(es ? ev.introEs : ev.introEn || ev.introEs) +
      `<p><b>${es ? "Fecha y hora límite" : "Deadline"}:</b> ${dl} (${ev.timezone})</p>` +
      (ev.committeeDate ? `<p><b>${es ? "Comité de compras" : "Purchasing committee"}:</b> ${fmtDate(ev.committeeDate, locale, ev.timezone)}</p>` : "") +
      btn(link, es ? "Abrir portal y cotizar" : "Open portal and quote") +
      `<p>${es ? "En el portal puede cotizar en línea o descargar el Excel pre-llenado y subirlo. Adjuntamos también el Excel." : "In the portal you can quote online or download the pre-filled Excel and upload it. The Excel is also attached."}</p>` +
      (ev.conditions ? `<h3>${es ? "Condiciones" : "Conditions"}</h3>${para(ev.conditions)}` : "") +
      `<p>${es ? "¡Mil gracias!" : "Thank you!"}</p><p>${esc(ev.companyName)}</p>`,
  );
  return { subject, html };
}

export function reminderEmail(ev: EvInfo, supplierName: string, link: string, locale: string, hours: number) {
  const es = locale !== "en";
  const subject = es ? `Recordatorio: ${ev.code} cierra en ${hours} h` : `Reminder: ${ev.code} closes in ${hours} h`;
  const html = wrap(
    `<p>${es ? "Estimados" : "Dear"} ${esc(supplierName)},</p><p>${
      es ? `Le recordamos que la licitación <b>${esc(ev.title)}</b> cierra el` : `This is a reminder that tender <b>${esc(ev.title)}</b> closes on`
    } ${fmtDate(ev.deadline, locale, ev.timezone, true)}.</p>` + btn(link, es ? "Cotizar ahora" : "Quote now"),
  );
  return { subject, html };
}

export function receiptEmail(ev: EvInfo, supplierName: string, link: string, locale: string, version: number) {
  const es = locale !== "en";
  const subject = es ? `Acuse de recibo – oferta ${ev.code} (v${version})` : `Receipt – offer ${ev.code} (v${version})`;
  const html = wrap(
    `<p>${es ? "Estimados" : "Dear"} ${esc(supplierName)},</p><p>${
      es ? "Hemos recibido su oferta. Puede modificarla hasta la fecha límite:" : "We have received your offer. You may modify it until the deadline:"
    } ${fmtDate(ev.deadline, locale, ev.timezone, true)}.</p>` + btn(link, es ? "Ver mi oferta" : "View my offer"),
  );
  return { subject, html };
}

export function awardEmail(ev: EvInfo, supplierName: string, locale: string, lines: { sku: string; description: string; tons: number; price: number; term: string }[]) {
  const es = locale !== "en";
  const won = lines.length > 0;
  const subject = es ? `Resultado de la licitación ${ev.code}` : `Tender result ${ev.code}`;
  const table = won
    ? `<table style="border-collapse:collapse;width:100%" border="1" cellpadding="6"><tr style="background:#f3f4f6"><th>SKU</th><th>${es ? "Descripción" : "Description"}</th><th>TM</th><th>USD/TM</th><th>${es ? "Plazo" : "Term"}</th></tr>${lines
        .map((l) => `<tr><td>${esc(l.sku)}</td><td>${esc(l.description)}</td><td align="right">${l.tons.toFixed(2)}</td><td align="right">${l.price.toFixed(2)}</td><td>${esc(l.term)}</td></tr>`)
        .join("")}</table>`
    : "";
  const html = wrap(
    `<p>${es ? "Estimados" : "Dear"} ${esc(supplierName)},</p>` +
      (won
        ? `<p>${es ? "Nos complace informarle que se le adjudicó lo siguiente. Nuestro equipo le contactará para formalizar el contrato:" : "We are pleased to inform you that the following was awarded to you. Our team will contact you to formalize the contract:"}</p>${table}`
        : `<p>${es ? "Le agradecemos su participación. En esta ocasión su oferta no fue seleccionada." : "Thank you for your participation. On this occasion your offer was not selected."}</p>`) +
      `<p>${esc(ev.companyName)}</p>`,
  );
  return { subject, html };
}
