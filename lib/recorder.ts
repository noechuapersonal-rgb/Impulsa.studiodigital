"use client";

import { idbPut, MEDIA, persistStorage } from "./idb";
import { probeFile, transcribeAsset, WHISPER_MODELS } from "./media";
import { getPlayer } from "./player";
import { contentDuration, segmentsToWords, uid } from "./project";
import { store } from "./store";
import type { Cue } from "./types";

/**
 * "Grabar voz": records the microphone while the video plays from the playhead, so the voice is in
 * sync with what is on screen. The recording is added as a "Voz" item on the timeline.
 */

export interface RecordOptions {
  /** what to do with the sound of the clips under the new voice */
  original: "mantener" | "bajar" | "silenciar";
  /** hear the video while recording (needs headphones, or the mic picks it up) */
  listen: boolean;
  /** create subtitles from what was said */
  subtitles: boolean;
}

interface Session {
  stream: MediaStream;
  rec: MediaRecorder;
  chunks: Blob[];
  from: number;
  startedAt: number;
  opts: RecordOptions;
  unsubscribe: () => void;
  done: Promise<void>;
  stop: () => void;
}

let session: Session | null = null;
let count = 0;

export const isRecording = () => !!session;

function pickMime() {
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  return types.find((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) ?? "";
}

export async function startRecording(
  opts: RecordOptions,
  onTick?: (secs: number) => void,
  onAutoStop?: (p: Promise<void>) => void,
): Promise<void> {
  if (session) return;
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined")
    throw new Error("Este navegador no permite grabar audio. Probá con Chrome, Edge o Safari actualizados.");
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch (e) {
    const name = (e as DOMException)?.name;
    throw new Error(
      name === "NotAllowedError" || name === "SecurityError"
        ? "No diste permiso para usar el micrófono. Tocá el candado de la barra de direcciones, permití el micrófono y probá de nuevo."
        : name === "NotFoundError"
          ? "No encontramos un micrófono conectado."
          : "No se pudo usar el micrófono.",
    );
  }
  const mime = pickMime();
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);

  const player = getPlayer();
  const from = store.get().time;
  let resolveDone!: () => void;
  const done = new Promise<void>((r) => (resolveDone = r));
  rec.onstop = () => resolveDone();

  const stop = () => {
    if (rec.state !== "inactive") rec.stop();
    player?.pause();
  };

  // stop by itself when the video reaches the end (or playback is paused)
  let wasPlaying = false;
  const unsubscribe = store.subscribe(() => {
    const p = store.get().playing;
    if (wasPlaying && !p && session?.rec === rec) onAutoStop?.(stopRecording());
    wasPlaying = p;
  });

  rec.start(250);
  const startedAt = performance.now();
  session = { stream, rec, chunks, from, startedAt, opts, unsubscribe, done, stop };
  if (player && contentDuration(store.get().project) > 0) {
    if (player.monitor && !opts.listen) player.monitor.gain.value = 0;
    player.play();
  }
  const tick = () => {
    if (!session) return;
    onTick?.((performance.now() - startedAt) / 1000);
    requestAnimationFrame(tick);
  };
  tick();
}

export function cancelRecording() {
  if (!session) return;
  const s = session;
  session = null;
  s.unsubscribe();
  s.stop();
  s.stream.getTracks().forEach((t) => t.stop());
  const m = getPlayer()?.monitor;
  if (m) m.gain.value = 1;
}

/** Stops and adds the recording to the timeline. */
export async function stopRecording(): Promise<void> {
  if (!session) return;
  const s = session;
  session = null;
  s.unsubscribe();
  s.stop();
  await s.done;
  s.stream.getTracks().forEach((t) => t.stop());
  const player = getPlayer();
  if (player?.monitor) player.monitor.gain.value = 1;

  const type = s.rec.mimeType || s.chunks[0]?.type || "audio/webm";
  const blob = new Blob(s.chunks, { type });
  if (blob.size < 2000) throw new Error("La grabación quedó vacía. Revisá el micrófono y probá de nuevo.");
  const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
  const name = `Voz grabada ${++count}`;
  const file = new File([blob], `${name}.${ext}`, { type });

  store.set({ busy: "Guardando tu voz…" });
  try {
    const asset = await probeFile(file, undefined, "audio", name);
    if (!asset) throw new Error("No se pudo leer la grabación.");
    // some browsers report the length of a fresh webm as Infinity/0: use the time we recorded
    const recorded = (performance.now() - s.startedAt) / 1000;
    if (!isFinite(asset.duration) || asset.duration <= 0) asset.duration = recorded;
    await player?.addAsset(asset);
    store.set((st) => ({ assets: [...st.assets, asset] }));
    idbPut(MEDIA, asset.id, file).catch(() => undefined);
    persistStorage();

    const id = uid();
    const dur = Math.max(0.2, asset.duration);
    const { original } = s.opts;
    store.edit((p) => ({
      ...p,
      clips:
        original === "mantener"
          ? p.clips
          : p.clips.map((c) => ({ ...c, volume: original === "silenciar" ? 0 : Math.min(c.volume, 0.25) })),
      audio: [
        ...p.audio.map((a) => (original !== "mantener" && a.kind === "music" ? { ...a, volume: Math.min(a.volume, 0.2) } : a)),
        {
          id,
          kind: "voice" as const,
          assetId: asset.id,
          name,
          start: s.from,
          duration: dur,
          offset: 0,
          volume: 1,
          fadeIn: 0,
          fadeOut: 0,
          loop: false,
        },
      ],
    }));
    store.set({ selection: { kind: "audio", id } });

    if (s.opts.subtitles) {
      const segs = await transcribeAsset(asset, { model: WHISPER_MODELS.equilibrado });
      const wpc = Math.max(1, store.get().project.subtitleStyle.wordsPerCue || 3);
      const words = segmentsToWords(segs).filter((w) => w.start < dur);
      const cues: Cue[] = [];
      for (let i = 0; i < words.length; i += wpc) {
        const g = words.slice(i, i + wpc);
        cues.push({
          id: uid(),
          start: s.from + g[0].start,
          end: s.from + Math.min(dur, g[g.length - 1].end),
          text: g.map((w) => w.text).join(" "),
        });
      }
      if (cues.length) {
        const a = cues[0].start;
        const b = cues[cues.length - 1].end;
        store.edit((p) => ({
          ...p,
          cues: [...p.cues.filter((c) => c.end <= a || c.start >= b), ...cues].sort((x, y) => x.start - y.start),
        }));
      }
      store.set({
        toast: cues.length
          ? `Listo: tu voz quedó en la fila «Voz» con ${cues.length} líneas de subtítulos.`
          : "Listo: tu voz quedó en la fila «Voz». No se entendieron palabras para subtitular.",
      });
    } else store.set({ toast: "Listo: tu voz quedó en la fila «Voz». Podés moverla o cambiarle el volumen." });
  } finally {
    store.set({ busy: null });
  }
}
