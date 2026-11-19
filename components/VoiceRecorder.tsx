"use client";

import { useEffect, useState } from "react";
import { fmt } from "@/lib/project";
import { cancelRecording, startRecording, stopRecording, type RecordOptions } from "@/lib/recorder";
import { useEditor } from "@/lib/store";

/** 🎙️ button next to play: record your voice in sync with the video. */
export default function VoiceRecorder() {
  const hasClips = useEditor((s) => s.project.clips.length > 0);
  const time = useEditor((s) => s.time);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<"idle" | "count" | "rec" | "saving">("idle");
  const [count, setCount] = useState(3);
  const [secs, setSecs] = useState(0);
  const [error, setError] = useState("");
  const [opts, setOpts] = useState<RecordOptions>({ original: "bajar", listen: false, subtitles: true });

  useEffect(() => () => cancelRecording(), []);

  const finish = async (p: Promise<void>) => {
    setState("saving");
    try {
      await p;
    } catch (e) {
      setError((e as Error).message);
      setOpen(true);
    } finally {
      setState("idle");
    }
  };

  const begin = async () => {
    setError("");
    setOpen(false);
    setState("count");
    for (let i = 3; i > 0; i--) {
      setCount(i);
      await new Promise((r) => setTimeout(r, 700));
    }
    try {
      await startRecording(opts, setSecs, finish);
      setSecs(0);
      setState("rec");
    } catch (e) {
      setError((e as Error).message);
      setOpen(true);
      setState("idle");
    }
  };

  if (state === "count")
    return (
      <div className="fixed inset-0 z-[60] grid place-items-center bg-black/60">
        <div className="text-center">
          <div className="text-7xl font-black text-white">{count}</div>
          <p className="mt-2 text-sm text-white/80">Preparate para hablar…</p>
        </div>
      </div>
    );

  if (state === "rec" || state === "saving")
    return (
      <button
        className="btn !border-red-500/60 !bg-red-500/15 text-red-300"
        disabled={state === "saving"}
        onClick={() => finish(stopRecording())}
        title="Terminar la grabación"
      >
        {state === "saving" ? (
          "Guardando…"
        ) : (
          <>
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" /> {fmt(secs)} · Detener
          </>
        )}
      </button>
    );

  return (
    <div className="relative">
      <button className="btn" onClick={() => setOpen((v) => !v)} title="Grabar tu voz">
        🎙️<span className="hidden sm:inline"> Grabar</span>
      </button>
      {open && (
        <div className="fixed inset-x-3 bottom-24 z-30 space-y-2.5 sm:absolute sm:inset-x-auto sm:bottom-12 sm:left-0 sm:w-72 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3 text-sm shadow-2xl">
          <div className="font-bold">🎙️ Grabar tu voz</div>
          <p className="text-[12px] text-[var(--muted)]">
            {hasClips
              ? `Empieza en ${fmt(time)} (donde está el cursor). El video se reproduce mientras hablás, así tu voz queda sincronizada.`
              : "Grabá tu voz; queda en la fila «Voz» de la línea de tiempo."}
          </p>
          {hasClips && (
            <select
              id="rec-original"
              className="input"
              value={opts.original}
              onChange={(e) => setOpts({ ...opts, original: e.target.value as RecordOptions["original"] })}
            >
              <option value="bajar">Bajar el sonido del video</option>
              <option value="silenciar">Silenciar el sonido del video</option>
              <option value="mantener">Dejar el sonido del video igual</option>
            </select>
          )}
          <label className="flex items-start gap-2 text-[12px]">
            <input type="checkbox" checked={opts.subtitles} onChange={(e) => setOpts({ ...opts, subtitles: e.target.checked })} />
            Crear subtítulos de lo que digo
          </label>
          {hasClips && (
            <label className="flex items-start gap-2 text-[12px]">
              <input type="checkbox" checked={opts.listen} onChange={(e) => setOpts({ ...opts, listen: e.target.checked })} />
              <span>
                Escuchar el video mientras grabo <span className="text-[var(--muted)]">(solo con auriculares)</span>
              </span>
            </label>
          )}
          {error && <p className="text-[12px] text-red-400">{error}</p>}
          <button className="btn btn-primary w-full justify-center" onClick={begin}>
            ● Empezar a grabar
          </button>
          <p className="text-[11px] text-[var(--muted)]">
            Para terminar tocá «Detener» (o se detiene sola al final del video). La primera vez el navegador te pide
            permiso para usar el micrófono.
          </p>
        </div>
      )}
    </div>
  );
}
