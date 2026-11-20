"use client";

import { useEffect, useRef, useState } from "react";
import type Anthropic from "@anthropic-ai/sdk";
import { describeProject } from "@/lib/actions";
import { executeTool, framesForAI, storyboardTimes } from "@/lib/aiExecutor";
import { photoForAI } from "@/lib/brand";
import { FORMATS, formatById } from "@/lib/formats";
import {
  DEFAULT_PHOTOS_PROMPT,
  DEFAULT_REFERENCE_PROMPT,
  prepareChatReference,
  referenceBlocks,
  type ChatReference,
} from "@/lib/chatReference";
import { imageThumb } from "@/lib/media";
import { getPlayer } from "@/lib/player";
import { contentDuration, uid } from "@/lib/project";
import { store, useEditor } from "@/lib/store";

type Msg = Anthropic.Beta.BetaMessageParam;
type Block = Anthropic.Beta.BetaContentBlock;

interface UiItem {
  role: "user" | "assistant" | "action" | "error" | "feedback";
  text: string;
  /** feedback items: what was asked, what the AI answered and did */
  fb?: { instruction: string; reply: string; actions: string[] };
}

const SUGGESTIONS = [
  "Hazlo vertical para TikTok y pon subtítulos estilo TikTok",
  "Quita los silencios y las pausas largas",
  "Añade un título llamativo en los primeros 3 segundos",
  "Pon zoom y un whoosh en los momentos más importantes",
  "Agrega la música de fondo bajita con fundido al final",
  "Haz un clip de 30 segundos con lo mejor",
  "Pon mi marca y un cartel con mi WhatsApp al final",
  "Escribime el texto para publicarlo en Instagram",
];

const TOOL_LABELS: Record<string, string> = {
  get_transcript: "Leyendo lo que se dice en el video",
  add_subtitles: "Generando subtítulos",
  style_subtitles: "Ajustando estilo de subtítulos",
  edit_subtitle_text: "Corrigiendo subtítulos",
  remove_silences: "Eliminando silencios",
  cut_ranges: "Cortando tramos",
  keep_only_ranges: "Seleccionando los mejores momentos",
  add_image: "Añadiendo imagen",
  add_text: "Añadiendo texto",
  add_music: "Añadiendo música",
  add_sound_effect: "Añadiendo efecto de sonido",
  add_effect: "Añadiendo efecto visual",
  set_format: "Cambiando formato",
  set_video_volume: "Ajustando volumen",
  apply_brand: "Aplicando tu marca",
  add_motion: "Agregando un elemento animado",
  add_transitions: "Poniendo transiciones",
  set_background: "Armando el fondo animado",
  select_brand: "Eligiendo la marca del proyecto",
  view_frames: "Mirando el video",
  update_item: "Ajustando un elemento",
  delete_items: "Quitando elementos",
  undo: "Deshaciendo cambios",
  clear: "Limpiando elementos",
};

const MAX_STEPS = 14;
const MAX_REF_IMAGES = 6;

type Attachment = { id: string; name: string; thumb: string; sent: boolean } & (
  | { kind: "video"; video: ChatReference }
  | { kind: "image"; data: string }
);
// request size budget (Vercel accepts ~4.5 MB per request)
const MAX_BYTES = 3_200_000;

export default function Chat({ usage: initialUsage }: { usage?: { used: number; limit: number } }) {
  const [usage, setUsage] = useState(initialUsage);
  const [items, setItems] = useState<UiItem[]>([
    {
      role: "assistant",
      text: "¡Hola! Soy tu editor con IA. Sube tus videos y dime qué quieres: subtítulos, cortes, fotos, música, sonidos o efectos. Yo me encargo.",
    },
  ]);
  const [input, setInput] = useState("");
  const [working, setWorking] = useState(false);
  const history = useRef<Msg[]>([]);
  const sentImages = useRef(new Set<string>());
  const endRef = useRef<HTMLDivElement>(null);
  const hasVideo = useEditor((s) => s.project.clips.length > 0 || s.assets.length > 0);
  const busyMsg = useEditor((s) => s.busy);
  // references attached in the chat (a video and/or photos): sent once with the next instruction,
  // and again if the conversation is restarted to keep requests small
  const [atts, setAtts] = useState<Attachment[]>([]);
  const attsRef = useRef<Attachment[]>([]);
  const updateAtts = (f: (x: Attachment[]) => Attachment[]) => {
    attsRef.current = f(attsRef.current);
    setAtts(attsRef.current);
  };
  const [refBusy, setRefBusy] = useState(false);
  // trending format chosen for the next instruction ("" = the AI chooses)
  const [format, setFormat] = useState("");
  const [formatsOpen, setFormatsOpen] = useState(false);
  const pendingAtts = atts.filter((x) => !x.sent);

  const attach = async (files: File[]) => {
    setRefBusy(true);
    try {
      for (const file of files) {
        if (file.type.startsWith("image/") || /\.(jpe?g|png|webp|gif|heic)$/i.test(file.name)) {
          if (attsRef.current.filter((x) => x.kind === "image").length >= MAX_REF_IMAGES) {
            push({ role: "error", text: `Podés adjuntar hasta ${MAX_REF_IMAGES} fotos de referencia.` });
            continue;
          }
          const data = await photoForAI(file, 1024);
          updateAtts((x) => [
            ...x,
            { id: uid(), kind: "image", name: file.name, thumb: `data:image/jpeg;base64,${data}`, data, sent: false },
          ]);
        } else {
          const video = await prepareChatReference(file);
          // one reference video at a time: a new one replaces the previous
          updateAtts((x) => [
            ...x.filter((y) => y.kind !== "video"),
            { id: uid(), kind: "video", name: file.name, thumb: video.thumb, video, sent: false },
          ]);
        }
      }
    } catch (e) {
      push({ role: "error", text: (e as Error).message });
    } finally {
      setRefBusy(false);
    }
  };

  const push = (it: UiItem) => setItems((x) => [...x, it]);

  // other parts of the editor can start a message for the user to complete
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const on = (e: Event) => {
      setInput((e as CustomEvent<string>).detail);
      setTimeout(() => {
        const el = inputRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }, 50);
    };
    window.addEventListener("impulsa-chat-prefill", on);
    return () => window.removeEventListener("impulsa-chat-prefill", on);
  }, []);

  async function send(raw: string) {
    const pending = attsRef.current.filter((x) => !x.sent);
    const text =
      raw.trim() ||
      (pending.some((x) => x.kind === "video")
        ? DEFAULT_REFERENCE_PROMPT
        : pending.length
          ? DEFAULT_PHOTOS_PROMPT
          : "");
    if (!text || working || refBusy) return;
    const sentNow: string[] = [];
    setInput("");
    push({ role: "user", text });
    setWorking(true);
    getPlayer()?.pause();
    const snapshot = history.current.length;
    const undoMark = store.get().past.length;
    const replyParts: string[] = [];
    const actionsDone: string[] = [];

    try {
      if (process.env.NEXT_PUBLIC_DEMO === "1")
        throw new Error(
          "En esta vista previa el asistente IA no está conectado. Cuando la web esté instalada con tu clave de Claude, aquí la IA hará los cambios por ti. Mientras tanto, prueba las herramientas del panel izquierdo.",
        );
      // project state + any new images the AI hasn't seen yet + a frame of the current video
      const content: Anthropic.Beta.BetaContentBlockParam[] = [
        { type: "text", text: `<estado_del_proyecto>\n${describeProject()}\n</estado_del_proyecto>` },
      ];
      for (const a of store.get().assets) {
        if (a.kind !== "image" || sentImages.current.has(a.id)) continue;
        try {
          content.push({ type: "text", text: `Imagen subida "${a.name}":` });
          content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: await imageThumb(a) } });
          sentImages.current.add(a.id);
        } catch {
          /* ignore unreadable image */
        }
      }
      // storyboard: frames across the whole edited video so the AI knows what it contains
      if (contentDuration(store.get().project) > 0) {
        try {
          const frames = await framesForAI(storyboardTimes(), 320);
          content.push({ type: "text", text: "Tira de fotogramas del video editado (segundos de la línea de tiempo):" });
          content.push(...frames);
        } catch {
          /* continue without frames */
        }
      }
      // keep requests under the hosting limit: when the conversation gets heavy (many images),
      // start a fresh one. Every instruction carries the full project state, so nothing is lost.
      if (history.current.length && JSON.stringify(history.current).length + JSON.stringify(content).length > MAX_BYTES) {
        history.current = [];
        updateAtts((x) => x.map((y) => ({ ...y, sent: false })));
      }
      const toSend = attsRef.current.filter((x) => !x.sent);
      const video = toSend.find((x) => x.kind === "video");
      if (video && video.kind === "video") content.push(...referenceBlocks(video.video));
      const photos = toSend.filter((x) => x.kind === "image");
      if (photos.length) {
        content.push({
          type: "text",
          text: `<fotos_de_referencia>\nEl cliente adjuntó ${photos.length === 1 ? "esta foto" : `estas ${photos.length} fotos`} como REFERENCIA (no forman parte de su video): úsalas para entender el estilo que busca (textos, tipografías, colores, composición, encuadre, filtros) y lo que pide en su mensaje.`,
        });
        for (const ph of photos)
          if (ph.kind === "image") {
            content.push({ type: "text", text: `Foto de referencia "${ph.name}":` });
            content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: ph.data } });
          }
        content.push({ type: "text", text: "</fotos_de_referencia>" });
      }
      sentNow.push(...toSend.map((x) => x.id));
      if (sentNow.length) updateAtts((x) => x.map((y) => (sentNow.includes(y.id) ? { ...y, sent: true } : y)));
      const chosen = format ? formatById(format) : undefined;
      if (chosen) {
        content.push({ type: "text", text: `<formato_elegido>${chosen.name} (id: ${chosen.id})</formato_elegido>` });
        setFormat("");
      }
      content.push({ type: "text", text });
      history.current.push({ role: "user", content });

      for (let step = 0; step < MAX_STEPS; step++) {
        if (JSON.stringify(history.current).length > MAX_BYTES + 600_000) {
          push({ role: "error", text: "La instrucción se hizo demasiado larga. Pedila de nuevo en partes más chicas." });
          break;
        }
        const ask = () =>
          fetch("/api/assistant", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messages: history.current }),
          });
        let res = await ask();
        let data = await res.json();
        // the AI's earlier reasoning no longer matches the conversation (e.g. the app was updated
        // meanwhile): forget that reasoning and try once more
        if (res.status === 400 && /thinking/i.test(String(data.error ?? ""))) {
          history.current = history.current.map((m) => {
            if (m.role !== "assistant" || !Array.isArray(m.content)) return m;
            const kept = m.content.filter((b) => b.type !== "thinking" && b.type !== "redacted_thinking");
            return { ...m, content: kept.length ? kept : [{ type: "text" as const, text: "…" }] };
          });
          res = await ask();
          data = await res.json();
        }
        if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
        if (data.usage) setUsage(data.usage);
        const blocks: Block[] = data.content;
        history.current.push({ role: "assistant", content: blocks as Anthropic.Beta.BetaContentBlockParam[] });

        for (const b of blocks)
          if (b.type === "text" && b.text.trim()) {
            push({ role: "assistant", text: b.text.trim() });
            replyParts.push(b.text.trim());
          }

        const uses = blocks.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
        if (data.stop_reason !== "tool_use" || !uses.length) {
          if (data.stop_reason === "max_tokens") push({ role: "error", text: "La respuesta se cortó. Intenta con una petición más concreta." });
          break;
        }

        const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
        for (const u of uses) {
          push({ role: "action", text: TOOL_LABELS[u.name] ?? u.name });
          actionsDone.push(TOOL_LABELS[u.name] ?? u.name);
          try {
            const input = u.input && typeof u.input === "object" ? (u.input as Record<string, unknown>) : {};
            const out = await executeTool(u.name, input);
            results.push({ type: "tool_result", tool_use_id: u.id, content: out });
          } catch (e) {
            results.push({ type: "tool_result", tool_use_id: u.id, content: (e as Error).message, is_error: true });
          }
        }
        history.current.push({ role: "user", content: results });
        if (step === MAX_STEPS - 1) push({ role: "error", text: "Se alcanzó el límite de pasos para esta instrucción." });
      }
    } catch (e) {
      // keep the conversation valid: drop this unfinished exchange
      history.current = history.current.slice(0, snapshot);
      // the references of this message were not delivered: send them again next time
      if (sentNow.length) updateAtts((x) => x.map((y) => (sentNow.includes(y.id) ? { ...y, sent: false } : y)));
      push({ role: "error", text: (e as Error).message });
    } finally {
      setWorking(false);
      const changes = store.get().past.length - undoMark;
      if (changes > 0) push({ role: "action", text: `✓ ${changes} cambio${changes > 1 ? "s" : ""} aplicado${changes > 1 ? "s" : ""} — puedes deshacerlos con ↶` });
      if (replyParts.length || actionsDone.length)
        push({ role: "feedback", text: "", fb: { instruction: text, reply: replyParts.join("\n\n"), actions: actionsDone } });
    }
  }

  return (
    <aside className="flex h-full w-full shrink-0 flex-col bg-[var(--panel)] md:h-auto md:w-[360px] md:border-l md:border-[var(--line)]">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-[var(--line)] px-4">
        <span className="grad grid h-6 w-6 place-items-center rounded-md text-xs text-white">✨</span>
        <span className="font-bold">Asistente IA</span>
        {usage && (
          <span
            className={`ml-auto text-[11px] tabular-nums ${usage.limit - usage.used <= 0 ? "text-amber-300" : "text-[var(--muted)]"}`}
            title="Cada pedido a la IA usa 1 crédito"
          >
            Créditos restantes: {Math.max(0, usage.limit - usage.used)} de {usage.limit}
          </span>
        )}
      </div>
      <div className="scroll-thin min-h-0 flex-1 space-y-2.5 overflow-y-auto p-3">
        {items.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
            {m.role === "feedback" && m.fb ? (
              <Feedback fb={m.fb} />
            ) : m.role === "action" ? (
              <div className="flex items-center gap-2 px-1 text-xs text-[var(--muted)]">
                <span className="text-[var(--accent)]">●</span> {m.text}
              </div>
            ) : (
              <div
                className={`max-w-[90%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${
                  m.role === "user"
                    ? "grad text-white"
                    : m.role === "error"
                      ? "border border-red-500/40 bg-red-500/10 text-red-300"
                      : "bg-[var(--panel-2)]"
                }`}
              >
                {m.text}
              </div>
            )}
          </div>
        ))}
        {working && (
          <div className="flex items-center gap-2 px-1 text-xs text-[var(--muted)]">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
            Pensando y editando…
          </div>
        )}
        <div ref={endRef} />
      </div>
      {hasVideo && items.length < 3 && (
        <div className="scroll-thin flex shrink-0 gap-1.5 overflow-x-auto px-3 pb-2 md:flex-wrap md:overflow-visible">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              className="shrink-0 rounded-full border border-[var(--line)] px-2.5 py-1 text-left text-[11px] whitespace-nowrap text-[var(--muted)] hover:border-[var(--accent)] hover:text-white md:shrink md:whitespace-normal"
              onClick={() => send(s)}
            >
              {s}
            </button>
          ))}
        </div>
      )}
      <form
        className="border-t border-[var(--line)] p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        {(atts.length > 0 || refBusy) && (
          <div className="mb-2 space-y-1.5 rounded-xl border border-[var(--line)] bg-[var(--panel-2)] p-1.5">
            {atts.length > 0 && (
              <div className="scroll-thin flex gap-1.5 overflow-x-auto">
                {atts.map((x) => (
                  <div key={x.id} className="relative shrink-0" title={x.name}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={x.thumb} alt={x.name} className={`h-12 w-12 rounded-md object-cover ${x.sent ? "opacity-60" : ""}`} />
                    {x.kind === "video" && (
                      <span className="absolute bottom-0.5 left-0.5 rounded bg-black/70 px-1 text-[9px] text-white">🎬 video</span>
                    )}
                    <button
                      type="button"
                      className="absolute -top-1 -right-1 grid h-4 w-4 place-items-center rounded-full bg-black/80 text-[9px] text-white hover:bg-red-500"
                      title="Quitar"
                      onClick={() => updateAtts((l) => l.filter((y) => y.id !== x.id))}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2 px-0.5 text-[11px] text-[var(--muted)]">
              {refBusy ? (
                <>
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
                  {busyMsg ?? "Preparando la referencia…"}
                </>
              ) : pendingAtts.length ? (
                "Referencias listas: escribí qué querés (o mandá vacío) y la IA las usa."
              ) : (
                "La IA ya vio estas referencias. Podés seguir pidiéndole cambios."
              )}
            </div>
          </div>
        )}
        {formatsOpen && (
          <div className="mb-2 max-h-72 space-y-1 overflow-y-auto rounded-xl border border-[var(--line)] bg-[var(--panel-2)] p-1.5">
            <button
              type="button"
              className={`w-full rounded-lg px-2 py-1.5 text-left text-xs ${!format ? "bg-[var(--panel)] text-white" : "text-[var(--muted)] hover:text-white"}`}
              onClick={() => {
                setFormat("");
                setFormatsOpen(false);
              }}
            >
              ✨ Que la IA elija el formato
            </button>
            {FORMATS.map((f) => (
              <button
                key={f.id}
                type="button"
                className={`w-full rounded-lg px-2 py-1.5 text-left ${format === f.id ? "bg-[var(--panel)]" : "hover:bg-[var(--panel)]"}`}
                onClick={() => {
                  setFormat(f.id);
                  setFormatsOpen(false);
                }}
              >
                <span className="block text-xs font-semibold">
                  {f.emoji} {f.name} <span className="font-normal text-[var(--muted)]">· {f.length}</span>
                </span>
                <span className="block text-[11px] text-[var(--muted)]">{f.hint}</span>
              </button>
            ))}
          </div>
        )}
        <div className="mb-1.5 flex items-center gap-1.5">
          <button
            type="button"
            className={`rounded-full border px-2.5 py-1 text-[11px] ${format ? "border-[var(--accent)] text-white" : "border-[var(--line)] text-[var(--muted)] hover:text-white"}`}
            onClick={() => setFormatsOpen((v) => !v)}
          >
            🎬 Formato: {format ? `${formatById(format)?.emoji} ${formatById(format)?.name}` : "lo elige la IA"} ▾
          </button>
          {format && (
            <button type="button" className="text-[11px] text-[var(--muted)] hover:text-white" onClick={() => setFormat("")}>
              ✕
            </button>
          )}
        </div>
        <div className="flex items-end gap-2">
          <label
            className={`btn h-[44px] cursor-pointer px-2.5 ${working || refBusy ? "pointer-events-none opacity-50" : ""}`}
            title="Adjuntar referencias: un video o fotos con el estilo que te gusta"
          >
            📎
            <input
              id="chat-reference"
              type="file"
              accept="video/*,image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                const fs = Array.from(e.target.files ?? []);
                if (fs.length) attach(fs);
                e.target.value = "";
              }}
            />
          </label>
          <textarea
            ref={inputRef}
            className="input min-h-[44px] resize-none"
            rows={2}
            placeholder={
              pendingAtts.length
                ? "Ej: hacé el mío con este estilo, para mi complejo de canchas"
                : hasVideo
                  ? "Ej: poné subtítulos amarillos y sacá los silencios"
                  : "Ej: armame un video para mi marca con estas fotos"
            }
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
          />
          <button className="btn btn-primary h-[44px]" disabled={working || refBusy || (!input.trim() && !pendingAtts.length)}>
            ➤
          </button>
        </div>
      </form>
    </aside>
  );
}

/** 👍 / 👎 under an answer; a 👎 asks what went wrong. Saved for the admin panel. */
function Feedback({ fb }: { fb: NonNullable<UiItem["fb"]> }) {
  const [rating, setRating] = useState<1 | -1 | null>(null);
  const [comment, setComment] = useState("");
  const [sent, setSent] = useState(false);

  const send = async (r: 1 | -1, c = "") => {
    setSent(true);
    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating: r, comment: c, ...fb }),
      });
    } catch {
      /* best effort */
    }
  };

  if (sent)
    return <div className="px-1 text-[11px] text-[var(--muted)]">¡Gracias! Tu opinión nos ayuda a mejorar la IA. 💜</div>;

  if (rating === -1)
    return (
      <div className="space-y-1.5 rounded-xl border border-[var(--line)] p-2.5">
        <p className="text-xs font-semibold">¿Qué salió mal o qué esperabas?</p>
        <textarea
          className="input !text-[13px]"
          rows={2}
          autoFocus
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Ej: el título tapó la cara / no entendió que quería música más alta"
        />
        <div className="flex gap-2">
          <button className="btn btn-primary !py-1 text-xs" onClick={() => send(-1, comment)}>
            Enviar
          </button>
          <button className="btn !py-1 text-xs" onClick={() => send(-1)}>
            Enviar sin comentario
          </button>
        </div>
      </div>
    );

  return (
    <div className="flex items-center gap-1.5 px-1 text-[11px] text-[var(--muted)]">
      ¿Te sirvió?
      <button
        className="rounded-md border border-[var(--line)] px-2 py-0.5 hover:border-emerald-400"
        aria-label="Me sirvió"
        onClick={() => {
          setRating(1);
          send(1);
        }}
      >
        👍
      </button>
      <button
        className="rounded-md border border-[var(--line)] px-2 py-0.5 hover:border-red-400"
        aria-label="No me sirvió"
        onClick={() => setRating(-1)}
      >
        👎
      </button>
    </div>
  );
}
