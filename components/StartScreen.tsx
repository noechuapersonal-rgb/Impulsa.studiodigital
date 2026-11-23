"use client";

import { useEffect, useRef, useState } from "react";
import { chooseProjectBrand } from "@/lib/brand";
import { FORMATS } from "@/lib/formats";
import { addFiles } from "@/lib/media";
import { fmt } from "@/lib/project";
import { store, useEditor } from "@/lib/store";
import { EDIT_STYLES } from "@/lib/styles";

const IDEAS = [
  { label: "🏪 Anuncio para mi local", text: "Armame un anuncio para Instagram de mi local: " },
  { label: "🛍️ Reel de producto", text: "Armame un Reel para vender este producto: " },
  { label: "💡 Tips de mi rubro", text: "Armame un Reel con 3 tips de mi rubro sobre: " },
  { label: "🏷️ Promo del mes", text: "Armame un video de oferta con urgencia para esta promo: " },
  { label: "⭐ Testimonio", text: "Armame un video con este testimonio de un cliente: " },
  { label: "🎬 Editá mis videos", text: "Editá estos videos para Instagram con onda: cortá lo que sobra, subtítulos, música y un cierre." },
];

/** "¿Qué video querés crear?" — the first thing a new project shows. */
export default function StartScreen() {
  const [text, setText] = useState("");
  const [format, setFormat] = useState("");
  const [style, setStyle] = useState("");
  const [more, setMore] = useState(false);
  const assets = useEditor((s) => s.assets);
  const busy = useEditor((s) => s.busy);
  const brands = useEditor((s) => s.brands);
  const brandId = useEditor((s) => s.project.brandId);
  const box = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    box.current?.focus();
  }, []);

  const create = () => {
    const t =
      text.trim() ||
      (assets.length ? "Armame un Reel para Instagram con onda con estos archivos: cortá lo que sobra, subtítulos, música y un cierre." : "");
    if (!t) {
      box.current?.focus();
      return;
    }
    store.set({ started: true });
    // the chat is mounted (hidden) and does the work; give it a moment to show
    setTimeout(() => window.dispatchEvent(new CustomEvent("impulsa-chat-send", { detail: { text: t, format, style } })), 150);
  };

  const manual = () => store.set({ started: true, mode: "avanzado" });

  return (
    <div className="scroll-thin flex min-h-0 flex-1 overflow-y-auto">
      <div className="m-auto w-full max-w-2xl px-4 py-8 md:py-12">
        <h1 className="text-center text-2xl font-black md:text-4xl">
          ¿Qué video <span className="grad-text">querés crear</span>?
        </h1>
        <p className="mt-2 text-center text-sm text-[var(--muted)]">
          Contale a la IA qué necesitás. Si tenés videos o fotos, subilos; si no, lo arma igual.
        </p>

        <div className="panel mt-6 rounded-2xl p-3 shadow-2xl">
          <textarea
            ref={box}
            id="start-prompt"
            rows={4}
            className="w-full resize-none bg-transparent p-2 text-base outline-none placeholder:text-[var(--muted)]"
            placeholder="Ej: un anuncio de 30 segundos para mi cafetería, con la promo de 2x1 en medialunas los martes y nuestro Instagram @micafe"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) create();
            }}
          />

          {assets.length > 0 && (
            <div className="scroll-thin flex gap-2 overflow-x-auto px-2 pb-2">
              {assets.map((a) => (
                <div key={a.id} className="relative h-16 w-12 shrink-0 overflow-hidden rounded-lg bg-black" title={a.name}>
                  {a.kind === "video" && <video src={a.url} className="h-full w-full object-cover" muted preload="metadata" />}
                  {a.kind === "image" && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.url} alt="" className="h-full w-full object-cover" />
                  )}
                  {a.kind === "audio" && <span className="grid h-full place-items-center text-xl">♪</span>}
                  {a.duration > 0 && (
                    <span className="absolute right-0.5 bottom-0.5 rounded bg-black/70 px-0.5 text-[9px]">{fmt(a.duration)}</span>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 border-t border-[var(--line)] px-1 pt-3">
            <label className={`btn cursor-pointer ${busy ? "pointer-events-none opacity-60" : ""}`}>
              📎 Subir videos y fotos
              <input
                id="start-files"
                type="file"
                multiple
                accept="video/*,image/*,audio/*"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
            {brands.length > 0 && (
              <select
                id="start-brand"
                className="input !w-auto"
                value={brandId ?? ""}
                onChange={(e) => chooseProjectBrand(e.target.value || null)}
                title="Para qué marca es"
              >
                <option value="">🎨 Sin marca</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    🎨 {b.name || "Marca sin nombre"}
                  </option>
                ))}
              </select>
            )}
            <button type="button" className="text-xs text-[var(--muted)] hover:text-white" onClick={() => setMore((v) => !v)}>
              {more ? "Menos opciones ▴" : "Más opciones ▾"}
            </button>
            <div className="flex-1" />
            <button className="btn btn-primary !px-5 !py-2.5" disabled={!!busy || (!text.trim() && !assets.length)} onClick={create}>
              ✨ Crear video
            </button>
          </div>

          {more && (
            <div className="mt-3 grid gap-2 px-1 sm:grid-cols-2">
              <label className="block space-y-1">
                <span className="label block">Formato</span>
                <select id="start-format" className="input" value={format} onChange={(e) => setFormat(e.target.value)}>
                  <option value="">Que lo elija la IA</option>
                  {FORMATS.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.emoji} {f.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1">
                <span className="label block">Estilo</span>
                <select id="start-style" className="input" value={style} onChange={(e) => setStyle(e.target.value)}>
                  <option value="">Que lo elija la IA</option>
                  {EDIT_STYLES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.emoji} {s.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
        </div>

        {busy && (
          <p className="mt-3 flex items-center justify-center gap-2 text-xs text-[var(--muted)]">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
            {busy}
          </p>
        )}

        <div className="mt-6">
          <div className="mb-2 text-center text-xs text-[var(--muted)]">Ideas para arrancar</div>
          <div className="flex flex-wrap justify-center gap-2">
            {IDEAS.map((i) => (
              <button
                key={i.label}
                className="rounded-full border border-[var(--line)] px-3 py-1.5 text-xs text-[var(--muted)] hover:border-[var(--accent)] hover:text-white"
                onClick={() => {
                  setText(i.text);
                  setTimeout(() => {
                    const el = box.current;
                    if (el) {
                      el.focus();
                      el.setSelectionRange(el.value.length, el.value.length);
                    }
                  }, 0);
                }}
              >
                {i.label}
              </button>
            ))}
          </div>
        </div>

        <p className="mt-8 text-center text-xs text-[var(--muted)]">
          ¿Preferís hacerlo vos?{" "}
          <button className="underline hover:text-white" onClick={manual}>
            Editar a mano
          </button>
        </p>
      </div>
    </div>
  );
}
