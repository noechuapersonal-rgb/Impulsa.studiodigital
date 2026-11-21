import { guardAi } from "@/lib/aiGuard";
import { isExpressiveModel, stageToTags } from "@/lib/voiceTags";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Natural voices for the voice-over, through ElevenLabs (ELEVENLABS_API_KEY).
 * GET → the voices available; POST → the audio (MP3, base64) of each line.
 */

const KEY = () => process.env.ELEVENLABS_API_KEY?.trim();
const MODEL = () => process.env.ELEVENLABS_MODEL?.trim() || "eleven_multilingual_v2";
/** model for dialogue with acting directions (frutinovelas): understands [whispers], [shouts]… */
const EXPRESSIVE_MODEL = () => process.env.ELEVENLABS_EXPRESSIVE_MODEL?.trim() || "eleven_v3";
const MAX_CHARS = 3000;
/** voice credits: 1 per this many characters (a 40 s script ≈ 600 characters ≈ 3 credits) */
const CHARS_PER_CREDIT = 200;

export type Voice = { id: string; name: string; info: string };
let voicesCache: { at: number; voices: Voice[] } | null = null;

async function listVoices(): Promise<Voice[]> {
  if (voicesCache && Date.now() - voicesCache.at < 10 * 60_000) return voicesCache.voices;
  const r = await fetch("https://api.elevenlabs.io/v1/voices", { headers: { "xi-api-key": KEY()! } });
  if (!r.ok) throw new Error(`ElevenLabs ${r.status}`);
  const data = (await r.json()) as {
    voices?: { voice_id: string; name: string; labels?: Record<string, string> }[];
  };
  let voices: Voice[] = (data.voices ?? []).map((v) => ({
    id: v.voice_id,
    name: v.name.split(/\s[-–]\s/)[0],
    info: [v.labels?.gender === "female" ? "mujer" : v.labels?.gender === "male" ? "hombre" : "", v.labels?.accent, v.labels?.language]
      .filter(Boolean)
      .join(" · "),
  }));
  // Spanish / Latin voices first, then the configured default first of all
  const latin = (v: Voice) => /spanish|español|mexic|latin|argentin|colombi|es\b/i.test(v.info + v.name);
  voices.sort((a, b) => Number(latin(b)) - Number(latin(a)));
  const def = process.env.ELEVENLABS_VOICE_ID?.trim();
  if (def) voices = [...voices.filter((v) => v.id === def), ...voices.filter((v) => v.id !== def)];
  voicesCache = { at: Date.now(), voices };
  return voices;
}

export async function GET() {
  if (!KEY()) return Response.json({ premium: false, voices: [] });
  try {
    const voices = await listVoices();
    return Response.json({ premium: voices.length > 0, voices, charsPerCredit: CHARS_PER_CREDIT });
  } catch {
    return Response.json({ premium: false, voices: [] });
  }
}

export async function POST(req: Request) {
  if (!KEY()) return Response.json({ error: "Las voces naturales no están configuradas." }, { status: 503 });
  let body: { texts?: unknown; voice?: unknown; contexts?: unknown; stages?: unknown; expressive?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }
  const texts = Array.isArray(body.texts) ? body.texts.map((t) => String(t ?? "").trim()).slice(0, 80) : [];
  // optional, per line: what is said right before / after (other characters' lines in a dialogue)
  const contexts = Array.isArray(body.contexts)
    ? body.contexts.map((c) => {
        const o = (c ?? {}) as { previous?: unknown; next?: unknown };
        const cut = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(-600) : undefined);
        return { previous: cut(o.previous), next: typeof o.next === "string" && o.next.trim() ? o.next.trim().slice(0, 600) : undefined };
      })
    : null;
  // optional, per line: acting direction written in the script ("susurrando")
  const stages = Array.isArray(body.stages) ? body.stages.map((x) => (typeof x === "string" ? x.slice(0, 120) : "")) : [];
  const expressive = body.expressive === true;
  const chars = texts.reduce((n, t) => n + t.length, 0);
  if (!chars) return Response.json({ error: "No hay texto para leer." }, { status: 400 });
  if (chars > MAX_CHARS)
    return Response.json(
      { error: `El texto es muy largo (${chars} caracteres). El máximo es ${MAX_CHARS} por vez: dividilo en partes.` },
      { status: 400 },
    );

  let voice = typeof body.voice === "string" ? body.voice : "";
  try {
    const voices = await listVoices();
    if (!voices.some((v) => v.id === voice)) voice = voices[0]?.id ?? "";
  } catch {
    return Response.json({ error: "No se pudo conectar con el servicio de voces. Probá de nuevo." }, { status: 502 });
  }
  if (!voice) return Response.json({ error: "No hay voces disponibles." }, { status: 503 });

  const guard = await guardAi(Math.max(1, Math.ceil(chars / CHARS_PER_CREDIT)));
  if (guard instanceof Response) return guard;

  try {
    const audios: string[] = [];
    for (let i = 0; i < texts.length; i++) {
      if (!texts[i]) {
        audios.push("");
        continue;
      }
      // the neighbouring lines keep the intonation natural: in a dialogue, what the others just said
      const previous = contexts ? contexts[i]?.previous : texts.slice(Math.max(0, i - 2), i).join(" ") || undefined;
      const next = contexts ? contexts[i]?.next : texts.slice(i + 1, i + 3).join(" ") || undefined;
      const speak = (model: string) => {
        const tags = isExpressiveModel(model) ? stageToTags(stages[i] ?? "") : [];
        return fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`, {
          method: "POST",
          headers: { "xi-api-key": KEY()!, "content-type": "application/json", accept: "audio/mpeg" },
          body: JSON.stringify({
            text: tags.length ? `${tags.map((t) => `[${t}]`).join(" ")} ${texts[i]}` : texts[i],
            model_id: model,
            previous_text: previous,
            next_text: next,
            voice_settings: isExpressiveModel(model)
              ? { stability: 0.5, similarity_boost: 0.8, use_speaker_boost: true }
              : { stability: 0.45, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true },
          }),
        });
      };
      let r = await speak(expressive ? EXPRESSIVE_MODEL() : MODEL());
      // the expressive model may not be enabled for the account: the line still gets the usual voice
      if (!r.ok && expressive && r.status !== 401 && EXPRESSIVE_MODEL() !== MODEL()) {
        console.error("ElevenLabs (modelo expresivo)", r.status, (await r.text().catch(() => "")).slice(0, 300));
        r = await speak(MODEL());
      }
      if (!r.ok) {
        const detail = await r.text().catch(() => "");
        console.error("ElevenLabs", r.status, detail.slice(0, 300));
        const msg =
          r.status === 401
            ? "La clave de ElevenLabs no es válida."
            : /quota|credits/i.test(detail)
              ? "Se terminó el saldo de voces del servicio. Avisale al administrador."
              : `El servicio de voces respondió con un error (${r.status}).`;
        return Response.json({ error: msg }, { status: 502 });
      }
      audios.push(Buffer.from(await r.arrayBuffer()).toString("base64"));
    }
    return Response.json({ audios, usage: guard.usage });
  } catch {
    return Response.json({ error: "No se pudo generar la voz. Probá de nuevo." }, { status: 502 });
  }
}
