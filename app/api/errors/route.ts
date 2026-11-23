import { getAccount } from "@/lib/account";
import { accountsEnabled } from "@/lib/config";
import { supabaseAdmin } from "@/lib/supabase/server";

/** Errors that happen in the users' browsers (export, AI, files…), stored for the admin panel. */
export async function POST(req: Request) {
  if (!accountsEnabled()) return Response.json({ ok: true, stored: false });
  const raw = await req.text();
  if (raw.length > 20_000) return Response.json({ error: "Muy grande" }, { status: 413 });
  let b: { where?: unknown; message?: unknown; detail?: unknown; url?: unknown };
  try {
    b = JSON.parse(raw);
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }
  const message = String(b.message ?? "").trim().slice(0, 1000);
  if (!message) return Response.json({ error: "Falta el mensaje" }, { status: 400 });
  // only signed-in users can report (keeps bots out)
  const account = await getAccount();
  if (!account) return Response.json({ ok: true, stored: false });
  const { error } = await supabaseAdmin()
    .from("client_errors")
    .insert({
      user_id: account.user.id,
      email: account.email,
      where_: String(b.where ?? "").slice(0, 80),
      message,
      detail: String(b.detail ?? "").slice(0, 4000) || null,
      url: String(b.url ?? "").slice(0, 300) || null,
      user_agent: (req.headers.get("user-agent") ?? "").slice(0, 300),
    });
  if (error) return Response.json({ ok: true, stored: false });
  return Response.json({ ok: true, stored: true });
}
