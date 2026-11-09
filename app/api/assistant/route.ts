import Anthropic from "@anthropic-ai/sdk";
import { guardAi } from "@/lib/aiGuard";
import { AI_TOOLS, SYSTEM_PROMPT } from "@/lib/aiTools";

export const runtime = "nodejs";
export const maxDuration = 300;

// Claude Haiku: muy económico (fracciones de centavo por instrucción).
// Para máxima calidad en pedidos complejos se puede usar "claude-opus-5-5".
const MODEL = process.env.CLAUDE_MODEL || "claude-haiku-5-5";

let client: Anthropic | null = null;

export async function POST(req: Request) {
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

  // Each new instruction from the user costs one credit; follow-up requests that only carry
  // tool results are part of the same instruction.
  const last = messages[messages.length - 1];
  const isNewInstruction =
    last?.role === "user" && Array.isArray(last.content) && last.content.some((b) => b.type === "text");
  const guard = await guardAi(isNewInstruction);
  if (guard instanceof Response) return guard;
  const usage = guard.usage;

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
