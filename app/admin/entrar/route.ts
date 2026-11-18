import { isAdminEmail } from "@/lib/account";
import { passwordMatches, unlock } from "@/lib/adminLock";

/** Panel login form (plain POST + redirect, so the browser reloads /admin with the new cookie). */
export async function POST(req: Request) {
  const form = await req.formData();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const ok = isAdminEmail(email) && passwordMatches(String(form.get("password") ?? ""));
  if (!ok) {
    // slow down guessing
    await new Promise((r) => setTimeout(r, 1500));
    return Response.redirect(new URL("/admin?clave=incorrecta", req.url), 303);
  }
  await unlock(email);
  return Response.redirect(new URL("/admin", req.url), 303);
}
