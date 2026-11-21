"use client";

import { useRef, useState } from "react";
import * as A from "@/lib/actions";
import { addFiles, addGeneratedMusic, addVideoSound } from "@/lib/media";
import { MUSIC_STYLES, type MusicStyle } from "@/lib/music";
import { fmt, nextSlot } from "@/lib/project";
import { SFX_INFO } from "@/lib/sfx";
import { store } from "@/lib/store";
import { EFFECT_LABELS, EFFECT_TYPES, MOTION_LABELS, SFX_NAMES, type MotionType, type TextPreset } from "@/lib/types";

type Step = "main" | "text" | "sfx" | "fx" | "sound" | "motion" | "music";

/** Ready-to-use examples for each animated element (the user edits them in Propiedades). */
const MOTIONS: { type: MotionType; icon: string; hint: string; data: Record<string, unknown> }[] = [
  { type: "titulo_animado", icon: "🅰️", hint: "Entra palabra por palabra, con palabras en caja de color", data: { text: "ESTO [CAMBIA TODO]" } },
  { type: "contador", icon: "🔢", hint: "Un número que sube", data: { from: 0, to: 120, label: "clientes" } },
  { type: "lista", icon: "✅", hint: "Ítems con ✓ que aparecen de a uno", data: { items: ["Rápido", "Simple", "Sin comisiones"] } },
  { type: "tarjeta", icon: "💳", hint: "Un dato o precio destacado", data: { label: "PLAN MENSUAL", value: "$ 28.000", sub: "Sin comisiones" } },
  { type: "audio", icon: "🎙️", hint: "Burbuja de audio de WhatsApp", data: { text: "Diego", value: "0:36" } },
  { type: "progreso", icon: "📊", hint: "Barra que se llena", data: { label: "Ventas del mes", to: 85 } },
  { type: "emoji", icon: "🔥", hint: "Emoji grande que salta", data: { value: "🔥" } },
  { type: "hud_juego", icon: "🎮", hint: "Minimapa, dinero y estrellas, como dentro de un juego", data: { from: 0, to: 25000, value: "2", label: "12:45", text: "Centro" } },
  { type: "mision", icon: "🏁", hint: "«Misión cumplida» con recompensa", data: { text: "MISIÓN CUMPLIDA", sub: "+ $5.000 · RESPETO +", label: "Ve a la barbería y pedí el corte de la casa." } },
  { type: "cierre", icon: "📣", hint: "Cartel final con botón", data: { text: "¿TE SUMÁS?", sub: "Escribinos y te contamos", label: "ESCRIBINOS" } },
];

const TEXTS: { preset: TextPreset; label: string; text: string; position: string }[] = [
  { preset: "titulo", label: "Título grande", text: "TU TÍTULO", position: "top" },
  { preset: "subtitulo", label: "Subtítulo", text: "Tu texto", position: "center" },
  { preset: "etiqueta", label: "Etiqueta", text: "NUEVO", position: "top-left" },
  { preset: "cta", label: "Botón (llamado a la acción)", text: "¡Escribinos!", position: "bottom" },
];

/** "+" button next to play: choose what to add; every new item goes after the last one of its kind. */
export default function AddMenu() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("main");
  const video = useRef<HTMLInputElement>(null);
  const photo = useRef<HTMLInputElement>(null);
  const music = useRef<HTMLInputElement>(null);
  const soundVideo = useRef<HTMLInputElement>(null);
  const [soundFile, setSoundFile] = useState<File | null>(null);

  const close = () => {
    setOpen(false);
    setStep("main");
    setSoundFile(null);
  };
  const notice = (what: string, s: { start: number; end: number; full: boolean }) =>
    store.set({
      toast: `${what} agregado: ${fmt(s.start)}–${fmt(s.end)}${s.full ? " (ya no quedaba lugar libre, se superpone)" : ""}`,
    });

  const addText = (t: (typeof TEXTS)[number]) => {
    const s = nextSlot(store.get().project, "text", store.get().time, 3);
    const id = A.addText({ text: t.text, preset: t.preset, start: s.start, end: s.end, position: t.position, animation: "pop" });
    store.set({ selection: { kind: "overlay", id } });
    notice("Texto", s);
    close();
  };
  const addSfx = (name: (typeof SFX_NAMES)[number]) => {
    const s = nextSlot(store.get().project, "sfx", store.get().time, SFX_INFO[name].duration);
    A.addSfx({ effect: name, at: s.start });
    notice("Sonido", s);
    close();
  };
  const addMotion = (mo: (typeof MOTIONS)[number]) => {
    const len = mo.type === "emoji" ? 1.5 : mo.type === "cierre" || mo.type === "lista" ? 4 : 3;
    const s = nextSlot(store.get().project, "motion", store.get().time, len);
    const id = A.addMotion({ type: mo.type, start: s.start, end: s.end, ...mo.data });
    store.set({ selection: { kind: "motion", id } });
    notice(MOTION_LABELS[mo.type], s);
    close();
  };
  const addFx = (type: (typeof EFFECT_TYPES)[number]) => {
    const s = nextSlot(store.get().project, "effect", store.get().time, 2);
    const id = A.addEffect({ effect: type, start: s.start, end: s.end });
    store.set({ selection: { kind: "effect", id } });
    notice("Efecto", s);
    close();
  };

  const fileInput = (ref: React.RefObject<HTMLInputElement | null>, accept: string) => (
    <input
      ref={ref}
      type="file"
      multiple
      accept={accept}
      className="hidden"
      onChange={(e) => {
        if (e.target.files?.length) addFiles(e.target.files);
        e.target.value = "";
        close();
      }}
    />
  );

  const Option = ({ icon, label, hint, onClick }: { icon: string; label: string; hint: string; onClick: () => void }) => (
    <button
      onClick={onClick}
      className="flex items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--panel-2)] p-3 text-left hover:border-[var(--accent)]"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#0f0f18] text-xl">{icon}</span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{label}</span>
        <span className="block text-[11px] text-[var(--muted)]">{hint}</span>
      </span>
    </button>
  );

  return (
    <>
      <button className="btn w-12 justify-center !px-0 text-lg" title="Agregar al video" aria-label="Agregar al video" onClick={() => setOpen(true)}>
        +
      </button>
      {fileInput(video, "video/*")}
      {fileInput(photo, "image/*")}
      {fileInput(music, "audio/*")}
      <input
        ref={soundVideo}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) {
            setSoundFile(f);
            setStep("sound");
          }
        }}
      />

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 md:items-center" onClick={close}>
          <div
            className="panel max-h-[80dvh] w-full max-w-md overflow-y-auto rounded-t-2xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {step !== "main" && (
                  <button className="text-[var(--muted)] hover:text-white" onClick={() => setStep("main")} aria-label="Volver">
                    ←
                  </button>
                )}
                <h2 className="font-bold">
                  {step === "main"
                    ? "¿Qué querés agregar?"
                    : step === "motion"
                      ? "Elegí un elemento animado"
                      : step === "music"
                      ? "Música de fondo"
                      : step === "text"
                      ? "Elegí un texto"
                      : step === "sfx"
                        ? "Elegí un sonido"
                        : step === "sound"
                          ? "¿Cómo usamos este sonido?"
                          : "Elegí un efecto"}
                </h2>
              </div>
              <button className="text-[var(--muted)] hover:text-white" onClick={close} aria-label="Cerrar">
                ✕
              </button>
            </div>

            {step === "main" && (
              <>
                <div className="grid gap-2">
                  <Option icon="🎬" label="Video" hint="Se agrega al final del video" onClick={() => video.current?.click()} />
                  <Option icon="🖼" label="Foto" hint="Va después de la última foto, 3 s cada una" onClick={() => photo.current?.click()} />
                  <Option
                    icon="🌟"
                    label="Elemento animado"
                    hint="Títulos con onda, contador, lista con ✓, tarjeta, audio de WhatsApp…"
                    onClick={() => setStep("motion")}
                  />
                  <Option icon="T" label="Texto" hint="Va después del último texto" onClick={() => setStep("text")} />
                  <Option icon="♪" label="Música de fondo" hint="Original sin derechos de autor, o subí tu canción" onClick={() => setStep("music")} />
                  <Option
                    icon="🎵"
                    label="Sonido de otro video"
                    hint="Usá el audio de un Reel o TikTok guardado"
                    onClick={() => soundVideo.current?.click()}
                  />
                  <Option icon="🔊" label="Efecto de sonido" hint="Va después del último sonido" onClick={() => setStep("sfx")} />
                  <Option icon="✨" label="Efecto visual" hint="Zoom, flash, blanco y negro… (2 s)" onClick={() => setStep("fx")} />
                </div>
                <p className="mt-3 text-[11px] text-[var(--muted)]">
                  Cada cosa nueva va después de la última de su tipo. Si todavía no hay ninguna, va donde está parado el video.
                </p>
              </>
            )}

            {step === "music" && (
              <div className="grid gap-2">
                <p className="text-[11px] text-[var(--muted)]">
                  Componemos una música original del largo de tu video, sin derechos de autor (Instagram y TikTok no la
                  silencian).
                </p>
                {(Object.keys(MUSIC_STYLES) as MusicStyle[]).map((k) => (
                  <Option
                    key={k}
                    icon={k === "energetica" ? "⚡" : k === "corporativa" ? "😀" : k === "chill" ? "☕" : "🎹"}
                    label={MUSIC_STYLES[k].label}
                    hint={MUSIC_STYLES[k].hint}
                    onClick={async () => {
                      close();
                      try {
                        const r = await addGeneratedMusic({ style: k });
                        store.set({ toast: `Listo: música ${r.label.toLowerCase()} original agregada. Dale play para escucharla.` });
                      } catch (e) {
                        store.set({ toast: (e as Error).message });
                      }
                    }}
                  />
                ))}
                <Option icon="📁" label="Subir mi canción" hint="Un archivo de audio (MP3, WAV, M4A…)" onClick={() => music.current?.click()} />
              </div>
            )}

            {step === "motion" && (
              <div className="grid gap-2">
                {MOTIONS.map((mo) => (
                  <Option key={mo.type} icon={mo.icon} label={MOTION_LABELS[mo.type]} hint={mo.hint} onClick={() => addMotion(mo)} />
                ))}
                <p className="text-[11px] text-[var(--muted)]">
                  Después tocá el elemento para cambiarle el texto, los colores y el lugar (en Propiedades).
                </p>
              </div>
            )}

            {step === "text" && (
              <div className="grid gap-2">
                {TEXTS.map((t) => (
                  <button key={t.preset} className="btn justify-between !py-3" onClick={() => addText(t)}>
                    <span>{t.label}</span>
                    <span className="text-[var(--muted)]">+</span>
                  </button>
                ))}
              </div>
            )}

            {step === "sfx" && (
              <div className="grid grid-cols-2 gap-2">
                {SFX_NAMES.map((n) => (
                  <button key={n} className="btn justify-center !py-3 text-xs" onClick={() => addSfx(n)}>
                    {SFX_INFO[n].label}
                  </button>
                ))}
              </div>
            )}

            {step === "sound" && soundFile && (
              <div className="grid gap-2">
                <p className="text-xs text-[var(--muted)]">🎵 {soundFile.name}</p>
                <Option
                  icon="🔇"
                  label="Reemplazar el sonido de mi video"
                  hint="Mi video queda en silencio y suena solo este audio"
                  onClick={() => {
                    addVideoSound(soundFile, { replace: true });
                    close();
                  }}
                />
                <Option
                  icon="🎚"
                  label="Mezclar con mi video"
                  hint="Suena de fondo, más bajito, junto con mi voz"
                  onClick={() => {
                    addVideoSound(soundFile, { replace: false });
                    close();
                  }}
                />
              </div>
            )}

            {step === "fx" && (
              <div className="grid grid-cols-2 gap-2">
                {EFFECT_TYPES.map((t) => (
                  <button key={t} className="btn justify-center !py-3 text-xs" onClick={() => addFx(t)}>
                    {EFFECT_LABELS[t]}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
