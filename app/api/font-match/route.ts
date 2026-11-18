import Anthropic from "@anthropic-ai/sdk";
import { guardAi } from "@/lib/aiGuard";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = process.env.CLAUDE_MODEL || "claude-haiku-5-5";

/** Recognizes the typography in a photo and suggests the closest free Google Fonts. */

const SYSTEM = `Eres un experto en tipografía y diseño de marca. Recibes una o varias fotos o capturas con textos (carteles, logos, Reels, diseños) que le gustan a un cliente. Para CADA foto identificas la tipografía principal y propones las alternativas más parecidas disponibles GRATIS en Google Fonts. Además propones una COMBINACIÓN para su marca: una tipografía para títulos y otra para textos y subtítulos, que combinen bien entre sí y respeten el estilo de las fotos (si las fotos tienen estilos distintos, combínalos: por ejemplo la letra llamativa para títulos y la más legible para textos).

Reglas:
- "matches": entre 1 y 3 familias de Google Fonts, de la más parecida a la menos. Usa el nombre EXACTO de la familia tal como aparece en fonts.google.com (por ejemplo "Montserrat", "Bebas Neue", "Playfair Display", "DM Serif Display", "Great Vibes"). Nunca inventes familias ni propongas fuentes pagas en "matches".
- "identified": si reconoces la tipografía original (aunque sea paga, por ejemplo "Futura", "Gotham", "Helvetica Neue"), su nombre; si no estás seguro, null.
- En "why" explica en una frase corta, en español rioplatense, en qué se parece (forma de las letras, grosor, serifas, estilo).
- Si en una imagen hay varias tipografías, analiza la más destacada y mencionalo en "note".
- "photos" va en el mismo orden que las fotos recibidas.
- En "combo", "title" y "body" son familias exactas de Google Fonts (pueden ser de las propuestas en "matches" u otras mejores para combinar). La de "body" tiene que leerse bien en un celular. "why": una o dos frases en español rioplatense.`;

const TOOL: Anthropic.Tool = {
  name: "report_fonts",
  description: "Devuelve la tipografía identificada y las alternativas de Google Fonts.",
  input_schema: {
    type: "object",
    properties: {
      photos: {
        type: "array",
        items: {
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
      },
      combo: {
        type: "object",
        properties: {
          title: { type: "string", description: "Google Font para títulos" },
          body: { type: "string", description: "Google Font para textos y subtítulos" },
          why: { type: "string" },
        },
        required: ["title", "body", "why"],
      },
    },
    required: ["photos", "combo"],
  },
};

let client: Anthropic | null = null;

export async function POST(req: Request) {
  let body: { image?: unknown; images?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }
  const images = (Array.isArray(body.images) ? body.images : [body.image])
    .filter((x): x is string => typeof x === "string" && x.length > 0)
    .slice(0, 4);
  if (!images.length) return Response.json({ error: "Falta la foto." }, { status: 400 });
  if (images.some((x) => x.length > 1_500_000)) return Response.json({ error: "Alguna foto es muy grande." }, { status: 400 });

  const guard = await guardAi(true);
  if (guard instanceof Response) return guard;

  client ??= new Anthropic();
  try {
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 6000,
      system: SYSTEM,
      tools: [TOOL],
      tool_choice: { type: "tool", name: "report_fonts" },
      messages: [
        {
          role: "user",
          content: [
            ...images.flatMap((data, i) => [
              { type: "text" as const, text: `Foto ${i + 1}:` },
              { type: "image" as const, source: { type: "base64" as const, media_type: "image/jpeg" as const, data } },
            ]),
            {
              type: "text",
              text:
                images.length > 1
                  ? "¿Qué tipografía hay en cada foto, cuáles de Google Fonts se parecen más, y qué combinación (títulos + textos) me recomendás a partir de todas?"
                  : "¿Qué tipografía es esta, cuáles de Google Fonts se le parecen más, y con qué combinarla (títulos + textos)?",
            },
          ],
        },
      ],
    });
    const use = msg.content.find((b) => b.type === "tool_use");
    if (!use || use.type !== "tool_use") return Response.json({ error: "No se pudo reconocer la tipografía." }, { status: 422 });
    type Raw = { identified?: string | null; matches?: { name?: string; why?: string }[]; note?: string };
    const out = use.input as { photos?: Raw[]; combo?: { title?: string; body?: string; why?: string } };
    const clean = (m?: { name?: string; why?: string }[]) =>
      (m ?? [])
        .filter((x) => typeof x?.name === "string" && x.name.trim())
        .slice(0, 3)
        .map((x) => ({ name: String(x.name).trim().slice(0, 60), why: String(x.why ?? "").slice(0, 300) }));
    const photos = (out.photos ?? []).slice(0, images.length).map((p) => ({
      identified: p?.identified ? String(p.identified).slice(0, 80) : null,
      matches: clean(p?.matches),
      note: p?.note ? String(p.note).slice(0, 300) : "",
    }));
    const c = out.combo;
    const combo =
      c?.title && c?.body
        ? { title: String(c.title).trim().slice(0, 60), body: String(c.body).trim().slice(0, 60), why: String(c.why ?? "").slice(0, 400) }
        : null;
    if (!photos.some((p) => p.matches.length) && !combo)
      return Response.json({ error: "No encontramos texto claro en las fotos. Probá con otras más nítidas." }, { status: 422 });
    return Response.json({ photos, combo, usage: guard.usage });
  } catch (error) {
    if (error instanceof Anthropic.APIError)
      return Response.json({ error: `Error de la IA (${error.status}). Probá de nuevo.` }, { status: 502 });
    return Response.json({ error: "No se pudo analizar la foto." }, { status: 502 });
  }
}
