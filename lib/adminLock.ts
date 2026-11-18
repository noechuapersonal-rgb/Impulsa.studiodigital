import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { isAdminEmail } from "@/lib/account";

/** Login for /admin: an e-mail from ADMIN_EMAILS plus ADMIN_PASSWORD (independent of the users' e-mail login). */

const COOKIE = "impulsa_admin";
const HOURS = 12;

export const adminPasswordSet = () => !!process.env.ADMIN_PASSWORD?.trim();

const secret = () => `${process.env.ADMIN_PASSWORD?.trim()}|${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""}`;

function sign(email: string, exp: number) {
  return createHmac("sha256", secret()).update(`${email}|${exp}`).digest("hex");
}

export function passwordMatches(input: string): boolean {
  const want = process.env.ADMIN_PASSWORD?.trim();
  if (!want) return false;
  const a = createHash("sha256").update(input.trim()).digest();
  const b = createHash("sha256").update(want).digest();
  return timingSafeEqual(a, b);
}

/** The admin e-mail signed in to the panel in this browser, or null. */
export async function adminSession(): Promise<string | null> {
  if (!adminPasswordSet()) return null;
  const v = (await cookies()).get(COOKIE)?.value ?? "";
  const [b64, exp, sig] = v.split(".");
  if (!b64 || !exp || !sig || Number(exp) < Date.now()) return null;
  const email = Buffer.from(b64, "base64url").toString();
  if (!isAdminEmail(email)) return null;
  const want = sign(email, Number(exp));
  return sig.length === want.length && timingSafeEqual(Buffer.from(sig), Buffer.from(want)) ? email : null;
}

export async function unlock(email: string) {
  const exp = Date.now() + HOURS * 3600_000;
  const e = email.trim().toLowerCase();
  (await cookies()).set(COOKIE, `${Buffer.from(e).toString("base64url")}.${exp}.${sign(e, exp)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/admin",
    maxAge: HOURS * 3600,
  });
}

export async function lock() {
  (await cookies()).delete({ name: COOKIE, path: "/admin" });
}
