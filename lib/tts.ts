"use client";

import { idbPut, MEDIA, persistStorage } from "./idb";
import { probeFile } from "./media";
import { getPlayer } from "./player";
import { uid } from "./project";
import { store } from "./store";
import type { AudioItem, Cue } from "./types";

/** Voice-over ("texto a voz"): reads the subtitles or a script aloud, fully in the browser. */

export type VoiceLang = "es" | "en";
export type OriginalAudio = "mantener" | "bajar" | "silenciar";

const VOICE_MODELS: Record<VoiceLang, string> = {
  es: "Xenova/mms-tts-spa",
  en: "Xenova/mms-tts-eng",
};

const isPhone = () => typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

// ---------- worker ----------

type Out = { audio: Float32Array; sampling_rate: number };
let worker: Worker | null = null;
let reqId = 0;
const pending = new Map<number, { resolve: (r: Out[]) => void; reject: (e: Error) => void }>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker("/tts-worker.js", { type: "module" });
    worker.onmessage = (e) => {
      const m = e.data;
      const p = pending.get(m.id);
      if (!p) return;
      if (m.type === "status") store.set({ busy: m.status });
      else if (m.type === "progress") {
        const pr = m.progress;
        if (pr?.status === "progress" && typeof pr.progress === "number" && /onnx/.test(pr.file ?? ""))
          store.set({ busy: `Descargando la voz (solo la primera vez)… ${Math.round(pr.progress)}%` });
      } else if (m.type === "result") {
        pending.delete(m.id);
        p.resolve(m.result);
      } else if (m.type === "error") {
        pending.delete(m.id);
        p.reject(new Error(m.error));
      }
    };
    worker.onerror = (e) => {
      const err = new Error(e.message || "No se pudo cargar la voz.");
      pending.forEach((p) => p.reject(err));
      pending.clear();
      worker = null;
    };
  }
  return worker;
}

function synthesize(texts: string[], lang: VoiceLang): Promise<Out[]> {
  const id = ++reqId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ id, texts, model: VOICE_MODELS[lang], dtype: isPhone() ? "q8" : "fp32" });
  });
}

// ---------- natural voices (ElevenLabs, through /api/tts) ----------

export type PremiumVoice = { id: string; name: string; info: string };
export type VoiceInfo = { premium: boolean; voices: PremiumVoice[]; charsPerCredit?: number };
let infoP: Promise<VoiceInfo> | null = null;

/** Which natural voices are available ({ premium: false } when the service is not configured). */
export function voiceInfo(): Promise<VoiceInfo> {
  infoP ??= fetch("/api/tts")
    .then((r) => (r.ok ? r.json() : { premium: false, voices: [] }))
    .catch(() => ({ premium: false, voices: [] }));
  return infoP;
}

/** "free" = the basic voice that runs in the browser; anything else = a natural voice id ("" = default). */
export type VoiceChoice = string;

async function synthesizePremium(texts: string[], voice: string): Promise<Out[]> {
  store.set({ busy: "Generando la voz…" });
  const r = await fetch("/api/tts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ texts, voice }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || "No se pudo generar la voz.");
  const ctx = new OfflineAudioContext(1, 1, 44100);
  return Promise.all(
    (data.audios as string[]).map(async (b64) => {
      if (!b64) return { audio: new Float32Array(0), sampling_rate: 44100 };
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const buf = await ctx.decodeAudioData(bytes.buffer);
      return { audio: new Float32Array(buf.getChannelData(0)), sampling_rate: buf.sampleRate };
    }),
  );
}

/** Light cleanup for the natural voices (they read numbers and prices on their own). */
const tidy = (t: string) =>
  t
    .replace(/#[\p{L}\p{N}_]+/gu, " ")
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

// ---------- text normalization (the voices only know letters: numbers and symbols are spelled out) ----------

const ES_UNITS = [
  "cero", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez", "once", "doce",
  "trece", "catorce", "quince", "dieciséis", "diecisiete", "dieciocho", "diecinueve", "veinte", "veintiuno",
  "veintidós", "veintitrés", "veinticuatro", "veinticinco", "veintiséis", "veintisiete", "veintiocho", "veintinueve",
];
const ES_TENS = ["", "", "", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"];
const ES_HUNDREDS = [
  "", "ciento", "doscientos", "trescientos", "cuatrocientos", "quinientos", "seiscientos", "setecientos",
  "ochocientos", "novecientos",
];

function es999(n: number): string {
  if (n === 100) return "cien";
  const h = Math.floor(n / 100);
  const r = n % 100;
  const parts: string[] = [];
  if (h) parts.push(ES_HUNDREDS[h]);
  if (r) {
    if (r < 30) parts.push(ES_UNITS[r]);
    else parts.push(ES_TENS[Math.floor(r / 10)] + (r % 10 ? ` y ${ES_UNITS[r % 10]}` : ""));
  }
  return parts.join(" ");
}

export function numberToSpanish(n: number): string {
  if (!Number.isFinite(n)) return "";
  if (n < 0) return `menos ${numberToSpanish(-n)}`;
  if (n === 0) return "cero";
  if (n >= 1e12) return String(n).split("").map((d) => ES_UNITS[Number(d)]).join(" ");
  const millions = Math.floor(n / 1e6);
  const thousands = Math.floor((n % 1e6) / 1000);
  const rest = n % 1000;
  const parts: string[] = [];
  if (millions) parts.push(millions === 1 ? "un millón" : `${es999orBig(millions)} millones`);
  if (thousands) parts.push(thousands === 1 ? "mil" : `${apocope(es999(thousands))} mil`);
  if (rest) parts.push(es999(rest));
  return parts.join(" ");
}
/** "veintiuno mil" -> "veintiún mil", "treinta y uno mil" -> "treinta y un mil" */
const apocope = (s: string) => s.replace(/veintiuno$/, "veintiún").replace(/uno$/, "un");
const es999orBig = (n: number) => apocope(n < 1000 ? es999(n) : numberToSpanish(n));

const EN_SMALL = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve",
  "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen",
];
const EN_TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
function en999(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  const parts: string[] = [];
  if (h) parts.push(`${EN_SMALL[h]} hundred`);
  if (r) parts.push(r < 20 ? EN_SMALL[r] : EN_TENS[Math.floor(r / 10)] + (r % 10 ? ` ${EN_SMALL[r % 10]}` : ""));
  return parts.join(" ");
}
export function numberToEnglish(n: number): string {
  if (!Number.isFinite(n)) return "";
  if (n === 0) return "zero";
  if (n >= 1e12) return String(n).split("").map((d) => EN_SMALL[Number(d)]).join(" ");
  const scales: [number, string][] = [
    [1e9, "billion"],
    [1e6, "million"],
    [1e3, "thousand"],
  ];
  const parts: string[] = [];
  let r = n;
  for (const [v, w] of scales)
    if (r >= v) {
      parts.push(`${en999(Math.floor(r / v))} ${w}`);
      r %= v;
    }
  if (r) parts.push(en999(r));
  return parts.join(" ");
}

/** Turns a subtitle / script line into something the voice can read. */
export function speakable(text: string, lang: VoiceLang): string {
  const word = lang === "es" ? numberToSpanish : numberToEnglish;
  let t = ` ${text} `;
  // 15.000 / 15,000 -> 15000 (thousands separators)
  t = t.replace(/(\d{1,3})(?:[.,](\d{3}))+(?!\d)/g, (m) => m.replace(/[.,]/g, ""));
  // money
  t = t.replace(/(?:US)?\$\s?(\d+)(?:[.,](\d{1,2}))?/gi, (_m, a, b) => {
    const cur = /US\$/i.test(_m) ? (lang === "es" ? "dólares" : "dollars") : lang === "es" ? "pesos" : "dollars";
    return `${a}${b ? `${lang === "es" ? " con " : " and "}${b}` : ""} ${cur}`;
  });
  t = t.replace(/(\d+)\s?%/g, (_m, a) => `${a} ${lang === "es" ? "por ciento" : "percent"}`);
  // decimals: 1,5 -> uno coma cinco
  t = t.replace(/(\d+)[.,](\d+)/g, (_m, a, b) => `${a} ${lang === "es" ? "coma" : "point"} ${b}`);
  // ordinals / "x2" / "2x1"
  t = t.replace(/(\d+)\s?x\s?(\d+)/gi, (_m, a, b) => `${a} ${lang === "es" ? "por" : "for"} ${b}`);
  t = t.replace(/\d+/g, (d) => ` ${word(Number(d))} `);
  t = t
    .replace(/&/g, lang === "es" ? " y " : " and ")
    .replace(/@/g, lang === "es" ? " arroba " : " at ")
    .replace(/\+/g, lang === "es" ? " más " : " plus ")
    .replace(/#[\p{L}\p{N}_]+/gu, " ")
    // emojis and other symbols
    .replace(/[^\p{L}\p{M}\s.,;:!?¡¿'’-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return t;
}

/** Spanish unless the text clearly looks English. */
export function guessLang(text: string): VoiceLang {
  const words = text.toLowerCase().match(/\p{L}+/gu) ?? [];
  const en = new Set(["the", "and", "you", "your", "is", "are", "this", "that", "with", "for", "to", "of", "it", "my", "we", "what", "how"]);
  const es = new Set(["el", "la", "los", "las", "y", "que", "de", "en", "un", "una", "es", "con", "para", "por", "tu", "mi", "como", "qué"]);
  let a = 0;
  let b = 0;
  for (const w of words) {
    if (en.has(w)) a++;
    if (es.has(w)) b++;
  }
  return a > b * 1.5 && a >= 2 ? "en" : "es";
}

// ---------- audio helpers ----------

function toWav(samples: Float32Array, rate: number): File {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + samples.length * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new File([buf], "voz.wav", { type: "audio/wav" });
}

/** Cuts leading/trailing near-silence so lines start right on time. */
function trim(a: Float32Array, rate: number): Float32Array {
  const th = 0.01;
  let s = 0;
  let e = a.length;
  while (s < e && Math.abs(a[s]) < th) s++;
  while (e > s && Math.abs(a[e - 1]) < th) e--;
  const pad = Math.round(rate * 0.03);
  return a.subarray(Math.max(0, s - pad), Math.min(a.length, e + pad));
}

// ---------- main ----------

interface Line {
  text: string; // what is shown (subtitles)
  at: number; // desired start on the timeline
}

/**
 * Generates the voice for each line and adds it to the timeline as "Voz IA" items (one shared audio file).
 * Returns the placed items' timing so subtitles can follow the voice.
 */
async function speakLines(
  lines: Line[],
  o: { lang?: VoiceLang; original?: OriginalAudio; volume?: number; voice?: VoiceChoice; name: string; replace: boolean },
) {
  const all = lines.map((l) => l.text).join(" ");
  const lang = o.lang ?? guessLang(all);
  store.set({ busy: "Preparando la voz…" });
  try {
    // natural voice when available (and not explicitly the free one)
    const premium = o.voice !== "free" && (await voiceInfo()).premium;
    const texts = lines.map((l) => (premium ? tidy(l.text) : speakable(l.text, lang)));
    if (!texts.some(Boolean)) throw new Error("No hay texto para leer.");
    const outs = premium ? await synthesizePremium(texts, o.voice ?? "") : await synthesize(texts, lang);
    const rate = outs.find((x) => x.audio.length)?.sampling_rate ?? 16000;
    const parts = outs.map((x) => trim(x.audio, x.sampling_rate));
    // one file with every line, separated by a short silence
    const gap = Math.round(rate * 0.1);
    const total = parts.reduce((n, p) => n + p.length + gap, 0);
    const mix = new Float32Array(total);
    const offsets: number[] = [];
    let pos = 0;
    let peak = 0;
    for (const p of parts) {
      offsets.push(pos / rate);
      mix.set(p, pos);
      pos += p.length + gap;
      for (let i = 0; i < p.length; i++) peak = Math.max(peak, Math.abs(p[i]));
    }
    if (peak > 0) {
      const k = 0.95 / peak;
      for (let i = 0; i < mix.length; i++) mix[i] *= k;
    }

    const file = new File([toWav(mix, rate)], `${o.name}.wav`, { type: "audio/wav" });
    const asset = await probeFile(file, undefined, "audio", o.name);
    if (!asset) throw new Error("No se pudo crear el audio de la voz.");
    await getPlayer()?.addAsset(asset);
    store.set((s) => ({ assets: [...s.assets, asset] }));
    idbPut(MEDIA, asset.id, file).catch(() => undefined);
    persistStorage();

    const placed: { start: number; end: number; text: string }[] = [];
    const items: AudioItem[] = [];
    let prevEnd = -1;
    parts.forEach((p, i) => {
      if (!p.length) return;
      const dur = p.length / rate;
      const start = Math.max(lines[i].at, prevEnd + 0.05);
      prevEnd = start + dur;
      placed.push({ start, end: start + dur, text: lines[i].text });
      items.push({
        id: uid(),
        kind: "voice",
        assetId: asset.id,
        name: lines[i].text.slice(0, 40),
        start,
        duration: dur,
        offset: offsets[i],
        volume: o.volume ?? 1,
        fadeIn: 0,
        fadeOut: 0,
        loop: false,
      });
    });

    const original = o.original ?? "bajar";
    store.edit((p) => ({
      ...p,
      clips: original === "mantener" ? p.clips : p.clips.map((c) => ({ ...c, volume: original === "silenciar" ? 0 : Math.min(c.volume, 0.25) })),
      audio: [
        ...p.audio
          .filter((a) => !(o.replace && a.kind === "voice"))
          // background music goes under the voice
          .map((a) => (original !== "mantener" && a.kind === "music" ? { ...a, volume: Math.min(a.volume, 0.2) } : a)),
        ...items,
      ],
    }));
    return { placed, lang };
  } finally {
    store.set({ busy: null });
  }
}

/** Reads the current subtitles aloud, each line at the moment it appears. */
export async function narrateSubtitles(
  o: { lang?: VoiceLang; original?: OriginalAudio; volume?: number; voice?: VoiceChoice } = {},
) {
  const cues = [...store.get().project.cues].sort((a, b) => a.start - b.start);
  if (!cues.length) throw new Error("Primero agregá subtítulos (o escribí un texto para que la voz lo lea).");
  // join cues into phrases (the voice sounds much better reading whole sentences than 2-3 words at a time)
  const lines: Line[] = [];
  let cur: Line | null = null;
  let lastEnd = 0;
  for (const c of cues) {
    const t = c.text.trim();
    if (!t) continue;
    const joinable = cur && c.start - lastEnd < 0.35 && cur.text.length + t.length < 140 && !/[.!?]$/.test(cur.text);
    if (cur && joinable) cur.text += ` ${t}`;
    else {
      cur = { text: t, at: c.start };
      lines.push(cur);
    }
    lastEnd = c.end;
  }
  const { placed } = await speakLines(lines, { ...o, name: "Voz IA (subtítulos)", replace: true });
  return placed.length;
}

/**
 * Reads a script aloud starting at `start`. With `subtitles`, the script also becomes subtitles synced
 * to the voice (ideal for videos without talking: "faceless", product photos, b-roll).
 */
export async function narrateText(
  text: string,
  o: {
    start?: number;
    lang?: VoiceLang;
    original?: OriginalAudio;
    volume?: number;
    voice?: VoiceChoice;
    subtitles?: boolean;
  } = {},
) {
  const clean = text.trim();
  if (!clean) throw new Error("Escribí el texto que querés que lea la voz.");
  // one line per sentence
  const sentences = clean
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const at = Math.max(0, o.start ?? 0);
  const lines = sentences.map((s) => ({ text: s, at }));
  const { placed } = await speakLines(lines, { ...o, name: "Voz IA", replace: false });

  if (o.subtitles !== false) {
    const wpc = Math.max(1, store.get().project.subtitleStyle.wordsPerCue || 3);
    const cues: Cue[] = [];
    for (const pl of placed) {
      const words = pl.text.split(/\s+/).filter(Boolean);
      const chunks: string[] = [];
      for (let i = 0; i < words.length; i += wpc) chunks.push(words.slice(i, i + wpc).join(" "));
      const chars = chunks.reduce((n, c) => n + c.length + 1, 0);
      let t = pl.start;
      for (const ch of chunks) {
        const d = ((ch.length + 1) / chars) * (pl.end - pl.start);
        cues.push({ id: uid(), start: t, end: t + d, text: ch });
        t += d;
      }
    }
    store.edit((p) => ({
      ...p,
      cues: [...p.cues.filter((c) => !cues.some((n) => c.start < n.end && c.end > n.start)), ...cues].sort(
        (a, b) => a.start - b.start,
      ),
    }));
  }
  return placed.length ? placed[placed.length - 1].end : at;
}
