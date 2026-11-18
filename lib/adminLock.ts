import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

/** Second lock for /admin: besides being an admin e-mail, the panel asks for ADMIN_PASSWORD. */

const COOKIE = "impulsa_admin";
const HOURS = 12;

export const adminPasswordSet = () => !!process.env.ADMIN_PASSWORD?.trim();

const secret = () => `${process.env.ADMIN_PASSWORD?.trim()}|${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""}`;

function sign(userId: string, exp: number) {
  return createHmac("sha256", secret()).update(`${userId}.${exp}`).digest("hex");
}

export function passwordMatches(input: string): boolean {
  const want = process.env.ADMIN_PASSWORD?.trim();
  if (!want) return false;
  const a = createHash("sha256").update(input.trim()).digest();
  const b = createHash("sha256").update(want).digest();
  return timingSafeEqual(a, b);
}

export async function isUnlocked(userId: string): Promise<boolean> {
  if (!adminPasswordSet()) return false;
  const v = (await cookies()).get(COOKIE)?.value ?? "";
  const [exp, sig] = v.split(".");
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const want = sign(userId, Number(exp));
  return sig.length === want.length && timingSafeEqual(Buffer.from(sig), Buffer.from(want));
}

export async function unlock(userId: string) {
  const exp = Date.now() + HOURS * 3600_000;
  (await cookies()).set(COOKIE, `${exp}.${sign(userId, exp)}`, {
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
