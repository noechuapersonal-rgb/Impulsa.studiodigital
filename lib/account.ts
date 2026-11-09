import "server-only";
import type { User } from "@supabase/supabase-js";
import { accountsEnabled, config } from "@/lib/config";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";

export interface Account {
  user: User;
  email: string;
  isAdmin: boolean;
  active: boolean;
  status: string;
  manual: boolean;
  nextPaymentDate: string | null;
  used: number;
  limit: number;
}

export const currentPeriod = () => new Date().toISOString().slice(0, 7);

export const isAdminEmail = (email?: string | null) =>
  !!email && config.adminEmails.includes(email.toLowerCase());

/** The signed-in user plus their plan and AI usage, or null when nobody is signed in. */
export async function getAccount(): Promise<Account | null> {
  if (!accountsEnabled()) return null;
  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return null;

  const [{ data: sub }, { data: usage }] = await Promise.all([
    sb.from("subscriptions").select("status, manual, next_payment_date").eq("user_id", user.id).maybeSingle(),
    sb.from("ai_usage").select("count").eq("user_id", user.id).eq("period", currentPeriod()).maybeSingle(),
  ]);

  const email = user.email ?? "";
  const isAdmin = isAdminEmail(email);
  const status = sub?.status ?? "inactive";
  const manual = !!sub?.manual;
  return {
    user,
    email,
    isAdmin,
    status,
    manual,
    active: isAdmin || manual || status === "authorized",
    nextPaymentDate: sub?.next_payment_date ?? null,
    used: usage?.count ?? 0,
    limit: config.aiMonthlyLimit,
  };
}

/** Counts one AI instruction for the user this month. Returns the new total. */
export async function incrementUsage(userId: string): Promise<number> {
  const { data, error } = await supabaseAdmin().rpc("increment_ai_usage", {
    p_user: userId,
    p_period: currentPeriod(),
  });
  if (error) throw new Error(error.message);
  return Number(data);
}

export const STATUS_LABELS: Record<string, string> = {
  authorized: "Activa",
  pending: "Pago pendiente",
  paused: "Pausada",
  cancelled: "Cancelada",
  inactive: "Sin suscripción",
};
