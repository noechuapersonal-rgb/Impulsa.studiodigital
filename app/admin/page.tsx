import { connection } from "next/server";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { currentPeriod, getAccount, isAdminEmail, STATUS_LABELS, trialEndsAt } from "@/lib/account";
import { accountsEnabled, config, formatPrice } from "@/lib/config";
import { getAiRules, saveAiRules } from "@/lib/aiRules";
import { supabaseAdmin } from "@/lib/supabase/server";

export const metadata = { title: "Administración — Impulsa Studio" };

async function requireAdmin() {
  const account = await getAccount();
  if (!account || !isAdminEmail(account.email)) notFound();
  return account;
}

async function setManual(formData: FormData) {
  "use server";
  await requireAdmin();
  const userId = String(formData.get("userId"));
  const email = String(formData.get("email"));
  const manual = formData.get("manual") === "1";
  await supabaseAdmin()
    .from("subscriptions")
    .upsert({ user_id: userId, email, manual, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  revalidatePath("/admin");
}

async function saveRules(formData: FormData) {
  "use server";
  await requireAdmin();
  await saveAiRules(String(formData.get("rules") ?? ""));
  revalidatePath("/admin");
  redirect("/admin?guardado=1#reglas");
}

const RULES_EXAMPLE = `Ejemplos (borralos y escribí los tuyos):
- El gancho tiene que aparecer en el primer segundo y medio.
- Subtítulos de máximo 3 palabras por línea, en mayúsculas.
- En videos de producto, mostrar precio y llamado a la acción en los últimos 3 segundos.
- No usar el efecto glitch nunca.`;

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; guardado?: string; opiniones?: string }>;
}) {
  await connection();
  if (!accountsEnabled()) redirect("/editor");
  await requireAdmin();
  const { q = "", guardado, opiniones } = await searchParams;
  const onlyBad = opiniones === "malas";

  const admin = supabaseAdmin();
  let fbQuery = admin.from("ai_feedback").select("*").order("created_at", { ascending: false }).limit(100);
  if (onlyBad) fbQuery = fbQuery.eq("rating", -1);
  const [{ data: list }, { data: subs }, { data: usage }, rules, { data: feedback, error: fbError }] = await Promise.all([
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    admin.from("subscriptions").select("*"),
    admin.from("ai_usage").select("user_id, count").eq("period", currentPeriod()),
    getAiRules(),
    fbQuery,
  ]);
  const good = (feedback ?? []).filter((f) => f.rating === 1).length;
  const bad = (feedback ?? []).filter((f) => f.rating === -1).length;
  const subBy = new Map((subs ?? []).map((s) => [s.user_id as string, s]));
  const useBy = new Map((usage ?? []).map((u) => [u.user_id as string, u.count as number]));

  const users = (list?.users ?? [])
    .filter((u) => !q || u.email?.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
  const paying = (subs ?? []).filter((s) => s.status === "authorized").length;
  const manual = (subs ?? []).filter((s) => s.manual).length;

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-4 py-8">
      <header className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Administración</h1>
        <Link href="/cuenta" className="btn">
          Mi cuenta
        </Link>
      </header>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Usuarios registrados" value={String(list?.users.length ?? 0)} />
        <Stat label="Suscripciones pagando" value={String(paying)} hint={`≈ ${formatPrice(paying * config.planPrice)} / mes`} />
        <Stat label="Activados a mano" value={String(manual)} />
      </div>

      <form className="mb-3 flex gap-2">
        <input id="q" name="q" defaultValue={q} className="input" placeholder="Buscar por mail…" />
        <button className="btn">Buscar</button>
      </form>

      <div className="panel overflow-x-auto rounded-2xl">
        <table className="w-full text-sm">
          <thead className="text-left text-[var(--muted)]">
            <tr className="border-b border-[var(--line)]">
              <th className="p-3">Mail</th>
              <th className="p-3">Alta</th>
              <th className="p-3">Suscripción</th>
              <th className="p-3 text-right">Créditos IA este mes</th>
              <th className="p-3">Acceso manual</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const s = subBy.get(u.id);
              const isManual = !!s?.manual;
              const used = useBy.get(u.id) ?? 0;
              return (
                <tr key={u.id} className="border-b border-[var(--line)] last:border-0">
                  <td className="p-3">{u.email}</td>
                  <td className="p-3 whitespace-nowrap text-[var(--muted)]">
                    {u.created_at ? new Date(u.created_at).toLocaleDateString("es-AR") : "—"}
                  </td>
                  <td className="p-3">
                    {(() => {
                      const st = s?.status ?? "inactive";
                      if (st !== "authorized" && !isManual) {
                        const end = trialEndsAt(u);
                        if (end && end.getTime() > Date.now())
                          return `Prueba gratis (hasta ${end.toLocaleDateString("es-AR")})`;
                      }
                      return STATUS_LABELS[st] ?? st;
                    })()}
                  </td>
                  <td className={`p-3 text-right tabular-nums ${used >= config.aiMonthlyLimit ? "text-amber-300" : ""}`}>
                    {used}
                  </td>
                  <td className="p-3">
                    <form action={setManual}>
                      <input type="hidden" name="userId" value={u.id} />
                      <input type="hidden" name="email" value={u.email ?? ""} />
                      <input type="hidden" name="manual" value={isManual ? "0" : "1"} />
                      <button className={`btn !py-1 text-xs ${isManual ? "" : "btn-primary"}`}>
                        {isManual ? "Quitar acceso" : "Dar acceso"}
                      </button>
                    </form>
                  </td>
                </tr>
              );
            })}
            {!users.length && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-[var(--muted)]">
                  Todavía no hay usuarios.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-[var(--muted)]">
        “Dar acceso” sirve para quien te pagó por otro medio o para regalar acceso. Las suscripciones de Mercado Pago se
        activan y desactivan solas.
      </p>

      <section id="reglas" className="mt-10">
        <h2 className="text-xl font-bold">🧠 Reglas de la IA</h2>
        <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">
          Escribí cómo querés que edite la IA, como se lo explicarías a un editor nuevo. Las sigue desde el próximo pedido,
          para todos los usuarios. Si un cliente pide algo distinto, gana lo que pide el cliente.
        </p>
        {guardado && <p className="mt-2 text-sm text-emerald-300">✓ Reglas guardadas. La IA ya las está usando.</p>}
        <form action={saveRules} className="mt-3 space-y-2">
          <textarea
            id="rules"
            name="rules"
            defaultValue={rules}
            rows={10}
            className="input font-mono !text-[13px]"
            placeholder={RULES_EXAMPLE}
          />
          <button className="btn btn-primary">Guardar reglas</button>
        </form>
      </section>

      <section id="opiniones" className="mt-10">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-xl font-bold">💬 Opiniones sobre la IA</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Lo que marcaron los usuarios con 👍 / 👎. Usá los 👎 para descubrir qué reglas agregar arriba.
            </p>
          </div>
          <div className="flex gap-2 text-sm">
            <Link href="/admin#opiniones" className={`btn !py-1 ${onlyBad ? "" : "btn-primary"}`}>
              Todas
            </Link>
            <Link href="/admin?opiniones=malas#opiniones" className={`btn !py-1 ${onlyBad ? "btn-primary" : ""}`}>
              Solo 👎
            </Link>
          </div>
        </div>
        {fbError ? (
          <p className="mt-3 text-sm text-amber-300">
            Falta crear la tabla de opiniones en Supabase (ver CONFIGURACION.md / supabase/schema.sql).
          </p>
        ) : (
          <>
            {!onlyBad && (feedback?.length ?? 0) > 0 && (
              <p className="mt-3 text-sm">
                Últimas {feedback?.length}: <b>👍 {good}</b> · <b>👎 {bad}</b>
              </p>
            )}
            <div className="mt-3 space-y-2">
              {(feedback ?? []).map((f) => (
                <div key={f.id} className="panel rounded-xl p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--muted)]">
                    <span>
                      {f.rating === 1 ? "👍" : "👎"} {f.email}
                    </span>
                    <span>{new Date(f.created_at).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}</span>
                  </div>
                  {f.comment && <p className="mt-1.5 font-semibold">“{f.comment}”</p>}
                  {f.instruction && (
                    <p className="mt-1.5">
                      <span className="text-[var(--muted)]">Pidió: </span>
                      {f.instruction}
                    </p>
                  )}
                  {f.actions && (
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      Hizo: {f.actions}
                    </p>
                  )}
                  {f.reply && (
                    <details className="mt-1 text-xs text-[var(--muted)]">
                      <summary className="cursor-pointer">Respuesta de la IA</summary>
                      <p className="mt-1 whitespace-pre-wrap">{f.reply}</p>
                    </details>
                  )}
                </div>
              ))}
              {!feedback?.length && <p className="text-sm text-[var(--muted)]">Todavía no hay opiniones.</p>}
            </div>
          </>
        )}
      </section>
    </main>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="panel rounded-2xl p-4">
      <div className="label">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
      {hint && <div className="text-xs text-[var(--muted)]">{hint}</div>}
    </div>
  );
}
