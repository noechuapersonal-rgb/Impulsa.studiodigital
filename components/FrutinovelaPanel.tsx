"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  addCharacterPhoto,
  buildFrutinovela,
  charKey,
  DEFAULT_PITCHES,
  NAME_COLORS,
  parseScript,
  PITCHES,
  SAMPLE_SCRIPT,
  type CastMember,
  type NovelaOptions,
} from "@/lib/frutinovela";
import { contentDuration } from "@/lib/project";
import { store, useEditor } from "@/lib/store";
import { guessLang, speakable, synthesize, synthesizePremium, tidy, toWav, trim, voiceInfo, type VoiceInfo } from "@/lib/tts";

/** What the user wrote is kept while switching tabs and between visits (only on this device). */
const KEY = "impulsa-frutinovela";
type Saved = { script: string; cast: Record<string, CastMember>; opts: NovelaOptions };
const DEFAULT_OPTS: NovelaOptions = { music: "emotiva", effects: true, subtitles: true };
function load(): Saved {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (s && typeof s.script === "string") return { script: s.script, cast: s.cast ?? {}, opts: { ...DEFAULT_OPTS, ...s.opts } };
  } catch {
    /* private window, blocked storage */
  }
  return { script: "", cast: {}, opts: DEFAULT_OPTS };
}
function save(s: Saved) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export default function FrutinovelaPanel() {
  const [saved] = useState(load);
  const [script, setScript] = useState(saved.script);
  const [cast, setCast] = useState<Record<string, CastMember>>(saved.cast);
  const [opts, setOpts] = useState<NovelaOptions>(saved.opts);
  const [info, setInfo] = useState<VoiceInfo | null>(null);
  const [err, setErr] = useState("");
  const [help, setHelp] = useState(false);
  const busy = useEditor((s) => s.busy);
  const assets = useEditor((s) => s.assets);
  const images = assets.filter((a) => a.kind === "image");
  const multiRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    voiceInfo().then(setInfo);
  }, []);
  useEffect(() => save({ script, cast, opts }), [script, cast, opts]);

  const parsed = useMemo(() => parseScript(script), [script]);

  // every character gets a voice, a pitch and a color as soon as it appears in the script
  const fullCast = useMemo(() => {
    const out: Record<string, CastMember> = {};
    parsed.characters.forEach((c, i) => {
      const def = info?.premium ? (info.voices[i % Math.max(1, info.voices.length)]?.id ?? "free") : "free";
      const cur = cast[c.key];
      out[c.key] = {
        assetId: cur?.assetId && assets.some((a) => a.id === cur.assetId) ? cur.assetId : undefined,
        voice: cur?.voice && (cur.voice === "free" || info?.voices.some((v) => v.id === cur.voice)) ? cur.voice : def,
        pitch: cur?.pitch ?? (info?.premium ? 1 : DEFAULT_PITCHES[i % DEFAULT_PITCHES.length]),
        color: cur?.color ?? NAME_COLORS[i % NAME_COLORS.length],
      };
    });
    return out;
  }, [parsed, cast, info, assets]);

  const setMember = (key: string, patch: Partial<CastMember>) =>
    setCast((c) => ({ ...c, [key]: { ...fullCast[key], ...c[key], ...patch } }));

  const missing = parsed.characters.filter((c) => !fullCast[c.key]?.assetId);
  const lines = parsed.beats.filter((b) => b.kind === "line").length;

  const uploadOne = async (key: string, f: File | undefined) => {
    if (!f) return;
    setErr("");
    try {
      const a = await addCharacterPhoto(f);
      setMember(key, { assetId: a.id });
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  // several photos at once: "frutilla.jpg" goes to Frutilla, "banana ricardo.png" to Banana Ricardo…
  const uploadMany = async (files: FileList | null) => {
    if (!files?.length) return;
    setErr("");
    const free = parsed.characters.filter((c) => !fullCast[c.key]?.assetId).map((c) => c.key);
    const notMatched: string[] = [];
    const patch: Record<string, string> = {};
    for (const f of Array.from(files)) {
      try {
        const a = await addCharacterPhoto(f);
        const base = charKey(f.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "));
        const hit =
          parsed.characters.find((c) => base === c.key) ??
          parsed.characters.find((c) => base.includes(c.key) || c.key.split(" ").some((w) => w.length > 2 && base.includes(w)));
        const key = hit?.key ?? free.find((k) => !patch[k]);
        if (key) patch[key] = a.id;
        else notMatched.push(f.name);
      } catch (e) {
        setErr((e as Error).message);
      }
    }
    setCast((c) => {
      const n = { ...c };
      for (const [k, id] of Object.entries(patch)) n[k] = { ...fullCast[k], ...c[k], assetId: id };
      return n;
    });
    if (notMatched.length) store.set({ toast: `Quedaron en Medios sin personaje: ${notMatched.join(", ")}.` });
  };

  const [testing, setTesting] = useState<string | null>(null);
  const testVoice = async (key: string) => {
    const m = fullCast[key];
    const first = parsed.beats.find((b) => b.kind === "line" && b.who === key);
    const text = first && first.kind === "line" ? first.text : "Hola, soy yo.";
    setTesting(key);
    setErr("");
    try {
      const premium = m.voice !== "free" && !!info?.premium;
      const lang = guessLang(text);
      const [r] = premium ? await synthesizePremium([tidy(text)], m.voice) : await synthesize([speakable(text, lang)], lang);
      const a = trim(r.audio, r.sampling_rate);
      const url = URL.createObjectURL(toWav(a, r.sampling_rate));
      const el = new Audio(url);
      // the pitch is the playback speed, as in the final video
      el.preservesPitch = false;
      el.playbackRate = m.pitch;
      el.onended = () => URL.revokeObjectURL(url);
      await el.play();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      store.set({ busy: null });
      setTesting(null);
    }
  };

  const build = async () => {
    setErr("");
    if (contentDuration(store.get().project) > 0 && !confirm("Esto reemplaza lo que hay en la línea de tiempo por la frutinovela (después podés deshacer con Ctrl+Z). ¿Seguimos?"))
      return;
    try {
      const r = await buildFrutinovela(script, fullCast, opts);
      store.set({
        toast: `¡Listo! Capítulo de ${Math.round(r.duration)} s con ${r.characters} personajes y ${r.lines} líneas. Dale play, y exportalo arriba a la derecha.`,
      });
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <div className="label">🍓 Frutinovela</div>
        <p className="text-[11px] text-[var(--muted)]">
          Pegá el guion, subí la foto de cada fruta y elegí su voz. Se arma el video solo: cada personaje aparece cuando habla, con su
          nombre, voz, subtítulos, zooms dramáticos y música.
        </p>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold">1. Guion</span>
          <div className="flex gap-1">
            <button className="btn !px-2 !py-1 text-[11px]" onClick={() => setHelp((v) => !v)}>
              ¿Cómo se escribe?
            </button>
            {!script.trim() && (
              <button className="btn !px-2 !py-1 text-[11px]" onClick={() => setScript(SAMPLE_SCRIPT)}>
                Cargar ejemplo
              </button>
            )}
          </div>
        </div>
        {help && (
          <div className="space-y-1 rounded-lg bg-[var(--panel-2)] p-2 text-[11px] text-[var(--muted)]">
            <p>
              <b className="text-white"># Título</b>: la primera línea con # es el nombre de la novela.
            </p>
            <p>
              <b className="text-white">Escena 2: La heladera</b>: cartel de escena.
            </p>
            <p>
              <b className="text-white">FRUTILLA: ¡Hola!</b>: diálogo (nombre, dos puntos y lo que dice).
            </p>
            <p>
              <b className="text-white">(susurrando)</b>: acotación, no se lee. Si dice “gritando” o “enojada”, tiembla la cámara.
            </p>
            <p>
              Al final de una línea: <b className="text-white">[drama]</b> triple zoom con “dun dun dun”, <b className="text-white">[boom]</b>,{" "}
              <b className="text-white">[temblor]</b>, <b className="text-white">[zoom]</b>, <b className="text-white">[flash]</b>,{" "}
              <b className="text-white">[pausa]</b>.
            </p>
            <p>
              <b className="text-white">CONTINUARÁ...</b>: cierre en blanco y negro.
            </p>
          </div>
        )}
        <textarea
          id="novela-script"
          className="input font-mono !text-xs"
          rows={10}
          value={script}
          onChange={(e) => setScript(e.target.value)}
          placeholder={"# Corazón de Frutilla\n\nEscena 1: El mercado\nFRUTILLA: ¡Hola! Soy nueva acá.\nBANANA: Nunca vi una frutilla tan roja. [zoom]\n\nCONTINUARÁ..."}
        />
        {script.trim() && (
          <p className="text-[11px] text-[var(--muted)]">
            {lines} líneas de diálogo · {parsed.characters.length} personajes
            {parsed.skipped ? ` · ${parsed.skipped} renglones sin “NOMBRE:” se toman como descripción y no se leen` : ""}
          </p>
        )}
      </div>

      {parsed.characters.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold">2. Personajes</span>
            <button className="btn !px-2 !py-1 text-[11px]" onClick={() => multiRef.current?.click()}>
              📷 Subir todas las fotos
            </button>
            <input
              id="novela-photos"
              ref={multiRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                uploadMany(e.target.files);
                e.target.value = "";
              }}
            />
          </div>
          <p className="text-[11px] text-[var(--muted)]">
            Si las fotos se llaman como el personaje (frutilla.jpg, banana.png) se asignan solas. Conviene que sean verticales.
          </p>
          {parsed.characters.map((c) => {
            const m = fullCast[c.key];
            const img = assets.find((a) => a.id === m.assetId);
            return (
              <div key={c.key} className="space-y-1.5 rounded-xl border border-[var(--line)] p-2">
                <div className="flex items-center gap-2">
                  <label
                    className="grid h-14 w-11 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-lg border border-dashed border-[var(--line)] bg-[var(--panel-2)] text-lg"
                    title="Subir foto"
                  >
                    {img ? <img src={img.url} alt={c.name} className="h-full w-full object-cover" /> : "📷"}
                    <input type="file" accept="image/*" hidden onChange={(e) => uploadOne(c.key, e.target.files?.[0])} />
                  </label>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <input
                        type="color"
                        aria-label={`Color del nombre de ${c.name}`}
                        className="h-4 w-4 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
                        value={m.color}
                        onChange={(e) => setMember(c.key, { color: e.target.value })}
                      />
                      <span className="truncate text-sm font-bold">{c.name}</span>
                    </div>
                    <div className="text-[11px] text-[var(--muted)]">
                      {c.lines} {c.lines === 1 ? "línea" : "líneas"}
                      {!img && <span className="text-amber-300"> · falta la foto</span>}
                    </div>
                  </div>
                  <button
                    className="btn !px-2 !py-1 text-[11px]"
                    disabled={!!testing || !!busy}
                    onClick={() => testVoice(c.key)}
                    title="Escuchar cómo suena"
                  >
                    {testing === c.key ? "…" : "▶ Voz"}
                  </button>
                </div>
                {images.length > 0 && (
                  <select
                    className="input !py-1 text-xs"
                    value={m.assetId ?? ""}
                    onChange={(e) => setMember(c.key, { assetId: e.target.value || undefined })}
                    aria-label={`Foto de ${c.name}`}
                  >
                    <option value="">Elegir una foto de Medios…</option>
                    {images.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                )}
                <div className="grid grid-cols-2 gap-1.5">
                  {info?.premium ? (
                    <select
                      className="input !py-1 text-xs"
                      value={m.voice}
                      onChange={(e) => setMember(c.key, { voice: e.target.value })}
                      aria-label={`Voz de ${c.name}`}
                    >
                      {info.voices.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name}
                          {v.info ? ` (${v.info})` : ""}
                        </option>
                      ))}
                      <option value="free">Voz básica</option>
                    </select>
                  ) : (
                    <span className="self-center text-[11px] text-[var(--muted)]">Voz básica</span>
                  )}
                  <select
                    className="input !py-1 text-xs"
                    value={m.pitch}
                    onChange={(e) => setMember(c.key, { pitch: Number(e.target.value) })}
                    aria-label={`Tono de ${c.name}`}
                  >
                    {[...PITCHES, ...(PITCHES.some((p) => p.v === m.pitch) ? [] : [{ v: m.pitch, label: `Tono ${m.pitch}` }])].map((p) => (
                      <option key={p.v} value={p.v}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            );
          })}
          {!info?.premium && (
            <p className="text-[11px] text-[var(--muted)]">
              Con la voz básica todos usan la misma voz; el tono (grave, aguda, ardilla) hace que cada fruta suene distinta.
            </p>
          )}
        </div>
      )}

      {parsed.characters.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-xs font-bold">3. Estilo</span>
          <select
            className="input text-xs"
            value={opts.music}
            onChange={(e) => setOpts((o) => ({ ...o, music: e.target.value as NovelaOptions["music"] }))}
            aria-label="Música"
          >
            <option value="emotiva">Música: piano dramático (telenovela)</option>
            <option value="chill">Música: tranquila</option>
            <option value="corporativa">Música: alegre (comedia)</option>
            <option value="energetica">Música: con ritmo</option>
            <option value="none">Sin música</option>
          </select>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={opts.effects} onChange={(e) => setOpts((o) => ({ ...o, effects: e.target.checked }))} />
            Zooms y temblores dramáticos
          </label>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={opts.subtitles} onChange={(e) => setOpts((o) => ({ ...o, subtitles: e.target.checked }))} />
            Subtítulos
          </label>
        </div>
      )}

      <button className="btn btn-primary w-full justify-center" disabled={!!busy || !lines || missing.length > 0} onClick={build}>
        🎬 Armar el video
      </button>
      {lines > 0 && missing.length > 0 && (
        <p className="text-[11px] text-amber-300">Falta la foto de: {missing.map((c) => c.name).join(", ")}.</p>
      )}
      {err && <p className="text-xs text-red-400">{err}</p>}
      <p className="text-[11px] text-[var(--muted)]">
        Queda armado en la línea de tiempo: podés cambiar cualquier cosa a mano o pedírselo al asistente, y exportarlo en 9:16 para
        TikTok o Reels.
        {info?.premium ? ` Las voces naturales usan 1 crédito de IA cada ${info.charsPerCredit ?? 200} letras.` : ""}
      </p>
    </div>
  );
}
