import Anthropic from "@anthropic-ai/sdk";
import { AI_TOOLS, SYSTEM_PROMPT } from "@/lib/aiTools";

export const runtime = "nodejs";
export const maxDuration = 300;

const MODEL = "claude-opus-5-5";

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

  client ??= new Anthropic();
  try {
    const stream = client.beta.messages.stream({
      model: MODEL,
      max_tokens: 32000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
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
    return Response.json({ content: msg.content, stop_reason: msg.stop_reason });
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
