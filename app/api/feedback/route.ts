import { getAccount } from "@/lib/account";
import { accountsEnabled } from "@/lib/config";
import { supabaseAdmin } from "@/lib/supabase/server";

/** Stores a 👍 / 👎 on an answer of the assistant. */
export async function POST(req: Request) {
  if (!accountsEnabled()) return Response.json({ ok: true, stored: false });
  const account = await getAccount();
  if (!account) return Response.json({ error: "Sin sesión" }, { status: 401 });
  let b: { rating?: number; comment?: string; instruction?: string; reply?: string; actions?: string[] };
  try {
    b = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }
  const rating = b.rating === 1 ? 1 : b.rating === -1 ? -1 : 0;
  if (!rating) return Response.json({ error: "Calificación inválida" }, { status: 400 });
  const clip = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : null);
  const { error } = await supabaseAdmin()
    .from("ai_feedback")
    .insert({
      user_id: account.user.id,
      email: account.email,
      rating,
      comment: clip(b.comment, 2000),
      instruction: clip(b.instruction, 2000),
      reply: clip(b.reply, 4000),
      actions: Array.isArray(b.actions) ? b.actions.slice(0, 40).join(" · ").slice(0, 2000) : null,
    });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true, stored: true });
}
