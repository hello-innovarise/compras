// Utilidades para server actions.
import { redirect } from "next/navigation";

export function str(fd: FormData, k: string): string | null {
  const v = fd.get(k);
  if (v === null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}
export function numf(fd: FormData, k: string): number | null {
  const s = str(fd, k);
  if (s === null) return null;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}
export function datef(fd: FormData, k: string): Date | null {
  const s = str(fd, k);
  if (!s) return null;
  const d = new Date(s.length === 10 ? `${s}T12:00:00Z` : s);
  return Number.isNaN(d.getTime()) ? null : d;
}
/** datetime-local interpretado en la zona horaria dada (por defecto Guatemala, UTC-6 sin horario de verano). */
export function localDateTime(value: string, tz = "America/Guatemala"): Date {
  const asUtc = new Date(`${value}:00Z`);
  const offset = tzOffsetMinutes(asUtc, tz);
  return new Date(asUtc.getTime() - offset * 60000);
}
export function tzOffsetMinutes(d: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(d);
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const local = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"));
  return Math.round((local - d.getTime()) / 60000);
}
export function toLocalInput(d: Date | null | undefined, tz = "America/Guatemala"): string {
  if (!d) return "";
  const off = tzOffsetMinutes(d, tz);
  return new Date(d.getTime() + off * 60000).toISOString().slice(0, 16);
}
export function toDateInput(d: Date | null | undefined): string {
  return d ? d.toISOString().slice(0, 10) : "";
}
export function back(path: string, msg?: string, error?: string): never {
  const q = new URLSearchParams();
  if (msg) q.set("msg", msg);
  if (error) q.set("error", error);
  const s = q.toString();
  const [base, hash] = path.split("#");
  redirect(`${s ? `${base}${base.includes("?") ? "&" : "?"}${s}` : base}${hash ? `#${hash}` : ""}`);
}
export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
