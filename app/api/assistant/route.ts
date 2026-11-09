import Anthropic from "@anthropic-ai/sdk";
import { getAccount, incrementUsage } from "@/lib/account";
import { AI_TOOLS, SYSTEM_PROMPT } from "@/lib/aiTools";
import { accountsEnabled, config } from "@/lib/config";

export const runtime = "nodejs";
export const maxDuration = 300;

// Claude Haiku: muy económico (fracciones de centavo por instrucción).
// Para máxima calidad en pedidos complejos se puede usar "claude-opus-5-5".
const MODEL = process.env.CLAUDE_MODEL || "claude-haiku-5-5";

let client: Anthropic | null = null;

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    return Response.json(
      {
        error:
          "El asistente IA aún no tiene su clave de Claude. Añade la variable ANTHROPIC_API_KEY (en Vercel: Settings → Environment Variables) y vuelve a implementar. Mientras tanto puedes editar con las herramientas del panel izquierdo.",
      },
      { status: 500 },
    );
  }
  let body: { messages?: Anthropic.Beta.BetaMessageParam[] };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }
  const messages = body.messages;
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 400) {
    return Response.json({ error: "Conversación inválida" }, { status: 400 });
  }

  // Only subscribers may use the AI, with a monthly limit. Each new instruction from the user counts once
  // (follow-up requests that only carry tool results are part of the same instruction).
  let usage: { used: number; limit: number } | undefined;
  if (accountsEnabled()) {
    const account = await getAccount();
    if (!account) return Response.json({ error: "Tu sesión expiró. Vuelve a ingresar." }, { status: 401 });
    if (!account.active)
      return Response.json({ error: "Tu prueba gratis terminó. Suscríbete desde \"Mi cuenta\" para seguir usando el asistente IA." }, { status: 402 });
    const last = messages[messages.length - 1];
    const isNewInstruction =
      last?.role === "user" &&
      Array.isArray(last.content) &&
      last.content.some((b) => b.type === "text");
    usage = { used: account.used, limit: account.limit };
    if (isNewInstruction) {
      if (account.used >= account.limit && !account.isAdmin)
        return Response.json(
          {
            error: account.onTrial
              ? `Usaste los ${account.limit} créditos de IA de la prueba gratis. Suscríbete desde "Mi cuenta" para tener ${config.aiMonthlyLimit} por mes. Mientras tanto puedes seguir editando a mano.`
              : `Llegaste al límite de ${account.limit} créditos de IA de este mes. Se renueva el día 1. Mientras tanto puedes seguir editando a mano.`,
          },
          { status: 429 },
        );
      usage.used = await incrementUsage(account.user.id);
    }
  } else if (process.env.NODE_ENV === "production" && process.env.ALLOW_OPEN_AI !== "1") {
    return Response.json(
      { error: "El asistente IA se activa cuando configures las cuentas de usuario (Supabase). Mira CONFIGURACION.md." },
      { status: 503 },
    );
  }

  client ??= new Anthropic();
  try {
    const stream = client.beta.messages.stream({
      model: MODEL,
      max_tokens: 32000,
      output_config: { effort: "medium" },
      system: SYSTEM_PROMPT,
      // eager streaming: inputs are small but arrive sooner; the browser validates them
      tools: AI_TOOLS.map((t) => ({ ...t, eager_input_streaming: true })),
      cache_control: { type: "ephemeral" },
      messages,
    });
    const msg = await stream.finalMessage();

    if (msg.stop_reason === "refusal") {
      return Response.json({
        content: [{ type: "text", text: "No puedo ayudar con esa petición. Prueba a reformularla." }],
        stop_reason: "end_turn",
        refused: true,
      });
    }
    return Response.json({ content: msg.content, stop_reason: msg.stop_reason, usage });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      return Response.json({ error: "La clave de la API de Claude no es válida." }, { status: 500 });
    }
    if (error instanceof Anthropic.RateLimitError) {
      return Response.json({ error: "Demasiadas peticiones. Espera unos segundos e inténtalo de nuevo." }, { status: 429 });
    }
    if (error instanceof Anthropic.BadRequestError) {
      return Response.json({ error: `Petición rechazada: ${error.message}` }, { status: 400 });
    }
    if (error instanceof Anthropic.APIError) {
      return Response.json({ error: `Error de la API (${error.status}): ${error.message}` }, { status: 502 });
    }
    return Response.json({ error: "No se pudo contactar con la IA." }, { status: 502 });
  }
}
