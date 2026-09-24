import crypto from "node:crypto";

export function newToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}
export function hashToken(t: string): string {
  return crypto.createHash("sha256").update(t).digest("hex");
}
