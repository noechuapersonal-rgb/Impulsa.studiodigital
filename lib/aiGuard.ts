import "server-only";
import { getAccount, incrementUsage } from "@/lib/account";
import { accountsEnabled, config } from "@/lib/config";

export type Usage = { used: number; limit: number };

/**
 * Checks that the visitor may use the AI and, when `countsAsCredit`, spends one credit.
 * Returns the usage to report back, or a Response to send instead (not allowed / limit reached).
 */
export async function guardAi(countsAsCredit: boolean | number): Promise<{ usage?: Usage } | Response> {
  const cost = countsAsCredit === true ? 1 : countsAsCredit === false ? 0 : Math.max(0, Math.round(countsAsCredit));
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    return Response.json(
      {
        error:
          "El asistente IA aún no tiene su clave de Claude. Añade la variable ANTHROPIC_API_KEY (en Vercel: Settings → Environment Variables) y vuelve a implementar. Mientras tanto puedes editar con las herramientas del panel izquierdo.",
      },
      { status: 500 },
    );
  }
  if (!accountsEnabled()) {
    if (process.env.NODE_ENV === "production" && process.env.ALLOW_OPEN_AI !== "1")
      return Response.json(
        { error: "El asistente IA se activa cuando configures las cuentas de usuario (Supabase). Mira CONFIGURACION.md." },
        { status: 503 },
      );
    return {};
  }
  const account = await getAccount();
  if (!account) return Response.json({ error: "Tu sesión expiró. Vuelve a ingresar." }, { status: 401 });
  if (!account.active)
    return Response.json(
      { error: 'Tu prueba gratis terminó. Suscríbete desde "Mi cuenta" para seguir usando la IA.' },
      { status: 402 },
    );
  const usage = { used: account.used, limit: account.limit };
  if (cost > 0) {
    if (account.used + cost > account.limit && !account.isAdmin)
      return Response.json(
        {
          error: account.used < account.limit
            ? `Esto usa ${cost} créditos de IA y te quedan ${account.limit - account.used}. Probá con un texto más corto.`
            : account.onTrial
            ? `Usaste los ${account.limit} créditos de IA de la prueba gratis. Suscríbete desde "Mi cuenta" para tener ${config.aiMonthlyLimit} por mes. Mientras tanto puedes seguir editando a mano.`
            : `Llegaste al límite de ${account.limit} créditos de IA de este mes. Se renueva el día 1. Mientras tanto puedes seguir editando a mano.`,
        },
        { status: 429 },
      );
    for (let i = 0; i < cost; i++) usage.used = await incrementUsage(account.user.id);
  }
  return { usage };
}
