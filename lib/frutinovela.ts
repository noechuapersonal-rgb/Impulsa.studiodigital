"use client";

import { idbPut, MEDIA, persistStorage } from "./idb";
import { addGeneratedMusic, probeFile } from "./media";
import { getPlayer } from "./player";
import { subtitleStyle, uid } from "./project";
import { SFX_INFO } from "./sfx";
import { store } from "./store";
import {
  guessLang,
  speakable,
  synthesize,
  synthesizePremium,
  tidy,
  toWav,
  trim,
  voiceInfo,
  type Out,
  type VoiceLang,
} from "./tts";
import type { AudioItem, Cue, Effect, EffectType, Motion, Overlay, Project, SfxName } from "./types";

/**
 * Frutinovelas: short telenovelas starring fruits. The user writes the script ("FRUTILLA: ¡No puede ser!"),
 * uploads a photo of each fruit and picks its voice; this builds the whole video: one shot per line with the
 * photo of whoever is talking, their name, the voice, subtitles, dramatic zooms and sounds, title and
 * "continuará" cards and original music underneath.
 */

// ---------- script ----------

export type Beat =
  | { kind: "title"; text: string }
  | { kind: "scene"; text: string }
  | { kind: "line"; who: string; text: string; stage: string; tags: string[] }
  | { kind: "end"; text: string };

export interface ParsedScript {
  title: string;
  beats: Beat[];
  /** characters in order of appearance: key → name as written */
  characters: { key: string; name: string; lines: number }[];
  /** lines that are not dialogue (descriptions), not read aloud */
  skipped: number;
}

export const TAGS = ["drama", "boom", "temblor", "zoom", "flash", "pausa"] as const;

/** "Banana Ricardo", "BANANA RICARDO" and "banana ricardo" are the same character. */
export const charKey = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const titleCase = (s: string) =>
  s === s.toUpperCase() ? s.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_m, a, b) => a + b.toUpperCase()) : s;

/** Removes markdown and decorations people paste from chats ("**RICARDO:** —Hola", "> texto", "- texto"). */
const clean = (s: string) =>
  s
    .replace(/\*\*|__|`/g, "")
    .replace(/^\s*(?:>+|[-•·]+|\d+[.)])\s*/, "")
    .trim();

export function parseScript(src: string): ParsedScript {
  const beats: Beat[] = [];
  const chars = new Map<string, { key: string; name: string; lines: number }>();
  let title = "";
  let skipped = 0;
  for (const raw of src.split(/\r?\n/)) {
    const heading = /^\s*(#{1,6})\s*(.+)$/.exec(raw);
    const line = clean(heading ? heading[2] : raw).replace(/^[*_]+|[*_]+$/g, "").trim();
    if (!line) continue;
    if (/^[-=_*]{3,}$/.test(line)) continue;
    if (/^(continuar[aá]|fin\b|the end)/i.test(line)) {
      beats.push({ kind: "end", text: line.replace(/\.*$/, "...").toUpperCase() });
      continue;
    }
    if (/^(escena|cap[ií]tulo|episodio)\b/i.test(line)) {
      beats.push({ kind: "scene", text: line.replace(/[.:]$/, "") });
      continue;
    }
    if (heading) {
      // the first heading is the name of the novela, the others are scene cards
      if (!title && !beats.length) {
        title = line.replace(/[“”"]/g, "");
        beats.push({ kind: "title", text: title });
      } else beats.push({ kind: "scene", text: line });
      continue;
    }
    // NAME: text  ·  NAME (enojada): text  ·  NAME — text
    const m = /^([\p{L}][\p{L}\p{N} '’-]{0,38}?)\s*(\([^)]*\))?\s*[:：]\s*(.+)$/u.exec(line);
    if (m && /^t[ií]tulo$/i.test(m[1].trim())) {
      if (!title) {
        title = m[3].replace(/[“”"*]/g, "").trim();
        beats.unshift({ kind: "title", text: title });
      }
      continue;
    }
    // a name has at most 4 words ("Doña Agria", "Banana Ricardo"); anything else is a description
    if (!m || m[1].trim().split(/\s+/).length > 4 || /^(personajes?|nota|lugar|interior|exterior|acotaci[oó]n)$/i.test(m[1].trim())) {
      skipped++;
      continue;
    }
    const name = titleCase(m[1].trim());
    let text = m[3].trim();
    const stages: string[] = m[2] ? [m[2].slice(1, -1)] : [];
    text = text.replace(/\(([^)]*)\)/g, (_x, a) => {
      stages.push(a);
      return " ";
    });
    const tags: string[] = [];
    text = text.replace(/\[([^\]]+)\]/g, (_x, a: string) => {
      const t = charKey(a);
      if ((TAGS as readonly string[]).includes(t)) tags.push(t);
      return " ";
    });
    text = text
      .replace(/^[—–-]\s*/, "")
      .replace(/[*_]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) continue;
    const key = charKey(name);
    if (!key) continue;
    const c = chars.get(key) ?? { key, name, lines: 0 };
    c.lines++;
    chars.set(key, c);
    beats.push({ kind: "line", who: key, text, stage: stages.join(", ").trim(), tags });
  }
  return { title, beats, characters: [...chars.values()], skipped };
}

// ---------- cast ----------

export interface CastMember {
  /** image asset with the fruit's photo */
  assetId?: string;
  /** "free" = basic voice in the browser; otherwise a natural voice id */
  voice: string;
  /** 0.7 (grave) … 1.5 (ardilla). Changes pitch and speed together, like a cartoon voice. */
  pitch: number;
  color: string;
}

export const NAME_COLORS = ["#e11d48", "#f59e0b", "#22c55e", "#a855f7", "#0ea5e9", "#f97316", "#ec4899", "#84cc16"];
/** different default pitch per character so they don't all sound the same with one voice */
export const DEFAULT_PITCHES = [1, 1.15, 0.9, 1.3, 0.8, 1.5, 1.15, 0.9];

export const PITCHES = [
  { v: 0.8, label: "Muy grave" },
  { v: 0.9, label: "Grave" },
  { v: 1, label: "Normal" },
  { v: 1.15, label: "Aguda" },
  { v: 1.3, label: "Muy aguda" },
  { v: 1.5, label: "Ardilla" },
];

export const SAMPLE_SCRIPT = `# Corazón de Frutilla

Escena 1: El mercado
FRUTILLA: ¡Hola! Soy nueva en la frutera. ¿Alguien sabe dónde queda el cajón de las frutas dulces?
BANANA: Nunca vi una frutilla tan... roja.
FRUTILLA: (se sonroja) Es mi color natural.

Escena 2: La heladera, de noche
LIMÓN: (furiosa) Mi hijo no se va a casar con una fruta de estación. [temblor]
BANANA: ¡Mamá! ¡Yo la amo! [zoom]
LIMÓN: Sobre mi cáscara. [boom]

Escena 3: El secreto
KIWI: (susurrando) Si Frutilla supiera lo que vi anoche...
FRUTILLA: ¿Qué viste, Kiwi? ¡Decime!
KIWI: A Banana... abrazado a una Mandarina. [drama]

CONTINUARÁ...`;

// ---------- audio ----------

/** Resamples to `toRate` and shifts the pitch (pitch > 1: higher and faster). */
function resample(a: Float32Array, fromRate: number, toRate: number, pitch: number): Float32Array {
  const step = (fromRate / toRate) * pitch;
  const n = Math.max(1, Math.floor(a.length / step));
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = i * step;
    const j = Math.floor(x);
    const f = x - j;
    out[i] = (a[j] ?? 0) * (1 - f) + (a[j + 1] ?? a[j] ?? 0) * f;
  }
  return out;
}

/** Splits the lines of one voice in requests the voice service accepts (≤ 60 lines, ≤ 2500 letters). */
function batches(texts: string[]) {
  const out: number[][] = [];
  let cur: number[] = [];
  let chars = 0;
  texts.forEach((t, i) => {
    if (cur.length && (cur.length >= 60 || chars + t.length > 2500)) {
      out.push(cur);
      cur = [];
      chars = 0;
    }
    cur.push(i);
    chars += t.length;
  });
  if (cur.length) out.push(cur);
  return out;
}

async function voiceLines(
  lines: { who: string; text: string; stage: string }[],
  cast: Record<string, CastMember>,
  lang: VoiceLang,
): Promise<Float32Array[]> {
  const RATE = 44100;
  const premiumOk = (await voiceInfo()).premium;
  const out: Float32Array[] = new Array(lines.length);
  // one request per voice: every character with the same voice is generated together
  const byVoice = new Map<string, number[]>();
  lines.forEach((l, i) => {
    const v = premiumOk ? (cast[l.who]?.voice ?? "free") : "free";
    byVoice.set(v, [...(byVoice.get(v) ?? []), i]);
  });
  // the conversation around each line (whoever says it), so the voice answers with the right intonation
  const said = lines.map((l) => tidy(l.text));
  const context = (i: number) => ({
    previous: said.slice(Math.max(0, i - 2), i).join(" ") || undefined,
    next: said.slice(i + 1, i + 3).join(" ") || undefined,
  });
  for (const [voice, idx] of byVoice) {
    const premium = voice !== "free";
    const texts = idx.map((i) => (premium ? said[i] : speakable(lines[i].text, lang)));
    for (const part of batches(texts)) {
      const res: Out[] = premium
        ? await synthesizePremium(
            part.map((k) => texts[k]),
            voice,
            {
              contexts: part.map((k) => context(idx[k])),
              stages: part.map((k) => lines[idx[k]].stage),
              expressive: true,
            },
          )
        : await synthesize(part.map((k) => texts[k]), lang);
      part.forEach((k, j) => {
        const i = idx[k];
        const r = res[j];
        const pitch = cast[lines[i].who]?.pitch ?? 1;
        out[i] = r?.audio.length ? resample(trim(r.audio, r.sampling_rate), r.sampling_rate, RATE, pitch) : new Float32Array(0);
      });
    }
  }
  return out;
}

// ---------- build ----------

export interface NovelaOptions {
  music: "emotiva" | "chill" | "energetica" | "corporativa" | "none";
  effects: boolean;
  subtitles: boolean;
}

/** photo fills the whole frame when its shape is close to the video's, otherwise it goes over a blurred copy */
function fillFor(assetId: string, W: number, H: number): "cover" | "contain" {
  const a = store.asset(assetId);
  if (!a?.width || !a?.height) return "contain";
  const r = a.width / a.height / (W / H);
  return r > 0.8 && r < 1.25 ? "cover" : "contain";
}

export async function buildFrutinovela(script: string, cast: Record<string, CastMember>, opts: NovelaOptions) {
  const parsed = parseScript(script);
  const lines = parsed.beats.filter((b): b is Extract<Beat, { kind: "line" }> => b.kind === "line");
  if (!lines.length)
    throw new Error('No encontré diálogos. Escribí cada línea así: "FRUTILLA: ¡Hola!" (nombre, dos puntos y lo que dice).');
  const names = new Map(parsed.characters.map((c) => [c.key, c.name]));
  const missing = parsed.characters.filter((c) => !cast[c.key]?.assetId || !store.asset(cast[c.key].assetId));
  if (missing.length)
    throw new Error(`Falta la foto de: ${missing.map((c) => c.name).join(", ")}.`);
  if (lines.length > 150) throw new Error("El guion es muy largo: el máximo es 150 líneas de diálogo por capítulo.");

  const lang = guessLang(lines.map((l) => l.text).join(" "));
  store.set({ busy: "Generando las voces de los personajes…" });
  let audios: Float32Array[];
  try {
    audios = await voiceLines(lines, cast, lang);
  } catch (e) {
    store.set({ busy: null });
    throw e;
  }

  try {
    store.set({ busy: "Armando el capítulo…" });
    const RATE = 44100;
    // one audio file with every line, normalized together
    const gapS = Math.round(RATE * 0.1);
    const total = audios.reduce((n, a) => n + a.length + gapS, 0);
    const mix = new Float32Array(Math.max(1, total));
    const offsets: number[] = [];
    let pos = 0;
    let peak = 0;
    for (const a of audios) {
      offsets.push(pos / RATE);
      mix.set(a, pos);
      pos += a.length + gapS;
      for (let i = 0; i < a.length; i++) peak = Math.max(peak, Math.abs(a[i]));
    }
    if (peak > 0) for (let i = 0; i < mix.length; i++) mix[i] *= 0.95 / peak;
    const title = parsed.title || "Frutinovela";
    const file = new File([toWav(mix, RATE)], `Voces - ${title}.wav`, { type: "audio/wav" });
    const voiceAsset = await probeFile(file, undefined, "audio", `Voces · ${title}`);
    if (!voiceAsset) throw new Error("No se pudo crear el audio de las voces.");
    await getPlayer()?.addAsset(voiceAsset);
    store.set((s) => ({ assets: [...s.assets, voiceAsset] }));
    idbPut(MEDIA, voiceAsset.id, file).catch(() => undefined);
    persistStorage();

    const W = 720;
    const H = 1280;
    const overlays: Overlay[] = [];
    const audio: AudioItem[] = [];
    const cues: Cue[] = [];
    const effects: Effect[] = [];
    const motions: Motion[] = [];
    const sfx = (name: SfxName, at: number, volume = 0.7) =>
      audio.push({
        id: uid(),
        kind: "sfx",
        sfx: name,
        name: SFX_INFO[name].label,
        start: Math.max(0, at),
        duration: SFX_INFO[name].duration,
        offset: 0,
        volume,
        fadeIn: 0,
        fadeOut: 0,
        loop: false,
      });
    const fx = (type: EffectType, start: number, end: number, intensity = 0.7) => {
      if (opts.effects) effects.push({ id: uid(), type, start, end, intensity });
    };
    const card = (text: string, start: number, end: number, y = 0.5, size = 1) =>
      motions.push({ id: uid(), type: "titulo_animado", start, end, x: 0.5, y, size, text, color: "#ffffff", accent: "#e11d48" });

    let t = 0;
    let li = 0;
    let lastWho = "";
    let lastPhoto: Overlay | null = null;
    for (const b of parsed.beats) {
      if (b.kind === "title") {
        // "Corazón de *Frutilla*": the last word in the accent color
        const words = b.text.split(/\s+/);
        const txt = words.length > 1 ? `${words.slice(0, -1).join(" ")} *${words[words.length - 1]}*` : `*${b.text}*`;
        card(txt, t, t + 2.8, 0.5, 1.15);
        sfx("boom", t + 0.15, 0.8);
        fx("zoom_entrada", t, t + 0.6, 0.8);
        t += 2.8;
        lastWho = "";
        lastPhoto = null;
      } else if (b.kind === "scene") {
        card(b.text, t, t + 1.8, 0.5, 0.8);
        sfx("whoosh", Math.max(0, t - 0.1), 0.5);
        fx("barrido", t, t + 0.45, 0.8);
        t += 1.8;
        lastWho = "";
        lastPhoto = null;
      } else if (b.kind === "end") {
        // the last shot stays, in black and white, under the card
        const start = t;
        const end = t + 3.2;
        if (lastPhoto) overlays.push({ ...lastPhoto, id: uid(), start, end, animation: "none" });
        fx("blanco_negro", start, end, 1);
        fx("vineta", start, end, 1);
        fx("zoom", start, end, 0.6);
        card(b.text, start + 0.2, end, 0.5, 1.1);
        sfx("boom", start + 0.2, 0.9);
        t = end;
        lastWho = "";
      } else {
        const a = audios[li];
        const dur = Math.max(0.6, a.length / 44100);
        const extra = b.tags.includes("pausa") ? 1 : 0;
        const drama = b.tags.includes("drama");
        const start = t;
        const end = start + dur;
        const shotEnd = end + 0.3 + extra + (drama ? 1.3 : 0);
        const m = cast[b.who];
        const photo: Overlay = {
          id: uid(),
          kind: "image",
          assetId: m.assetId,
          start,
          end: shotEnd,
          x: 0.5,
          y: 0.5,
          size: 1,
          animation: "none",
          fill: fillFor(m.assetId!, W, H),
        };
        overlays.push(photo);
        lastPhoto = photo;
        // name of who is talking
        overlays.push({
          id: uid(),
          kind: "text",
          text: names.get(b.who) ?? b.who,
          preset: "etiqueta",
          color: m.color,
          start,
          end: shotEnd,
          x: 0.5,
          y: 0.1,
          size: 1.5,
          animation: b.who === lastWho ? "none" : "pop",
        });
        audio.push({
          id: uid(),
          kind: "voice",
          assetId: voiceAsset.id,
          name: `${names.get(b.who) ?? b.who}: ${b.text}`.slice(0, 40),
          start,
          duration: dur,
          offset: offsets[li],
          volume: 1,
          fadeIn: 0,
          fadeOut: 0,
          loop: false,
        });
        if (opts.subtitles) {
          const words = b.text.split(/\s+/).filter(Boolean);
          const chunks: string[] = [];
          for (let i = 0; i < words.length; i += 4) chunks.push(words.slice(i, i + 4).join(" "));
          const chars = chunks.reduce((n, c) => n + c.length + 1, 0);
          let ct = start;
          for (const ch of chunks) {
            const d = ((ch.length + 1) / chars) * dur;
            cues.push({ id: uid(), start: ct, end: ct + d, text: ch });
            ct += d;
          }
        }
        // drama: cuts, shouts and explicit [tags]
        const stage = charKey(b.stage);
        const angry = /grit|enoj|furi|indign|explot/.test(stage);
        if (b.who !== lastWho && lastWho) fx("zoom_entrada", start, start + 0.35, 0.5);
        if (b.tags.includes("zoom") || /!\s*$/.test(b.text) || angry) fx("zoom", start + dur * 0.3, shotEnd, 0.55);
        if (b.tags.includes("temblor") || angry) fx("temblor", start, start + Math.min(0.8, dur), 0.6);
        if (b.tags.includes("boom")) {
          sfx("boom", end - 0.1, 0.8);
          fx("temblor", end - 0.1, end + 0.5, 0.5);
        }
        if (b.tags.includes("flash")) {
          fx("flash", start, start + 0.3, 0.9);
          sfx("ding", start, 0.5);
        }
        if (drama) {
          // the classic triple zoom of the telenovelas: dun, dun, DUN
          const d0 = end + 0.1;
          sfx("riser", Math.max(0, d0 - 0.5), 0.5);
          sfx("boom", d0, 0.9);
          if (opts.effects) {
            effects.push({ id: uid(), type: "zoom", start: d0, end: d0 + 0.45, intensity: 0.35 });
            effects.push({ id: uid(), type: "zoom", start: d0 + 0.45, end: d0 + 0.9, intensity: 0.7 });
            effects.push({ id: uid(), type: "zoom", start: d0 + 0.9, end: shotEnd, intensity: 1 });
            effects.push({ id: uid(), type: "vineta", start: d0, end: shotEnd, intensity: 0.8 });
          }
        }
        t = shotEnd;
        lastWho = b.who;
        li++;
      }
    }

    store.edit((p): Project => ({
      ...p,
      aspect: "9:16",
      fit: "blur",
      clips: [],
      overlays,
      audio,
      cues,
      effects,
      motions,
      styleId: undefined,
      background: { style: "luces", colors: ["#1a0610", "#e11d48"] },
      subtitleStyle: { ...subtitleStyle("viral"), position: "bottom", fontSize: 54, wordsPerCue: 4 },
    }));
    store.set({ projectName: title, selection: null });

    if (opts.music !== "none") {
      try {
        await addGeneratedMusic({ style: opts.music, volume: 0.16, align: false });
      } catch {
        store.set({ toast: "El video quedó listo, pero no se pudo componer la música." });
      }
    }
    getPlayer()?.seek(0);
    return { duration: t, lines: lines.length, characters: parsed.characters.length };
  } finally {
    store.set({ busy: null });
  }
}

/** Adds a photo for a character (kept on the device like every other file). */
export async function addCharacterPhoto(file: File) {
  const a = await probeFile(file, undefined, "image");
  if (!a) throw new Error(`No se pudo leer ${file.name}.`);
  await getPlayer()?.addAsset(a);
  store.set((s) => ({ assets: [...s.assets, a] }));
  idbPut(MEDIA, a.id, file).catch(() => undefined);
  persistStorage();
  return a;
}
