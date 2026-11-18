"use client";

import { useEffect, useState } from "react";
import { BRAND_FONTS, fontFromFile, loadFont, MAX_FONT_FILES, photoForAI } from "@/lib/brand";
import type { CustomFont } from "@/lib/types";

type Match = { name: string; why: string; ok?: boolean };

/**
 * Typography of the brand: the built-in list, the client's own font files and fonts recognized by the AI
 * from a photo.
 */
export default function FontPicker({
  font,
  fonts,
  onChange,
}: {
  font: string;
  fonts: CustomFont[];
  onChange: (patch: { font?: string; fonts?: CustomFont[] }) => void;
}) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ identified: string | null; matches: Match[]; note: string } | null>(null);

  useEffect(() => {
    loadFont(font, fonts);
  }, [font, fonts]);

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

  const fromPhoto = async (file: File) => {
    setError("");
    setResult(null);
    setBusy("La IA está mirando la foto…");
    try {
      const image = await photoForAI(file);
      const res = await fetch("/api/font-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "No se pudo analizar la foto.");
      setBusy("Cargando las tipografías parecidas…");
      const matches: Match[] = await Promise.all(
        (data.matches as Match[]).map(async (m) => ({ ...m, ok: await loadFont(m.name, []) })),
      );
      setResult({ identified: data.identified, matches, note: data.note });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  };

  const useGoogle = (name: string) => {
    const known = BRAND_FONTS.some((f) => f.name === name) || fonts.some((f) => f.name === name);
    onChange({ font: name, fonts: known ? fonts : [...fonts, { name, source: "google" }] });
    setResult(null);
  };

  const remove = (name: string) => {
    onChange({ fonts: fonts.filter((f) => f.name !== name), ...(font === name ? { font: "Montserrat" } : {}) });
  };

  return (
    <div className="space-y-2">
      <span className="label block">Tipografía</span>
      <select id="brand-font" className="input" value={font} onChange={(e) => onChange({ font: e.target.value })}>
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
      </select>

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
          📷 Desde una foto
          <input
            id="font-photo"
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) fromPhoto(f);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      <p className="text-[10px] text-[var(--muted)]">
        «Subir tipografía»: el archivo de tu letra (.ttf, .otf, .woff o .woff2). «Desde una foto»: una captura de un
        cartel, logo o Reel con la letra que te gusta; la IA busca la más parecida (usa 1 crédito).
      </p>
      {busy && <p className="text-xs text-[var(--muted)]">{busy}</p>}
      {error && <p className="text-xs text-red-400">{error}</p>}

      {result && (
        <div className="space-y-2 rounded-lg border border-[var(--line)] p-2">
          <p className="text-xs">
            {result.identified ? (
              <>
                Parece <b>{result.identified}</b>. Estas son las más parecidas gratis:
              </>
            ) : (
              "Estas son las más parecidas:"
            )}
          </p>
          {result.note && <p className="text-[11px] text-[var(--muted)]">{result.note}</p>}
          {result.matches.map((m) => (
            <div key={m.name} className="rounded-lg bg-[var(--panel-2)] p-2">
              <div className="truncate text-xl" style={{ fontFamily: `"${m.name}", sans-serif` }}>
                {m.name} · Aa Bb 123
              </div>
              <p className="text-[11px] text-[var(--muted)]">{m.why}</p>
              {m.ok ? (
                <button className="btn btn-primary mt-1 !py-1 text-xs" onClick={() => useGoogle(m.name)}>
                  Usar esta
                </button>
              ) : (
                <p className="mt-1 text-[11px] text-amber-300">No está disponible en Google Fonts.</p>
              )}
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
