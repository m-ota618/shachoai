// src/utils/domain.ts
/** .env で指定：VITE_ALLOWED_EMAIL_DOMAINS=okuratokyo.jp,example.com */
export const FRONT_ALLOWED: string[] = String(import.meta.env.VITE_ALLOWED_EMAIL_DOMAINS || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

/** 許可ドメイン（FRONT_ALLOWED）が空のときは “判定スキップ=true” にする */
export function isAllowedEmail(email: string): boolean {
  if (!FRONT_ALLOWED.length) return true;
  const d = (email.split("@")[1] || "").toLowerCase();
  if (!d) return false;
  return FRONT_ALLOWED.some((dom) => d === dom || d.endsWith("." + dom));
}
