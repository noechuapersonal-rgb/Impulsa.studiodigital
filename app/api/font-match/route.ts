import Anthropic from "@anthropic-ai/sdk";
import { guardAi } from "@/lib/aiGuard";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = process.env.CLAUDE_MODEL || "claude-haiku-5-5";

/** Recognizes the typography in a photo and suggests the closest free Google Fonts. */

const SYSTEM = `Eres un experto en tipografía. Recibes una foto o captura con un texto (un cartel, un logo, un Reel, un diseño) y tu tarea es identificar la tipografía principal y proponer las alternativas más parecidas que estén disponibles GRATIS en Google Fonts.

Reglas:
- "matches": entre 1 y 3 familias de Google Fonts, de la más parecida a la menos. Usa el nombre EXACTO de la familia tal como aparece en fonts.google.com (por ejemplo "Montserrat", "Bebas Neue", "Playfair Display", "DM Serif Display", "Great Vibes"). Nunca inventes familias ni propongas fuentes pagas en "matches".
- "identified": si reconoces la tipografía original (aunque sea paga, por ejemplo "Futura", "Gotham", "Helvetica Neue"), su nombre; si no estás seguro, null.
- En "why" explica en una frase corta, en español rioplatense, en qué se parece (forma de las letras, grosor, serifas, estilo).
- Si en la imagen hay varias tipografías, analiza la más destacada y mencionalo en "note".`;

const TOOL: Anthropic.Tool = {
  name: "report_fonts",
  description: "Devuelve la tipografía identificada y las alternativas de Google Fonts.",
  input_schema: {
    type: "object",
    properties: {
      identified: { type: ["string", "null"], description: "Nombre de la tipografía original si se reconoce, o null." },
      matches: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "Familia exacta de Google Fonts" },
            why: { type: "string" },
          },
          required: ["name", "why"],
        },
      },
      note: { type: "string", description: "Comentario breve opcional." },
    },
    required: ["identified", "matches"],
  },
};

let client: Anthropic | null = null;

export async function POST(req: Request) {
  let body: { image?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }
  const image = typeof body.image === "string" ? body.image : "";
  if (!image || image.length > 3_000_000) return Response.json({ error: "Falta la foto (o es muy grande)." }, { status: 400 });

  const guard = await guardAi(true);
  if (guard instanceof Response) return guard;

  client ??= new Anthropic();
  try {
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      system: SYSTEM,
      tools: [TOOL],
      tool_choice: { type: "tool", name: "report_fonts" },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: image } },
            { type: "text", text: "¿Qué tipografía es esta y cuáles de Google Fonts se le parecen más?" },
          ],
        },
      ],
    });
    const use = msg.content.find((b) => b.type === "tool_use");
    if (!use || use.type !== "tool_use") return Response.json({ error: "No se pudo reconocer la tipografía." }, { status: 422 });
    const out = use.input as { identified?: string | null; matches?: { name?: string; why?: string }[]; note?: string };
    const matches = (out.matches ?? [])
      .filter((m) => typeof m?.name === "string" && m.name.trim())
      .slice(0, 3)
      .map((m) => ({ name: String(m.name).trim().slice(0, 60), why: String(m.why ?? "").slice(0, 300) }));
    if (!matches.length) return Response.json({ error: "No encontramos texto claro en la foto. Probá con otra más nítida." }, { status: 422 });
    return Response.json({
      identified: out.identified ? String(out.identified).slice(0, 80) : null,
      matches,
      note: out.note ? String(out.note).slice(0, 300) : "",
      usage: guard.usage,
    });
  } catch (error) {
    if (error instanceof Anthropic.APIError)
      return Response.json({ error: `Error de la IA (${error.status}). Probá de nuevo.` }, { status: 502 });
    return Response.json({ error: "No se pudo analizar la foto." }, { status: 502 });
  }
}
