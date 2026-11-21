"use client";

import { getPlayer } from "@/lib/player";
import { splitClipAt } from "@/lib/project";
import { store, useEditor } from "@/lib/store";
import { MOTION_DEFAULT_ACCENT } from "@/lib/motion";
import {
  EFFECT_LABELS,
  EFFECT_TYPES,
  MOTION_LABELS,
  type Animation,
  type EffectType,
  type Motion,
  type Project,
  type TextPreset,
} from "@/lib/types";
import { deleteSelection } from "@/lib/actions";
import ColorField from "./ColorField";
import FontSelect from "./FontSelect";
import Field from "./Field";

/** Updates an item in place; consecutive edits of the same field are merged into one undo step. */
let lastKey = "";
function update(key: string, fn: (p: Project) => Project) {
  if (key === lastKey) store.set((s) => ({ project: fn(s.project) }));
  else store.edit(fn);
  lastKey = key;
}

export default function Inspector() {
  const sel = useEditor((s) => s.selection);
  const project = useEditor((s) => s.project);
  const assets = useEditor((s) => s.assets);

  if (!sel)
    return <p className="text-sm text-[var(--muted)]">Selecciona un elemento en la línea de tiempo o en el visor para editar sus propiedades.</p>;

  const header = (title: string) => (
    <div className="mb-3 flex items-center justify-between">
      <div className="font-bold">{title}</div>
      <button className="text-xs text-red-400 hover:text-red-300" onClick={deleteSelection}>
        Eliminar
      </button>
    </div>
  );

  const timeFields = (start: number, end: number, set: (s: number, e: number) => void) => (
    <div className="grid grid-cols-2 gap-2">
      <Field label="Inicio (s)">
        <input className="input" type="number" step={0.1} value={start.toFixed(2)} onChange={(e) => set(Number(e.target.value), end)} />
      </Field>
      <Field label="Fin (s)">
        <input className="input" type="number" step={0.1} value={end.toFixed(2)} onChange={(e) => set(start, Number(e.target.value))} />
      </Field>
    </div>
  );

  if (sel.kind === "clip") {
    const c = project.clips.find((x) => x.id === sel.id);
    if (!c) return null;
    return (
      <div className="space-y-3">
        {header("Clip de video")}
        <div className="text-xs text-[var(--muted)]">{assets.find((a) => a.id === c.assetId)?.name}</div>
        <Field label={`Volumen ${Math.round(c.volume * 100)}%`}>
          <input
            type="range"
            min={0}
            max={2}
            step={0.05}
            value={c.volume}
            className="w-full"
            onChange={(e) =>
              update(`vol${c.id}`, (p) => ({ ...p, clips: p.clips.map((x) => (x.id === c.id ? { ...x, volume: Number(e.target.value) } : x)) }))
            }
          />
        </Field>
        <button className="btn w-full justify-center" onClick={() => store.edit((p) => splitClipAt(p, store.get().time))}>
          ✂ Dividir en el cabezal (S)
        </button>
        <div className="flex gap-2">
          <button className="btn flex-1 justify-center" onClick={() => move(c.id, -1)}>
            ← Mover antes
          </button>
          <button className="btn flex-1 justify-center" onClick={() => move(c.id, 1)}>
            Mover después →
          </button>
        </div>
      </div>
    );
  }

  if (sel.kind === "overlay") {
    const o = project.overlays.find((x) => x.id === sel.id);
    if (!o) return null;
    const set = (patch: Partial<typeof o>, key = Object.keys(patch).join()) =>
      update(`${o.id}${key}`, (p) => ({ ...p, overlays: p.overlays.map((x) => (x.id === o.id ? { ...x, ...patch } : x)) }));
    return (
      <div className="space-y-3">
        {header(o.kind === "text" ? "Texto" : "Foto")}
        {o.kind === "image" && (
          <div className="space-y-2">
            <span className="label block">¿Cómo se ve la foto?</span>
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  ["cover", "⬛", "Pantalla completa"],
                  ["contain", "🖼", "Sin recortar"],
                  ["free", "↔", "Libre"],
                ] as const
              ).map(([value, icon, label]) => {
                const on = (o.fill ?? "free") === value;
                return (
                  <button
                    key={value}
                    onClick={() => set({ fill: value })}
                    className={`flex flex-col items-center gap-1 rounded-xl border px-1 py-2.5 text-[11px] font-semibold ${on ? "border-[var(--accent)] bg-[var(--accent)]/20 text-white" : "border-[var(--line)] text-[var(--muted)]"}`}
                  >
                    <span className="text-lg">{icon}</span>
                    {label}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-[var(--muted)]">
              {(o.fill ?? "free") === "cover"
                ? "Llena toda la pantalla del formato elegido y recorta lo que sobra."
                : o.fill === "contain"
                  ? "Se ve la foto entera, con un fondo desenfocado donde sobra espacio."
                  : "Tamaño y lugar libres: arrastrala en el video y usá «Tamaño». Ideal para logos."}
            </p>
            <button
              className="text-xs font-semibold text-[var(--accent)] hover:underline"
              onClick={() =>
                store.edit((p) => ({
                  ...p,
                  overlays: p.overlays.map((x) =>
                    x.kind === "image" && !(x.end - x.start >= 0.9 * Math.max(0.1, p.clips.reduce((a, c) => a + c.out - c.in, 0)) && x.size < 0.3)
                      ? { ...x, fill: o.fill ?? "free" }
                      : x,
                  ),
                }))
              }
            >
              Aplicar a todas las fotos
            </button>
          </div>
        )}
        {o.kind === "text" && (
          <>
            <Field label="Texto">
              <textarea className="input" rows={2} value={o.text} onChange={(e) => set({ text: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Estilo">
                <select className="input" value={o.preset} onChange={(e) => set({ preset: e.target.value as TextPreset })}>
                  <option value="titulo">Título</option>
                  <option value="subtitulo">Subtítulo</option>
                  <option value="etiqueta">Etiqueta</option>
                  <option value="cta">Botón CTA</option>
                </select>
              </Field>
              <Field label="Color">
                <ColorField id={`text-color-${o.id}`} value={o.color ?? (o.preset === "etiqueta" || o.preset === "cta" ? "#ff3d71" : "#ffffff")} onChange={(c) => set({ color: c })} />
              </Field>
            </div>
            {(o.preset === "titulo" || o.preset === "subtitulo" || !o.preset) && (
              <Field label="Contorno de las letras">
                <select
                  id={`text-outline-${o.id}`}
                  className="input"
                  value={o.outline ?? "borde"}
                  onChange={(e) => set({ outline: e.target.value as "borde" | "sombra" | "nada" })}
                >
                  <option value="borde">Borde negro</option>
                  <option value="sombra">Sombra suave</option>
                  <option value="nada">Sin borde</option>
                </select>
              </Field>
            )}
            <Field label="Tipografía">
              <FontSelect id={`text-font-${o.id}`} value={o.font ?? ""} emptyLabel="La del video" onChange={(f) => set({ font: f || undefined })} />
            </Field>
          </>
        )}
        {timeFields(o.start, o.end, (s, e) => set({ start: s, end: Math.max(s + 0.1, e) }, "time"))}
        {(o.kind === "text" || !o.fill || o.fill === "free") && (
          <Field label={`Tamaño ${o.size.toFixed(2)}`}>
            <input type="range" min={o.kind === "image" ? 0.05 : 0.3} max={o.kind === "image" ? 1 : 3} step={0.01} value={o.size} className="w-full" onChange={(e) => set({ size: Number(e.target.value) })} />
          </Field>
        )}
        <Field label="Animación">
          <select className="input" value={o.animation} onChange={(e) => set({ animation: e.target.value as Animation })}>
            <option value="none">Ninguna</option>
            <option value="fade">Fundido</option>
            <option value="pop">Pop</option>
            <option value="slide_up">Deslizar arriba</option>
            {o.kind === "text" && <option value="typewriter">Máquina de escribir</option>}
          </select>
        </Field>
      </div>
    );
  }

  if (sel.kind === "motion") {
    const m = (project.motions ?? []).find((x) => x.id === sel.id);
    if (!m) return null;
    const set = (patch: Partial<Motion>, key = Object.keys(patch).join()) =>
      update(`${m.id}${key}`, (p) => ({ ...p, motions: (p.motions ?? []).map((x) => (x.id === m.id ? { ...x, ...patch } : x)) }));
    const txt = (label: string, k: "text" | "label" | "value" | "sub", placeholder = "", rows = 1) => (
      <Field label={label}>
        {rows > 1 ? (
          <textarea className="input" rows={rows} value={m[k] ?? ""} placeholder={placeholder} onChange={(e) => set({ [k]: e.target.value })} />
        ) : (
          <input className="input" value={m[k] ?? ""} placeholder={placeholder} onChange={(e) => set({ [k]: e.target.value })} />
        )}
      </Field>
    );
    const numF = (label: string, k: "from" | "to") => (
      <Field label={label}>
        <input className="input" type="number" value={m[k] ?? ""} onChange={(e) => set({ [k]: e.target.value === "" ? undefined : Number(e.target.value) })} />
      </Field>
    );
    return (
      <div className="space-y-3">
        {header(MOTION_LABELS[m.type])}
        {m.type === "titulo_animado" && (
          <>
            {txt("Texto", "text", "LO ÚNICO QUE PIDIÓ: [ALGO SIMPLE]", 2)}
            <p className="-mt-1 text-[11px] text-[var(--muted)]">
              Poné <b>[palabras]</b> entre corchetes para una caja de color, o <b>*palabras*</b> entre asteriscos para
              pintarlas del color de acento.
            </p>
          </>
        )}
        {m.type === "contador" && (
          <>
            <div className="grid grid-cols-2 gap-2">
              {numF("Desde", "from")}
              {numF("Hasta", "to")}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {txt("Unidad", "label", "pedidos")}
              {txt("Prefijo", "value", "$")}
            </div>
            {txt("Rótulo arriba", "text", "Clientes nuevos")}
          </>
        )}
        {m.type === "lista" && (
          <>
            {txt("Título (opcional)", "label", "Incluye")}
            <Field label="Ítems (uno por línea)">
              <textarea
                className="input"
                rows={5}
                value={(m.items ?? []).join("\n")}
                onChange={(e) => set({ items: e.target.value.split("\n").slice(0, 8) })}
              />
            </Field>
          </>
        )}
        {m.type === "tarjeta" && (
          <>
            {txt("Rótulo", "label", "PLAN MENSUAL")}
            {txt("Dato grande", "value", "$ 28.000")}
            {txt("Aclaración", "sub", "Sin comisiones")}
          </>
        )}
        {m.type === "audio" && (
          <div className="grid grid-cols-2 gap-2">
            {txt("Nombre", "text", "Diego")}
            {txt("Duración", "value", "0:36")}
          </div>
        )}
        {m.type === "cierre" && (
          <>
            {txt("Frase", "text", "¿TENÉS UN NEGOCIO?", 2)}
            {txt("Aclaración", "sub", "Escribinos y te contamos")}
            {txt("Botón", "label", "ESCRIBINOS")}
          </>
        )}
        {m.type === "progreso" && (
          <div className="grid grid-cols-2 gap-2">
            {txt("Qué mide", "label", "Ventas")}
            {numF("Porcentaje", "to")}
          </div>
        )}
        {m.type === "emoji" && txt("Emoji", "value", "🔥")}
        {m.type === "hud_juego" && (
          <>
            <div className="grid grid-cols-2 gap-2">
              {numF("Dinero desde", "from")}
              {numF("Dinero hasta", "to")}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {txt("Estrellas (0–5)", "value", "2")}
              {txt("Hora", "label", "12:45")}
            </div>
            {txt("Lugar (junto al mapa)", "text", "Centro")}
          </>
        )}
        {m.type === "mision" && (
          <>
            {txt("Título", "text", "MISIÓN CUMPLIDA")}
            {txt("Recompensa", "sub", "+ $5.000")}
            {txt("Indicación arriba a la izquierda", "label", "Ve a la barbería", 2)}
          </>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Field label="Color de acento">
            <ColorField id={`motion-accent-${m.id}`} value={m.accent ?? project.brandColor ?? MOTION_DEFAULT_ACCENT} onChange={(c) => set({ accent: c })} />
          </Field>
          <Field label="Color del texto">
            <ColorField id={`motion-color-${m.id}`} value={m.color ?? "#ffffff"} onChange={(c) => set({ color: c })} />
          </Field>
        </div>
        {m.type !== "emoji" && (
          <Field label="Tipografía">
            <FontSelect id={`motion-font-${m.id}`} value={m.font ?? ""} emptyLabel="La del video" onChange={(f) => set({ font: f || undefined })} />
          </Field>
        )}
        {timeFields(m.start, m.end, (s, e) => set({ start: s, end: Math.max(s + 0.3, e) }, "time"))}
        <div className="grid grid-cols-2 gap-2">
          <Field label={`Altura ${Math.round(m.y * 100)}%`}>
            <input type="range" min={0.05} max={0.95} step={0.01} value={m.y} className="w-full" onChange={(e) => set({ y: Number(e.target.value) })} />
          </Field>
          <Field label={`Tamaño ${m.size.toFixed(2)}`}>
            <input type="range" min={0.4} max={2.5} step={0.01} value={m.size} className="w-full" onChange={(e) => set({ size: Number(e.target.value) })} />
          </Field>
        </div>
        <Field label={`Horizontal ${Math.round(m.x * 100)}%`}>
          <input type="range" min={0.05} max={0.95} step={0.01} value={m.x} className="w-full" onChange={(e) => set({ x: Number(e.target.value) })} />
        </Field>
      </div>
    );
  }

  if (sel.kind === "effect") {
    const fx = project.effects.find((x) => x.id === sel.id);
    if (!fx) return null;
    const set = (patch: Partial<typeof fx>, key = Object.keys(patch).join()) =>
      update(`${fx.id}${key}`, (p) => ({ ...p, effects: p.effects.map((x) => (x.id === fx.id ? { ...x, ...patch } : x)) }));
    return (
      <div className="space-y-3">
        {header("Efecto")}
        <Field label="Tipo">
          <select className="input" value={fx.type} onChange={(e) => set({ type: e.target.value as EffectType })}>
            {EFFECT_TYPES.map((t) => (
              <option key={t} value={t}>
                {EFFECT_LABELS[t]}
              </option>
            ))}
          </select>
        </Field>
        {timeFields(fx.start, fx.end, (s, e) => set({ start: s, end: Math.max(s + 0.1, e) }, "time"))}
        <Field label={`Intensidad ${Math.round(fx.intensity * 100)}%`}>
          <input type="range" min={0} max={1} step={0.05} value={fx.intensity} className="w-full" onChange={(e) => set({ intensity: Number(e.target.value) })} />
        </Field>
      </div>
    );
  }

  if (sel.kind === "audio") {
    const a = project.audio.find((x) => x.id === sel.id);
    if (!a) return null;
    const set = (patch: Partial<typeof a>, key = Object.keys(patch).join()) =>
      update(`${a.id}${key}`, (p) => ({ ...p, audio: p.audio.map((x) => (x.id === a.id ? { ...x, ...patch } : x)) }));
    return (
      <div className="space-y-3">
        {header(a.kind === "music" ? "Música" : a.kind === "voice" ? (a.name.startsWith("Voz grabada") ? "Voz grabada" : "Voz IA") : "Efecto de sonido")}
        <div className="text-xs text-[var(--muted)]">{a.name}</div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Inicio (s)">
            <input className="input" type="number" step={0.1} value={a.start.toFixed(2)} onChange={(e) => set({ start: Math.max(0, Number(e.target.value)) })} />
          </Field>
          {a.kind === "music" && (
            <Field label="Duración (s)">
              <input className="input" type="number" step={0.1} value={a.duration.toFixed(2)} onChange={(e) => set({ duration: Math.max(0.1, Number(e.target.value)) })} />
            </Field>
          )}
        </div>
        <Field label={`Volumen ${Math.round(a.volume * 100)}%`}>
          <input type="range" min={0} max={2} step={0.05} value={a.volume} className="w-full" onChange={(e) => set({ volume: Number(e.target.value) })} />
        </Field>
        {a.kind === "music" && (
          <div className="grid grid-cols-2 gap-2">
            <Field label="Fundido entrada (s)">
              <input className="input" type="number" step={0.5} min={0} value={a.fadeIn} onChange={(e) => set({ fadeIn: Math.max(0, Number(e.target.value)) })} />
            </Field>
            <Field label="Fundido salida (s)">
              <input className="input" type="number" step={0.5} min={0} value={a.fadeOut} onChange={(e) => set({ fadeOut: Math.max(0, Number(e.target.value)) })} />
            </Field>
          </div>
        )}
        <p className="text-[11px] text-[var(--muted)]">Los cambios de audio se aplican al volver a reproducir.</p>
      </div>
    );
  }

  if (sel.kind === "cue") {
    const c = project.cues.find((x) => x.id === sel.id);
    if (!c) return null;
    const set = (patch: Partial<typeof c>, key = Object.keys(patch).join()) =>
      update(`${c.id}${key}`, (p) => ({ ...p, cues: p.cues.map((x) => (x.id === c.id ? { ...x, ...patch } : x)) }));
    return (
      <div className="space-y-3">
        {header("Subtítulo")}
        <Field label="Texto">
          <textarea className="input" rows={2} value={c.text} onChange={(e) => set({ text: e.target.value })} />
        </Field>
        {timeFields(c.start, c.end, (s, e) => set({ start: s, end: Math.max(s + 0.1, e) }, "time"))}
        <button className="btn w-full justify-center" onClick={() => getPlayer()?.seek(c.start + 0.01)}>
          Ir a este subtítulo
        </button>
      </div>
    );
  }
  return null;
}

function move(id: string, dir: -1 | 1) {
  store.edit((p) => {
    const i = p.clips.findIndex((c) => c.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= p.clips.length) return p;
    const clips = [...p.clips];
    [clips[i], clips[j]] = [clips[j], clips[i]];
    return { ...p, clips };
  });
}
