import "server-only";
import { accountsEnabled } from "@/lib/config";
import { supabaseAdmin } from "@/lib/supabase/server";

/** Editing rules written by the admin in /admin, added to the assistant's instructions. */

let cache: { value: string; at: number } | null = null;
const TTL = 30_000;

export async function getAiRules(): Promise<string> {
  if (!accountsEnabled()) return "";
  if (cache && Date.now() - cache.at < TTL) return cache.value;
  try {
    const { data } = await supabaseAdmin().from("app_settings").select("value").eq("key", "ai_rules").maybeSingle();
    cache = { value: (data?.value ?? "").trim(), at: Date.now() };
  } catch {
    cache = { value: cache?.value ?? "", at: Date.now() };
  }
  return cache.value;
}

export async function saveAiRules(value: string) {
  const { error } = await supabaseAdmin()
    .from("app_settings")
    .upsert({ key: "ai_rules", value: value.slice(0, 20_000), updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  cache = { value: value.trim(), at: Date.now() };
}
