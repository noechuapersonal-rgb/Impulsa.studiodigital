"use client";

import { probeFile, transcribeAsset } from "./media";
import { fmt, uid } from "./project";
import { analyzeVideo } from "./references";
import { store } from "./store";
import type { Segment } from "./types";

/**
 * A reference video attached in the chat ("make mine like this one"): the AI receives its frames,
 * the moments where it cuts and what is said, so it can copy the structure onto the client's video.
 */
export interface ChatReference {
  name: string;
  thumb: string;
  duration: number;
  aspect: string;
  cutTimes: number[];
  changes: number[];
  frames: { t: number; data: string }[];
  transcript: Segment[];
}

export async function prepareChatReference(file: File): Promise<ChatReference> {
  if (!file.type.startsWith("video/") && !/\.(mp4|mov|webm|m4v|mkv)$/i.test(file.name))
    throw new Error("Elegí un archivo de video (MP4, MOV o WebM).");
  store.set({ busy: "Mirando el video de referencia…" });
  try {
    const a = await analyzeVideo(
      file,
      (p) => store.set({ busy: `Mirando el video de referencia… ${Math.round(p * 100)}%` }),
      { frames: 15, size: 380, smartFrames: true },
    );
    // what is said / sung in the reference (its words and timing are part of the format)
    let transcript: Segment[] = [];
    try {
      const asset = await probeFile(file, `ref-${uid()}`, "audio", file.name);
      if (asset) transcript = await transcribeAsset(asset, {});
    } catch {
      /* silent video or unreadable audio: frames are enough */
    }
    return {
      name: file.name,
      thumb: a.thumb,
      duration: a.duration,
      aspect: a.aspect,
      cutTimes: a.cutTimes,
      changes: a.changes,
      frames: a.frames,
      transcript,
    };
  } finally {
    store.set({ busy: null });
  }
}

/** Content blocks describing the reference, to put before the client's instruction. */
export function referenceBlocks(r: ChatReference) {
  const blocks: (
    | { type: "text"; text: string }
    | { type: "image"; source: { type: "base64"; media_type: "image/jpeg"; data: string } }
  )[] = [
    {
      type: "text",
      text: [
        `<video_de_referencia nombre="${r.name.replace(/"/g, "'")}">`,
        "El cliente adjuntó este video como REFERENCIA. No es parte de su proyecto: es el modelo a seguir.",
        `Duración ${r.duration.toFixed(1)} s · formato ${r.aspect} · ${r.cutTimes.length} cambios de escena${
          r.cutTimes.length ? ` en: ${r.cutTimes.slice(0, 60).map((t) => t.toFixed(1)).join(", ")} s` : ""
        }.`,
        r.changes.length
          ? `Momentos en que cambia algo en pantalla (aparece un texto, una tarjeta, un número…): ${r.changes
              .slice(0, 80)
              .map((t) => t.toFixed(1))
              .join(", ")} s. Úsalos para el ritmo: en tu video, algo nuevo debería pasar con una frecuencia parecida.`
          : "",
        r.transcript.length
          ? `Lo que se dice o canta (con tiempos):\n${r.transcript.map((s) => `[${fmt(s.start)}–${fmt(s.end)}] ${s.text}`).join("\n")}`
          : "No se detectó voz en la referencia.",
        "Fotogramas de la referencia (segundo del video de referencia):",
      ]
        .filter(Boolean)
        .join("\n"),
    },
  ];
  for (const f of r.frames) {
    blocks.push({ type: "text", text: `Referencia, segundo ${f.t.toFixed(1)}:` });
    blocks.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: f.data } });
  }
  blocks.push({ type: "text", text: "</video_de_referencia>" });
  return blocks;
}

export const DEFAULT_REFERENCE_PROMPT =
  "Editá mi video siguiendo este video de referencia: la misma estructura, ritmo, tipo de textos y subtítulos, adaptado a mi contenido.";
