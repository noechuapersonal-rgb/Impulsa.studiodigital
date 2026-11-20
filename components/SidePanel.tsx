"use client";

import { useEffect, useState } from "react";
import * as A from "@/lib/actions";
import { addFiles, addVideoSound, assetUses, removeAsset, WHISPER_MODELS } from "@/lib/media";
import { SUBTITLE_PRESETS, fmt, nextPhotoSlot } from "@/lib/project";
import { SFX_INFO, sfxBuffer } from "@/lib/sfx";
import { applyEditStyle } from "@/lib/applyStyle";
import { EDIT_STYLES } from "@/lib/styles";
import { store, useEditor } from "@/lib/store";
import { narrateSubtitles, narrateText, voiceInfo, type OriginalAudio, type VoiceInfo } from "@/lib/tts";
import {
  BACKGROUND_LABELS,
  BACKGROUND_STYLES,
  EFFECT_LABELS,
  EFFECT_TYPES,
  SFX_NAMES,
  type SfxName,
  type SubtitlePreset,
} from "@/lib/types";
import BrandPanel from "./BrandPanel";
import ColorField from "./ColorField";
import Field from "./Field";
import FontSelect from "./FontSelect";
import PublishPanel from "./PublishPanel";
import ReferencesPanel from "./ReferencesPanel";
import Inspector from "./Inspector";

const TABS = [
  { id: "media", icon: "📁", label: "Medios" },
  { id: "brand", icon: "🎨", label: "Marca" },
  { id: "refs", icon: "⭐", label: "Referencias" },
  { id: "subs", icon: "🔤", label: "Subtítulos" },
  { id: "text", icon: "T", label: "Texto" },
  { id: "sfx", icon: "🔊", label: "Sonidos" },
  { id: "fx", icon: "✨", label: "Efectos" },
  { id: "publish", icon: "✍️", label: "Publicar" },
  { id: "props", icon: "⚙", label: "Propiedades" },
] as const;
type Tab = (typeof TABS)[number]["id"];

export default function SidePanel({ mobile = false }: { mobile?: boolean }) {
  const [tab, setTab] = useState<Tab>("media");
  const selection = useEditor((s) => s.selection);
  useEffect(() => {
    if (selection) setTab("props");
  }, [selection]);

  return (
    <aside
      className={
        mobile
          ? "flex h-full w-full flex-col bg-[var(--panel)]"
          : "flex w-[340px] shrink-0 border-r border-[var(--line)] bg-[var(--panel)]"
      }
    >
      <nav
        className={
          mobile
            ? "scroll-thin flex shrink-0 gap-1 overflow-x-auto border-b border-[var(--line)] p-1.5"
            : "scroll-thin flex w-16 shrink-0 flex-col gap-1 overflow-y-auto border-r border-[var(--line)] p-1.5"
        }
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex shrink-0 flex-col items-center gap-0.5 rounded-lg py-2 text-[10px] font-semibold ${mobile ? "min-w-[68px] px-1" : ""} ${tab === t.id ? "bg-[var(--panel-2)] text-white" : "text-[var(--muted)] hover:text-white"}`}
          >
            <span className="text-base">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>
      <div className={`scroll-thin min-w-0 flex-1 overflow-y-auto p-3 ${mobile ? "min-h-0 pb-6" : ""}`}>
        {tab === "media" && <MediaTab />}
        {tab === "subs" && <SubtitlesTab />}
        {tab === "text" && <TextTab />}
        {tab === "sfx" && <SfxTab />}
        {tab === "fx" && <FxTab />}
        {tab === "brand" && <BrandPanel />}
        {tab === "refs" && <ReferencesPanel />}
        {tab === "publish" && <PublishPanel />}
        {tab === "props" && <Inspector />}
      </div>
    </aside>
  );
}

function MediaTab() {
  const assets = useEditor((s) => s.assets);
  const [soundFor, setSoundFor] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const fit = useEditor((s) => s.project.fit);
  return (
    <div className="space-y-3">
      <label className="block space-y-1 md:hidden">
        <span className="label block">Encuadre</span>
        <select id="fit-mobile" className="input" value={fit} onChange={(e) => A.setFormat({ fit: e.target.value })}>
          <option value="blur">Fondo desenfocado</option>
          <option value="cover">Llenar (recortar)</option>
          <option value="contain">Ajustar (bandas)</option>
        </select>
      </label>
      <label className="btn btn-primary w-full cursor-pointer justify-center">
        ⬆ Subir videos, fotos o música
        <input
          type="file"
          multiple
          accept="video/*,image/*,audio/*"
          className="hidden"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </label>
      <BackgroundSection />
      {!assets.length && (
        <p className="text-sm text-[var(--muted)]">
          Aún no hay archivos. Todo lo que subas se agrega solo: los videos al final, las fotos donde está parado el video
          y la música de fondo.
        </p>
      )}
      {assets.some((a) => a.kind === "video") && (
        <button
          className="btn w-full justify-center"
          onClick={async () => {
            try {
              const r = await A.removeSilences();
              store.set({
                toast: r.cuts
                  ? `✂ Se quitaron ${r.cuts} ${r.cuts === 1 ? "silencio" : "silencios"} (${r.removed.toFixed(1)} s). El video ahora dura ${fmt(r.duration)}. Podés deshacerlo con ↶.`
                  : "No se encontraron silencios largos para quitar. Tu video ya está ajustado.",
              });
            } catch (e) {
              store.set({ toast: `No se pudieron analizar los silencios: ${(e as Error).message}` });
            }
          }}
        >
          ✂ Quitar silencios automáticamente
        </button>
      )}
      <div className="grid grid-cols-2 gap-2">
        {assets.map((a) => (
          <div key={a.id} className="group overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--panel-2)]">
            <div className="relative grid aspect-video place-items-center bg-black">
              {a.kind === "video" && <video src={a.url} className="h-full w-full object-cover" muted preload="metadata" />}
              {a.kind === "image" && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.url} alt={a.name} className="h-full w-full object-contain" />
              )}
              {a.kind === "audio" && <span className="text-3xl">♪</span>}
              {a.duration > 0 && (
                <span className="absolute right-1 bottom-1 rounded bg-black/70 px-1 text-[10px]">{fmt(a.duration)}</span>
              )}
              <button
                className="absolute top-1 right-1 grid h-6 w-6 place-items-center rounded-full bg-black/75 text-[11px] text-white hover:bg-red-500"
                title="Borrar de Medios"
                onClick={() => setConfirmDel(a.id)}
              >
                🗑
              </button>
              {confirmDel === a.id && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-1.5 bg-black/85 p-1.5 text-center">
                  <span className="text-[11px] leading-tight text-white">
                    {assetUses(a.id)
                      ? `¿Borrar? También se quita del video (${assetUses(a.id)} ${assetUses(a.id) === 1 ? "lugar" : "lugares"}) y no se puede deshacer.`
                      : "¿Borrar este archivo?"}
                  </span>
                  <div className="flex gap-1.5">
                    <button
                      className="rounded bg-red-500 px-2 py-0.5 text-[11px] font-bold text-white"
                      onClick={() => {
                        removeAsset(a.id);
                        setConfirmDel(null);
                      }}
                    >
                      Borrar
                    </button>
                    <button className="rounded bg-white/15 px-2 py-0.5 text-[11px] text-white" onClick={() => setConfirmDel(null)}>
                      No
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div className="truncate px-2 pt-1 text-[11px]" title={a.name}>
              {a.name}
            </div>
            <button
              className="m-1.5 w-[calc(100%-12px)] rounded bg-[#0f0f18] py-1 text-[11px] font-semibold hover:bg-[var(--accent)]"
              onClick={() => {
                const t = store.get().time;
                if (a.kind === "video")
                  store.edit((p) => ({
                    ...p,
                    clips: [...p.clips, { id: Math.random().toString(36).slice(2), assetId: a.id, in: 0, out: a.duration, volume: 1 }],
                  }));
                else if (a.kind === "image") {
                  const slot = nextPhotoSlot(store.get().project, t);
                  A.addImage({ asset: a.id, start: slot.start, end: slot.end, animation: "fade", fill: "cover" });
                  store.set({ toast: `Foto agregada: ${fmt(slot.start)}–${fmt(slot.end)}${slot.full ? " (ya no quedaba lugar libre, se superpone)" : ""}` });
                }
                else A.addMusic({ asset: a.id, start: t });
              }}
            >
              + Añadir
            </button>
            {a.kind === "video" &&
              (soundFor === a.id ? (
                <div className="mx-1.5 mb-1.5 flex flex-col gap-1">
                  <button
                    className="rounded bg-[#0f0f18] py-1 text-[11px] font-semibold hover:bg-[var(--accent)]"
                    onClick={() => {
                      addVideoSound(a.file, { replace: true });
                      setSoundFor(null);
                    }}
                  >
                    🔇 Reemplazar el sonido
                  </button>
                  <button
                    className="rounded bg-[#0f0f18] py-1 text-[11px] font-semibold hover:bg-[var(--accent)]"
                    onClick={() => {
                      addVideoSound(a.file, { replace: false });
                      setSoundFor(null);
                    }}
                  >
                    🎚 Mezclar de fondo
                  </button>
                </div>
              ) : (
                <button
                  className="mx-1.5 mb-1.5 w-[calc(100%-12px)] rounded bg-[#0f0f18] py-1 text-[11px] font-semibold hover:bg-[var(--accent)]"
                  onClick={() => setSoundFor(a.id)}
                >
                  ♪ Usar su sonido
                </button>
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function SubtitlesTab() {
  const style = useEditor((s) => s.project.subtitleStyle);
  const cues = useEditor((s) => s.project.cues);
  const hasClips = useEditor((s) => s.project.clips.length > 0);
  const busy = useEditor((s) => s.busy);
  const [lang, setLang] = useState("");
  const [model, setModel] = useState<string>(WHISPER_MODELS.equilibrado);
  const [source, setSource] = useState<"auto" | "video" | "music" | "all">("auto");
  const hasSong = useEditor((s) => s.project.audio.some((a) => a.kind === "music" && !!a.assetId));
  const [err, setErr] = useState("");

  const generate = async () => {
    setErr("");
    try {
      const src = source === "auto" ? undefined : source;
      const n = await A.addSubtitles({ language: lang || null, model, source: src });
      if (!n) setErr("No se escuchó voz ni letra para subtitular. Probá eligiendo otro audio o el modelo «Preciso».");
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="label">Generar automáticamente</div>
        <div className="grid grid-cols-2 gap-2">
          <select className="input" value={lang} onChange={(e) => setLang(e.target.value)}>
            <option value="">Detectar idioma</option>
            <option value="spanish">Español</option>
            <option value="english">Inglés</option>
            <option value="portuguese">Portugués</option>
            <option value="french">Francés</option>
            <option value="italian">Italiano</option>
          </select>
          <select className="input" value={model} onChange={(e) => setModel(e.target.value)}>
            <option value={WHISPER_MODELS.rapido}>Rápido</option>
            <option value={WHISPER_MODELS.equilibrado}>Equilibrado</option>
            <option value={WHISPER_MODELS.preciso}>Preciso</option>
          </select>
        </div>
        {hasSong && (
          <label className="block space-y-1">
            <span className="label block">¿De qué audio?</span>
            <select
              id="sub-source"
              className="input"
              value={source}
              onChange={(e) => {
                const v = e.target.value as typeof source;
                setSource(v);
                if ((v === "music" || v === "all") && !A.isPhone()) setModel(WHISPER_MODELS.preciso);
              }}
            >
              <option value="auto">Automático</option>
              <option value="video">Voz del video</option>
              <option value="music">Letra de la canción de fondo</option>
              <option value="all">Ambos</option>
            </select>
            {(source === "music" || source === "all") && (
              <span className="block text-[11px] text-[var(--muted)]">
                Con música algunas palabras pueden salir mal: revisá la letra. En la compu conviene el modelo
                «Preciso» (más pesado, la primera vez tarda unos minutos en descargarse).
              </span>
            )}
          </label>
        )}
        <button className="btn btn-primary w-full justify-center" disabled={(!hasClips && !hasSong) || !!busy} onClick={generate}>
          🔤 Generar subtítulos
        </button>
        <p className="text-[11px] text-[var(--muted)]">
          La primera vez se descarga el modelo de voz (Whisper) a tu navegador.
        </p>
        {err && <p className="text-xs text-red-400">{err}</p>}
      </div>

      <VoiceSection />

      <EditStylesGrid />

      <div className="space-y-2">
        <div className="label">Estilo</div>
        <VideoFontSelect />
        <div className="grid grid-cols-3 gap-1.5">
          {(Object.keys(SUBTITLE_PRESETS) as SubtitlePreset[]).map((p) => (
            <button
              key={p}
              onClick={() => A.styleSubtitles({ preset: p })}
              className={`rounded-lg border py-2 text-xs font-bold capitalize ${style.preset === p ? "border-[var(--accent)] bg-[var(--panel-2)]" : "border-[var(--line)]"}`}
            >
              {p}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Color">
            <ColorField id="sub-color" value={style.color} onChange={(c) => A.styleSubtitles({ color: c })} />
          </Field>
          <Field label="Resaltado">
            <ColorField id="sub-highlight" value={style.highlight} onChange={(c) => A.styleSubtitles({ highlight: c })} />
          </Field>
          <Field label="Posición">
            <select className="input" value={style.position} onChange={(e) => A.styleSubtitles({ position: e.target.value as "top" })}>
              <option value="top">Arriba</option>
              <option value="middle">Centro</option>
              <option value="bottom">Abajo</option>
            </select>
          </Field>
          <Field label={`Tamaño ${style.fontSize}`}>
            <input type="range" min={16} max={90} value={style.fontSize} onChange={(e) => A.styleSubtitles({ fontSize: Number(e.target.value) })} className="w-full" />
          </Field>
          <Field label={`Palabras/línea ${style.wordsPerCue}`}>
            <input type="range" min={1} max={12} value={style.wordsPerCue} onChange={(e) => A.styleSubtitles({ wordsPerCue: Number(e.target.value) })} className="w-full" />
          </Field>
          <div className="flex flex-col justify-end gap-1 text-xs">
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={style.uppercase} onChange={(e) => A.styleSubtitles({ uppercase: e.target.checked })} /> Mayúsculas
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={style.background} onChange={(e) => A.styleSubtitles({ background: e.target.checked })} /> Fondo
            </label>
          </div>
        </div>
      </div>

      {cues.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="label">Líneas ({cues.length})</div>
            <button className="text-xs text-red-400" onClick={() => A.clearItems("subtitles")}>
              Borrar todas
            </button>
          </div>
          {cues.map((c) => (
            <div key={c.id} className="flex items-start gap-2">
              <button className="mt-1.5 font-mono text-[10px] text-[var(--muted)] hover:text-white" onClick={() => A.getPlayer()?.seek(c.start + 0.01)}>
                {fmt(c.start)}
              </button>
              <input
                className="input"
                value={c.text}
                onChange={(e) =>
                  store.set((s) => ({
                    project: { ...s.project, cues: s.project.cues.map((x) => (x.id === c.id ? { ...x, text: e.target.value } : x)) },
                  }))
                }
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const TEXT_PRESETS = [
  { preset: "titulo", label: "Título grande", text: "TÍTULO" },
  { preset: "subtitulo", label: "Subtítulo", text: "Subtítulo" },
  { preset: "etiqueta", label: "Etiqueta", text: "NUEVO" },
  { preset: "cta", label: "Llamada a la acción", text: "¡Sígueme!" },
];

/** One-tap editing styles: typography, colors, subtitles and titles that go together. */
function EditStylesGrid() {
  const current = useEditor((s) => s.project.styleId);
  const hasBrand = useEditor((s) => !!s.brand?.primary);
  const [brandColors, setBrandColors] = useState(false);
  return (
    <div className="space-y-2">
      <div className="label">Estilo de edición (un toque)</div>
      <div className="grid grid-cols-2 gap-1.5">
        {EDIT_STYLES.map((st) => (
          <button
            key={st.id}
            onClick={async () => {
              const r = await applyEditStyle(st.id, { brandColors });
              store.set({ toast: `Estilo «${r.name}» aplicado a todo el video. Podés deshacerlo con ↶.` });
            }}
            className={`flex items-center gap-2 rounded-lg border p-2 text-left ${current === st.id ? "border-[var(--accent)] bg-[var(--panel-2)]" : "border-[var(--line)] hover:border-[var(--muted)]"}`}
            title={st.hint}
          >
            <span className="h-4 w-4 shrink-0 rounded-full" style={{ background: brandColors ? undefined : st.accent }} />
            <span className="min-w-0 truncate text-[11px] font-semibold">
              {st.emoji} {st.name}
            </span>
          </button>
        ))}
      </div>
      {hasBrand && (
        <label className="flex items-center gap-2 text-[11px] text-[var(--muted)]">
          <input type="checkbox" checked={brandColors} onChange={(e) => setBrandColors(e.target.checked)} /> Usar el color de mi marca
        </label>
      )}
    </div>
  );
}

/** Animated background for videos made without footage. */
function BackgroundSection() {
  const bg = useEditor((s) => s.project.background);
  const hasClips = useEditor((s) => s.project.clips.length > 0);
  const brandColor = useEditor((s) => s.brand?.primary);
  const [open, setOpen] = useState(false);
  if (hasClips && !bg && !open) return null;
  const cur = bg ?? { style: "degradado" as const, colors: ["#0d0d16", brandColor ?? "#7c3aed"] as [string, string] };
  const set = (patch: Partial<typeof cur>) => store.edit((p) => ({ ...p, background: { ...cur, ...patch } }));
  return (
    <div className="space-y-2 rounded-xl border border-[var(--line)] p-3">
      <div className="flex items-center justify-between">
        <span className="label">Fondo animado</span>
        {bg && (
          <button className="text-[11px] text-[var(--muted)] hover:text-red-400" onClick={() => store.edit((p) => ({ ...p, background: undefined }))}>
            Quitar
          </button>
        )}
      </div>
      <p className="text-[11px] text-[var(--muted)]">
        Para videos sin grabar: se ve donde no hay video. Arriba van los elementos animados, la voz y los subtítulos.
      </p>
      <select
        id="bg-style"
        className="input"
        value={cur.style}
        onChange={(e) => set({ style: e.target.value as typeof cur.style })}
        onFocus={() => setOpen(true)}
      >
        {BACKGROUND_STYLES.map((st) => (
          <option key={st} value={st}>
            {BACKGROUND_LABELS[st]}
          </option>
        ))}
      </select>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Fondo">
          <ColorField id="bg-base" value={cur.colors[0]} onChange={(c) => set({ colors: [c, cur.colors[1]] })} />
        </Field>
        <Field label="Luces">
          <ColorField id="bg-accent" value={cur.colors[1]} onChange={(c) => set({ colors: [cur.colors[0], c] })} />
        </Field>
      </div>
    </div>
  );
}

/** Typography of every text and subtitle of this video. */
function VideoFontSelect() {
  const font = useEditor((s) => s.project.font ?? "");
  return (
    <Field label="Tipografía (textos y subtítulos)">
      <FontSelect
        id="video-font"
        value={font}
        emptyLabel="Predeterminada (Inter)"
        onChange={(f) => store.edit((p) => ({ ...p, font: f || undefined }))}
      />
      <span className="mt-1 block text-[10px] text-[var(--muted)]">
        Para subir tu propia letra o buscarla desde una foto, andá a 🎨 Marca.
      </span>
    </Field>
  );
}

function VoiceSection() {
  const hasCues = useEditor((s) => s.project.cues.length > 0);
  const hasClips = useEditor((s) => s.project.clips.length > 0);
  const busy = useEditor((s) => s.busy);
  const [mode, setMode] = useState<"subs" | "text">("subs");
  const [text, setText] = useState("");
  const [original, setOriginal] = useState<OriginalAudio>("bajar");
  const [err, setErr] = useState("");
  const [info, setInfo] = useState<VoiceInfo | null>(null);
  const [voice, setVoice] = useState("free");
  useEffect(() => {
    voiceInfo().then((i) => {
      setInfo(i);
      if (i.premium && i.voices[0]) setVoice(i.voices[0].id);
    });
  }, []);
  const premium = voice !== "free" && !!info?.premium;

  const run = async () => {
    setErr("");
    try {
      if (mode === "subs") {
        const n = await narrateSubtitles({ original, voice });
        store.set({ toast: `Listo: la voz lee ${n} frases de tus subtítulos. Dale play para escucharla.` });
      } else {
        await narrateText(text, { start: store.get().time, original, voice, subtitles: true });
        store.set({ toast: "Listo: voz en off agregada con sus subtítulos. Dale play para escucharla." });
      }
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  return (
    <div className="space-y-2 rounded-xl border border-[var(--line)] p-3">
      <div className="label">🗣️ Voz en off (texto a voz)</div>
      <div className="grid grid-cols-2 gap-1.5">
        {(
          [
            ["subs", "Leer subtítulos"],
            ["text", "Escribir un texto"],
          ] as const
        ).map(([m, l]) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`rounded-lg border py-2 text-xs font-bold ${mode === m ? "border-[var(--accent)] bg-[var(--panel-2)]" : "border-[var(--line)]"}`}
          >
            {l}
          </button>
        ))}
      </div>
      {mode === "text" && (
        <textarea
          id="voice-text"
          className="input"
          rows={4}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ej: ¿Buscás zapatillas cómodas? Llegó la nueva colección. Envíos a todo el país. Escribinos por WhatsApp."
        />
      )}
      {info?.premium && (
        <select id="voice-choice" className="input" value={voice} onChange={(e) => setVoice(e.target.value)}>
          {info.voices.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
              {v.info ? ` (${v.info})` : ""}
            </option>
          ))}
          <option value="free">Voz básica gratis (suena robótica)</option>
        </select>
      )}
      {hasClips && (
        <select id="voice-original" className="input" value={original} onChange={(e) => setOriginal(e.target.value as OriginalAudio)}>
          <option value="bajar">Bajar el sonido del video</option>
          <option value="silenciar">Silenciar el video (si la voz repite lo que ya se dice)</option>
          <option value="mantener">Dejar el sonido del video igual</option>
        </select>
      )}
      <button
        className="btn btn-primary w-full justify-center"
        disabled={!!busy || (mode === "subs" ? !hasCues : !text.trim())}
        onClick={run}
      >
        🗣️ {mode === "subs" ? "Leer los subtítulos en voz alta" : "Agregar voz en off"}
      </button>
      <p className="text-[11px] text-[var(--muted)]">
        {mode === "subs"
          ? hasCues
            ? "Cada frase suena cuando aparece en pantalla. Si la volvés a generar, reemplaza la voz anterior."
            : "Primero generá o escribí subtítulos."
          : "Empieza donde está el cursor y también crea los subtítulos. Los precios y números se leen solos."}{" "}
        {premium
          ? `Voz natural: usa 1 crédito de IA cada ${info?.charsPerCredit ?? 200} letras (un video de 40 s ≈ 3 créditos).`
          : "Voz básica gratuita (español o inglés); la primera vez se descarga a tu navegador."}
      </p>
      {err && <p className="text-xs text-red-400">{err}</p>}
    </div>
  );
}

function TextTab() {
  const [text, setText] = useState("");
  const [font, setFont] = useState("");
  const [outline, setOutline] = useState<"borde" | "sombra" | "nada">("borde");
  return (
    <div className="space-y-3">
      <input className="input" placeholder="Escribe tu texto…" value={text} onChange={(e) => setText(e.target.value)} />
      <Field label="Tipografía">
        <FontSelect id="new-text-font" value={font} emptyLabel="La del video" onChange={setFont} />
      </Field>
      <Field label="Contorno (títulos y subtítulos)">
        <select id="new-text-outline" className="input" value={outline} onChange={(e) => setOutline(e.target.value as typeof outline)}>
          <option value="borde">Borde negro</option>
          <option value="sombra">Sombra suave</option>
          <option value="nada">Sin borde</option>
        </select>
      </Field>
      <div className="space-y-2">
        {TEXT_PRESETS.map((p) => (
          <button
            key={p.preset}
            className="btn w-full justify-between"
            onClick={() => {
              const t = store.get().time;
                            // titles and calls to action use the brand's title typography unless another one is chosen
              const titleFont = p.preset === "titulo" || p.preset === "cta" ? store.get().brand?.titleFont : undefined;
              const id = A.addText({ text: text || p.text, preset: p.preset, font: font || titleFont, outline, start: t, end: t + 3, position: p.preset === "cta" ? "bottom" : "center" });
              store.set({ selection: { kind: "overlay", id } });
            }}
          >
            <span>{p.label}</span>
            <span className="text-[var(--muted)]">+</span>
          </button>
        ))}
      </div>
      <p className="text-[11px] text-[var(--muted)]">
        Se añade en la posición del cabezal. Arrástralo en el visor para moverlo. Para cambiarle la letra después, tocá el
        texto y elegí otra en Propiedades. Tus propias tipografías se suben en 🎨 Marca.
      </p>
    </div>
  );
}

function SfxTab() {
  const preview = async (name: SfxName) => {
    const ctx = new AudioContext();
    const src = ctx.createBufferSource();
    src.buffer = await sfxBuffer(name);
    src.connect(ctx.destination);
    src.start();
    src.onended = () => ctx.close();
  };
  return (
    <div className="space-y-2">
      <p className="text-[11px] text-[var(--muted)]">Efectos de sonido integrados, libres de derechos. Se añaden en el cabezal.</p>
      {SFX_NAMES.map((n) => (
        <div key={n} className="flex items-center gap-2">
          <button className="btn w-9 justify-center !px-0" onClick={() => preview(n)} title="Escuchar">
            ▶
          </button>
          <button className="btn flex-1 justify-between" onClick={() => A.addSfx({ effect: n })}>
            <span>{SFX_INFO[n].label}</span>
            <span className="text-[var(--muted)]">+</span>
          </button>
        </div>
      ))}
    </div>
  );
}

function FxTab() {
  return (
    <div className="space-y-2">
      <p className="text-[11px] text-[var(--muted)]">Se añaden 2 segundos desde el cabezal. Ajusta la duración en la línea de tiempo.</p>
      <div className="grid grid-cols-2 gap-2">
        {EFFECT_TYPES.map((t) => (
          <button
            key={t}
            className="btn justify-center text-center text-xs"
            onClick={() => {
              const id = A.addEffect({ effect: t, start: store.get().time, end: store.get().time + 2 });
              store.set({ selection: { kind: "effect", id } });
            }}
          >
            {EFFECT_LABELS[t]}
          </button>
        ))}
      </div>
    </div>
  );
}

