import { connection } from "next/server";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { currentPeriod, STATUS_LABELS, trialEndsAt } from "@/lib/account";
import { accountsEnabled, config, formatPrice } from "@/lib/config";
import { adminPasswordSet, adminSession } from "@/lib/adminLock";
import { getAiRules, saveAiRules } from "@/lib/aiRules";
import { supabaseAdmin } from "@/lib/supabase/server";

export const metadata = { title: "Administración — Impulsa Studio" };

/** Signed in to the panel (admin e-mail + ADMIN_PASSWORD). */
async function requireAdmin() {
  const email = await adminSession();
  if (!email) redirect("/admin");
  return email;
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
  let failed = "";
  try {
    await saveAiRules(String(formData.get("rules") ?? ""));
  } catch (e) {
    failed = e instanceof Error ? e.message : String(e);
  }
  revalidatePath("/admin");
  if (failed) redirect(`/admin?error_reglas=${encodeURIComponent(failed.slice(0, 300))}#reglas`);
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
  searchParams: Promise<{ q?: string; guardado?: string; opiniones?: string; error_reglas?: string; clave?: string }>;
}) {
  await connection();
  if (!accountsEnabled()) redirect("/editor");
  const { q = "", guardado, opiniones, error_reglas, clave } = await searchParams;
  if (!(await adminSession())) return <LockScreen wrong={clave === "incorrecta"} />;
  const onlyBad = opiniones === "malas";

  const admin = supabaseAdmin();
  let fbQuery = admin.from("ai_feedback").select("*").order("created_at", { ascending: false }).limit(100);
  if (onlyBad) fbQuery = fbQuery.eq("rating", -1);
  const [{ data: list }, { data: subs }, { data: usage }, rules, { data: feedback, error: fbError }, checks, { data: errors }] =
    await Promise.all([
      admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
      admin.from("subscriptions").select("*"),
      admin.from("ai_usage").select("user_id, count").eq("period", currentPeriod()),
      getAiRules(),
      fbQuery,
      setupChecks(),
      admin.from("client_errors").select("*").order("created_at", { ascending: false }).limit(60),
    ]);
  const pending = checks.filter((c) => c.state === "falta").length;
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
        <div className="flex gap-2">
          <Link href="/cuenta" className="btn">
            Mi cuenta
          </Link>
          <form action="/admin/salir" method="post">
            <button className="btn">🔒 Bloquear panel</button>
          </form>
        </div>
      </header>

      <nav className="mb-5 flex flex-wrap gap-2 text-xs">
        {[
          ["#estado", pending ? `⚙️ Estado (${pending} pendiente${pending > 1 ? "s" : ""})` : "⚙️ Estado ✅"],
          ["#usuarios", "👥 Usuarios"],
          ["#reglas", "🧠 Reglas de la IA"],
          ["#opiniones", "💬 Opiniones"],
          ["#errores", `🐞 Errores${errors?.length ? ` (${errors.length})` : ""}`],
        ].map(([href, label]) => (
          <a key={href} href={href} className={`btn !py-1 ${href === "#estado" && pending ? "!border-amber-400/60" : ""}`}>
            {label}
          </a>
        ))}
      </nav>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Usuarios registrados" value={String(list?.users.length ?? 0)} />
        <Stat label="Suscripciones pagando" value={String(paying)} hint={`≈ ${formatPrice(paying * config.planPrice)} / mes`} />
        <Stat label="Activados a mano" value={String(manual)} />
      </div>

      <form id="usuarios" className="mb-3 flex gap-2">
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
        {error_reglas && (
          <div className="mt-2 rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-amber-200">
            <p className="font-semibold">No se pudieron guardar las reglas.</p>
            {/app_settings|relation|schema cache|does not exist/i.test(error_reglas) ? (
              <p className="mt-1">
                Falta crear la tabla en Supabase: abrí SQL Editor → New query, pegá el contenido de
                supabase/schema.sql (o el bloque de app_settings) y apretá Run. Después volvé a guardar.
              </p>
            ) : (
              <p className="mt-1">Detalle: {error_reglas}</p>
            )}
          </div>
        )}
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

      <section id="estado" className="mt-10">
        <h2 className="text-xl font-bold">⚙️ Estado de la configuración</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Lo que necesita la app para funcionar y cobrar. ✅ listo · ❌ falta · ➖ opcional.
        </p>
        <div className="panel mt-3 divide-y divide-[var(--line)] rounded-2xl">
          {checks.map((c) => (
            <div key={c.name} className="flex gap-3 p-3 text-sm">
              <span className="shrink-0">{c.state === "ok" ? "✅" : c.state === "falta" ? "❌" : "➖"}</span>
              <div className="min-w-0">
                <div className="font-semibold">{c.name}</div>
                <div className="text-xs text-[var(--muted)]">{c.state === "ok" ? c.ok : c.fix}</div>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-[var(--muted)]">
          Las tablas que faltan se crean corriendo el archivo supabase/schema.sql en Supabase → SQL Editor (se puede correr
          entero de nuevo sin problema). Las variables se cargan en Vercel → Settings → Environment Variables y después
          Redeploy.
        </p>
      </section>

      <section id="errores" className="mt-10">
        <h2 className="text-xl font-bold">🐞 Errores recientes de los usuarios</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Lo que les falló a los usuarios en la app (exportar, la IA, archivos…). Si algo se repite, pasámelo para
          arreglarlo.
        </p>
        <div className="mt-3 space-y-2">
          {(errors ?? []).map((e) => (
            <details key={e.id} className="panel rounded-xl p-3 text-sm">
              <summary className="cursor-pointer">
                <span className="text-xs text-[var(--muted)]">
                  {new Date(e.created_at).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })} · {e.email} ·{" "}
                  {e.where_}
                </span>
                <span className="mt-1 block font-semibold">{e.message}</span>
              </summary>
              <pre className="mt-2 text-[11px] whitespace-pre-wrap text-[var(--muted)]">
                {[e.detail, e.url && `Página: ${e.url}`, e.user_agent && `Navegador: ${e.user_agent}`].filter(Boolean).join("\n")}
              </pre>
            </details>
          ))}
          {!errors?.length && <p className="text-sm text-[var(--muted)]">Sin errores registrados. 🎉</p>}
        </div>
      </section>
    </main>
  );
}

type Check = { name: string; state: "ok" | "falta" | "opcional"; ok: string; fix: string };

/** What the app needs to work and to charge, checked on the server. */
async function setupChecks(): Promise<Check[]> {
  const env = (k: string) => !!process.env[k]?.trim();
  const admin = supabaseAdmin();
  const table = async (t: string) => !(await admin.from(t).select("*", { head: true, count: "exact" }).limit(1)).error;
  const tables = ["subscriptions", "ai_usage", "brand_kits", "projects", "app_settings", "ai_feedback", "client_errors"];
  const present = await Promise.all(tables.map(table));
  const missing = tables.filter((_, i) => !present[i]);
  const c = (name: string, ok: boolean, okText: string, fix: string, optional = false): Check => ({
    name,
    state: ok ? "ok" : optional ? "opcional" : "falta",
    ok: okText,
    fix,
  });
  return [
    c("IA (Claude)", env("ANTHROPIC_API_KEY") || env("ANTHROPIC_AUTH_TOKEN"), "Clave cargada.", "Falta ANTHROPIC_API_KEY en Vercel."),
    c(
      "Tablas de la base de datos",
      !missing.length,
      `Las ${tables.length} tablas existen.`,
      `Faltan: ${missing.join(", ")}. Corré supabase/schema.sql en Supabase → SQL Editor.`,
    ),
    c(
      "Cobros con Mercado Pago",
      env("MP_ACCESS_TOKEN"),
      "Access Token cargado.",
      "Falta MP_ACCESS_TOKEN (Mercado Pago → Tus integraciones → Credenciales de producción). Sin esto nadie puede suscribirse.",
    ),
    c(
      "Avisos de pago de Mercado Pago (webhook)",
      env("MP_WEBHOOK_SECRET"),
      "Clave del webhook cargada.",
      "Falta MP_WEBHOOK_SECRET (Mercado Pago → Webhooks, URL /api/mp/webhook). Sin esto las suscripciones no se activan solas.",
    ),
    c(
      "Dirección de la web",
      env("NEXT_PUBLIC_SITE_URL"),
      process.env.NEXT_PUBLIC_SITE_URL ?? "",
      "Falta NEXT_PUBLIC_SITE_URL (ej. https://impulsa-studiodigital.vercel.app). Se usa en los mails y en Mercado Pago.",
    ),
    c("Contraseña del panel", env("ADMIN_PASSWORD"), "Configurada.", "Falta ADMIN_PASSWORD."),
    c(
      "Soporte (WhatsApp o mail)",
      env("NEXT_PUBLIC_SUPPORT_WHATSAPP") || env("NEXT_PUBLIC_SUPPORT_EMAIL"),
      "El botón «Ayuda» muestra tu contacto.",
      "Falta NEXT_PUBLIC_SUPPORT_WHATSAPP o NEXT_PUBLIC_SUPPORT_EMAIL: los clientes no tienen a quién escribir.",
    ),
    c(
      "Voces naturales (ElevenLabs)",
      env("ELEVENLABS_API_KEY"),
      "Conectadas.",
      "Opcional: sin ELEVENLABS_API_KEY la voz en off es la básica (robótica).",
      true,
    ),
    c(
      "Entrar con Google",
      process.env.NEXT_PUBLIC_GOOGLE_LOGIN === "1",
      "Activado.",
      "Opcional: ver CONFIGURACION.md → Entrar con Google.",
      true,
    ),
    {
      name: "Mails (código de ingreso, confirmar cuenta, recuperar contraseña)",
      state: "opcional",
      ok: "",
      fix: "No se puede comprobar desde acá: revisá en Supabase → Authentication → Emails → SMTP Settings que tengas un correo propio (Resend o Brevo). El correo gratuito de Supabase manda muy pocos mails por hora.",
    },
  ];
}

function LockScreen({ wrong }: { wrong: boolean }) {
  const configured = adminPasswordSet();
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4 py-8">
      <div className="panel space-y-4 rounded-2xl p-6">
        <h1 className="text-xl font-bold">🔒 Panel de administración</h1>
        {configured ? (
          <form action="/admin/entrar" method="post" className="space-y-3">
            <label className="block space-y-1">
              <span className="label block">Usuario (tu mail de administrador)</span>
              <input id="email" name="email" type="email" required className="input" autoComplete="username" />
            </label>
            <label className="block space-y-1">
              <span className="label block">Contraseña</span>
              <input id="password" name="password" type="password" required className="input" autoComplete="current-password" />
            </label>
            {wrong && <p className="text-sm text-red-400">Usuario o contraseña incorrectos.</p>}
            <button className="btn btn-primary w-full justify-center">Entrar</button>
          </form>
        ) : (
          <p className="text-sm text-[var(--muted)]">
            Falta crear la contraseña del panel: en Vercel → Settings → Environment Variables agregá{" "}
            <b>ADMIN_PASSWORD</b> con la contraseña que quieras y hacé Redeploy.
          </p>
        )}
        <Link href="/" className="block text-center text-sm text-[var(--muted)] underline">
          Volver al inicio
        </Link>
      </div>
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
