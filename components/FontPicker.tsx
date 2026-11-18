"use client";

import { useEffect, useState } from "react";
import { BRAND_FONTS, fontFromFile, loadFont, MAX_FONT_FILES, photoForAI } from "@/lib/brand";
import type { CustomFont } from "@/lib/types";
import Field from "./Field";

type Match = { name: string; why: string; ok?: boolean };
type PhotoResult = { identified: string | null; matches: Match[]; note: string; thumb: string };
type Combo = { title: string; body: string; why: string; ok: boolean };
const MAX_PHOTOS = 4;

/**
 * Typography of the brand: the built-in list, the client's own font files and fonts recognized by the AI
 * from a photo.
 */
export default function FontPicker({
  font,
  titleFont,
  fonts,
  onChange,
}: {
  font: string;
  titleFont?: string;
  fonts: CustomFont[];
  onChange: (patch: { font?: string; titleFont?: string; fonts?: CustomFont[] }) => void;
}) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ photos: PhotoResult[]; combo: Combo | null } | null>(null);

  useEffect(() => {
    loadFont(font, fonts);
    if (titleFont) loadFont(titleFont, fonts);
  }, [font, titleFont, fonts]);

  const upload = async (file: File) => {
    setError("");
    if (fonts.filter((f) => f.source === "file").length >= MAX_FONT_FILES)
      return setError(`Podés subir hasta ${MAX_FONT_FILES} tipografías. Quitá una para agregar otra.`);
    setBusy("Cargando tipografía…");
    try {
      const f = await fontFromFile(file);
      let name = f.name;
      for (let i = 2; fonts.some((x) => x.name === name) || BRAND_FONTS.some((x) => x.name === name); i++) name = `${f.name} ${i}`;
      const nf = { ...f, name };
      await loadFont(name, [nf]);
      onChange({ fonts: [...fonts, nf], font: name });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  };

  const fromPhotos = async (files: File[]) => {
    setError("");
    setResult(null);
    if (files.length > MAX_PHOTOS) setError(`Se usan las primeras ${MAX_PHOTOS} fotos.`);
    const list = files.slice(0, MAX_PHOTOS);
    setBusy(list.length > 1 ? `La IA está mirando las ${list.length} fotos…` : "La IA está mirando la foto…");
    try {
      const images = await Promise.all(list.map((f) => photoForAI(f, 1000)));
      const res = await fetch("/api/font-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "No se pudo analizar la foto.");
      setBusy("Cargando las tipografías parecidas…");
      const check = (n: string) => loadFont(n, []);
      const photos: PhotoResult[] = await Promise.all(
        (data.photos as Omit<PhotoResult, "thumb">[]).map(async (p, i) => ({
          ...p,
          thumb: `data:image/jpeg;base64,${images[i]}`,
          matches: await Promise.all(p.matches.map(async (m) => ({ ...m, ok: await check(m.name) }))),
        })),
      );
      let combo: Combo | null = null;
      if (data.combo) {
        const [a, b] = await Promise.all([check(data.combo.title), check(data.combo.body)]);
        combo = { ...data.combo, ok: a && b };
      }
      setResult({ photos, combo });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  };

  const withGoogle = (list: CustomFont[], ...names: string[]) => {
    const out = [...list];
    for (const name of names)
      if (!BRAND_FONTS.some((f) => f.name === name) && !out.some((f) => f.name === name)) out.push({ name, source: "google" });
    return out;
  };

  const useGoogle = (name: string) => {
    onChange({ font: name, fonts: withGoogle(fonts, name) });
    setResult(null);
  };

  const useCombo = (c: Combo) => {
    onChange({ font: c.body, titleFont: c.title === c.body ? "" : c.title, fonts: withGoogle(fonts, c.title, c.body) });
    setResult(null);
  };

  const remove = (name: string) => {
    onChange({
      fonts: fonts.filter((f) => f.name !== name),
      ...(font === name ? { font: "Montserrat" } : {}),
      ...(titleFont === name ? { titleFont: "" } : {}),
    });
  };

  const options = (
    <>
      {fonts.length > 0 && (
        <optgroup label="Tus tipografías">
          {fonts.map((f) => (
            <option key={f.name} value={f.name}>
              {f.name} {f.source === "file" ? "(subida)" : "(Google Fonts)"}
            </option>
          ))}
        </optgroup>
      )}
      <optgroup label="Recomendadas">
        {BRAND_FONTS.map((f) => (
          <option key={f.name} value={f.name}>
            {f.name} — {f.style}
          </option>
        ))}
      </optgroup>
    </>
  );

  const sample = (name: string, text: string, cls = "text-xl") => (
    <div className={`truncate ${cls}`} style={{ fontFamily: `"${name}", sans-serif` }}>
      {text}
    </div>
  );

  return (
    <div className="space-y-2">
      <Field label="Tipografía de textos y subtítulos">
        <select id="brand-font" className="input" value={font} onChange={(e) => onChange({ font: e.target.value })}>
          {options}
        </select>
      </Field>
      <Field label="Tipografía de títulos">
        <select id="brand-title-font" className="input" value={titleFont ?? ""} onChange={(e) => onChange({ titleFont: e.target.value })}>
          <option value="">La misma</option>
          {options}
        </select>
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <label className={`btn cursor-pointer justify-center !py-1.5 text-xs ${busy ? "pointer-events-none opacity-60" : ""}`}>
          🔤 Subir tipografía
          <input
            id="font-file"
            type="file"
            accept=".ttf,.otf,.woff,.woff2"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload(f);
              e.target.value = "";
            }}
          />
        </label>
        <label className={`btn cursor-pointer justify-center !py-1.5 text-xs ${busy ? "pointer-events-none opacity-60" : ""}`}>
          📷 Desde fotos
          <input
            id="font-photo"
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              const fs = Array.from(e.target.files ?? []);
              if (fs.length) fromPhotos(fs);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      <p className="text-[10px] text-[var(--muted)]">
        «Subir tipografía»: el archivo de tu letra (.ttf, .otf, .woff o .woff2). «Desde fotos»: elegí de 1 a{" "}
        {MAX_PHOTOS} capturas de carteles, logos o Reels con letras que te gustan; la IA encuentra las más parecidas y
        te arma una combinación para títulos y textos (usa 1 crédito).
      </p>
      {busy && <p className="text-xs text-[var(--muted)]">{busy}</p>}
      {error && <p className="text-xs text-red-400">{error}</p>}

      {result && (
        <div className="space-y-3 rounded-lg border border-[var(--line)] p-2">
          {result.combo && (
            <div className="rounded-lg border border-[var(--accent)]/60 bg-[var(--panel-2)] p-2">
              <p className="text-xs font-bold">✨ Combinación recomendada</p>
              {sample(result.combo.title, "Así se ve un título", "mt-1 text-2xl")}
              {sample(result.combo.body, "Y así los textos y subtítulos.", "text-sm")}
              <p className="mt-1 text-[11px]">
                Títulos: <b>{result.combo.title}</b> · Textos: <b>{result.combo.body}</b>
              </p>
              <p className="mt-1 text-[11px] text-[var(--muted)]">{result.combo.why}</p>
              {result.combo.ok ? (
                <button className="btn btn-primary mt-1 !py-1 text-xs" onClick={() => useCombo(result.combo!)}>
                  Usar combinación
                </button>
              ) : (
                <p className="mt-1 text-[11px] text-amber-300">Alguna de estas no está disponible en Google Fonts.</p>
              )}
            </div>
          )}
          {result.photos.map((ph, i) => (
            <div key={i} className="space-y-1.5">
              <div className="flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={ph.thumb} alt={`Foto ${i + 1}`} className="h-10 w-10 shrink-0 rounded object-cover" />
                <p className="text-xs">
                  {result.photos.length > 1 && <b>Foto {i + 1}: </b>}
                  {ph.identified ? (
                    <>
                      parece <b>{ph.identified}</b>. Parecidas gratis:
                    </>
                  ) : (
                    "las más parecidas:"
                  )}
                </p>
              </div>
              {ph.note && <p className="text-[11px] text-[var(--muted)]">{ph.note}</p>}
              {ph.matches.map((m) => (
                <div key={m.name} className="rounded-lg bg-[var(--panel-2)] p-2">
                  {sample(m.name, `${m.name} · Aa Bb 123`)}
                  <p className="text-[11px] text-[var(--muted)]">{m.why}</p>
                  {m.ok ? (
                    <div className="mt-1 flex gap-1.5">
                      <button className="btn !py-1 text-xs" onClick={() => useGoogle(m.name)}>
                        Para textos
                      </button>
                      <button
                        className="btn !py-1 text-xs"
                        onClick={() => {
                          onChange({ titleFont: m.name, fonts: withGoogle(fonts, m.name) });
                          setResult(null);
                        }}
                      >
                        Para títulos
                      </button>
                    </div>
                  ) : (
                    <p className="mt-1 text-[11px] text-amber-300">No está disponible en Google Fonts.</p>
                  )}
                </div>
              ))}
            </div>
          ))}
          <button className="text-[11px] text-[var(--muted)] hover:text-white" onClick={() => setResult(null)}>
            Cerrar
          </button>
        </div>
      )}

      {fonts.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {fonts.map((f) => (
            <span key={f.name} className="flex items-center gap-1 rounded-full border border-[var(--line)] px-2 py-0.5 text-[11px]">
              <span style={{ fontFamily: `"${f.name}", sans-serif` }}>{f.name}</span>
              <button className="text-[var(--muted)] hover:text-red-400" title="Quitar" onClick={() => remove(f.name)}>
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
