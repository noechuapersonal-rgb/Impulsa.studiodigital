"use client";

import { useEffect, useState } from "react";
import { applyBrand, chooseProjectBrand, deleteBrand, emptyBrand, findBrandByName, logoToDataUrl, saveBrand } from "@/lib/brand";
import { uid } from "@/lib/project";
import { contentDuration } from "@/lib/project";
import { store, useEditor } from "@/lib/store";
import type { BrandKit } from "@/lib/types";
import ColorField from "./ColorField";
import Field from "./Field";
import FontPicker from "./FontPicker";

export default function BrandPanel() {
  const saved = useEditor((s) => s.brand);
  const brands = useEditor((s) => s.brands);
  const hasVideo = useEditor((s) => contentDuration(s.project) > 0);
  const [b, setB] = useState<BrandKit>(saved ?? emptyBrand());
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setB(saved ?? emptyBrand());
    setConfirmDelete(false);
  }, [saved]);

  const match = query.trim() ? findBrandByName(query) : undefined;
  const choose = async () => {
    const name = query.trim();
    if (!name) return;
    setStatus("");
    if (match) chooseProjectBrand(match.id!);
    else {
      // a new brand: create it with this name and use it for this project
      const nb: BrandKit = { ...emptyBrand(), id: uid(), name };
      await saveBrand(nb);
      chooseProjectBrand(nb.id!);
      setStatus("✓ Marca nueva creada: completá sus datos y guardala");
    }
    setQuery("");
  };

  const set = (patch: Partial<BrandKit>) => {
    setB((x) => ({ ...x, ...patch }));
    setStatus("");
  };

  const save = async () => {
    setBusy(true);
    const where = await saveBrand(b);
    setBusy(false);
    setStatus(where === "cuenta" ? "✓ Guardado en tu cuenta" : "✓ Guardado en este navegador");
  };

  const apply = async () => {
    await save();
    await applyBrand(b);
    setStatus("✓ Marca aplicada al video");
  };

  const chooser = (
    <div className="space-y-2 rounded-xl border border-[var(--accent)]/40 bg-[var(--accent)]/10 p-3">
      <div className="text-sm font-bold">
        {saved ? (
          <>
            Este proyecto es para: <span className="text-[var(--accent)]">{saved.name || "Marca sin nombre"}</span>
          </>
        ) : (
          "¿Para qué marca es este video?"
        )}
      </div>
      <div className="flex gap-1.5">
        <input
          id="brand-search"
          className="input"
          list="brand-names"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && choose()}
          placeholder={saved ? "Cambiar a otra marca…" : "Escribí el nombre de la marca"}
        />
        <datalist id="brand-names">
          {brands.map((x) => (
            <option key={x.id} value={x.name} />
          ))}
        </datalist>
        <button className="btn btn-primary shrink-0" disabled={!query.trim()} onClick={choose}>
          {match ? "Usar" : "Crear"}
        </button>
      </div>
      {query.trim() && (
        <p className="text-[11px] text-[var(--muted)]">
          {match ? `Se cargan todos los datos guardados de «${match.name}».` : `«${query.trim()}» es una marca nueva: se crea vacía.`}
        </p>
      )}
      {brands.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {brands.map((x) => (
            <button
              key={x.id}
              onClick={() => {
                setStatus("");
                chooseProjectBrand(x.id!);
              }}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] ${saved?.id === x.id ? "border-[var(--accent)] bg-[var(--panel)] text-white" : "border-[var(--line)] text-[var(--muted)] hover:text-white"}`}
            >
              {x.logo && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={x.logo} alt="" className="h-4 w-4 rounded-sm object-contain" />
              )}
              {x.name || "Sin nombre"}
            </button>
          ))}
          {saved && (
            <button
              onClick={() => {
                setStatus("");
                chooseProjectBrand(null);
              }}
              className="rounded-full border border-[var(--line)] px-2.5 py-1 text-[11px] text-[var(--muted)] hover:text-white"
            >
              Sin marca
            </button>
          )}
        </div>
      )}
      <p className="text-[10px] text-[var(--muted)]">
        Cada proyecto guarda su marca. La IA solo usa los datos de la marca elegida acá.
      </p>
    </div>
  );

  if (!saved)
    return (
      <div className="space-y-4">{chooser}</div>
    );

  return (
    <div className="space-y-4">
      {chooser}
      <p className="text-[11px] text-[var(--muted)]">
        Datos de <b>{saved.name || "esta marca"}</b>. La IA los usa para los videos de esta marca (logo, colores,
        tipografía, contacto) y para escribir el texto de las publicaciones.
      </p>

      <Field label="Nombre de la marca">
        <input id="brand-name" className="input" value={b.name} onChange={(e) => set({ name: e.target.value })} placeholder="Ej: NOA Indumentaria" />
      </Field>
      <Field label="¿Qué vendés y a quién?">
        <textarea
          id="brand-desc"
          className="input"
          rows={3}
          value={b.description}
          onChange={(e) => set({ description: e.target.value })}
          placeholder="Ej: Ropa de mujer, tienda en Buenos Aires y envíos a todo el país."
        />
      </Field>
      <Field label="Tono de comunicación">
        <input id="brand-tone" className="input" value={b.tone} onChange={(e) => set({ tone: e.target.value })} placeholder="Ej: Cercano, canchero, con humor" />
      </Field>

      <div className="space-y-1">
        <span className="label block">Logo</span>
        <div className="flex items-center gap-3">
          <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-lg border border-[var(--line)] bg-[repeating-conic-gradient(#222_0_25%,#333_0_50%)] bg-[length:12px_12px]">
            {b.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={b.logo} alt="Logo" className="max-h-full max-w-full object-contain" />
            ) : (
              <span className="text-[10px] text-[var(--muted)]">Sin logo</span>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label className="btn cursor-pointer !py-1 text-xs">
              Subir logo
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) set({ logo: await logoToDataUrl(f) });
                  e.target.value = "";
                }}
              />
            </label>
            {b.logo && (
              <button className="text-left text-[11px] text-red-400" onClick={() => set({ logo: null })}>
                Quitar logo
              </button>
            )}
          </div>
        </div>
        <p className="text-[10px] text-[var(--muted)]">Ideal: PNG con fondo transparente.</p>
      </div>

      <FontPicker font={b.font} titleFont={b.titleFont} fonts={b.fonts ?? []} onChange={(patch) => set(patch)} />
      <div
        className="rounded-lg border border-[var(--line)] p-3 text-center"
        style={{ fontFamily: `"${b.font}", sans-serif`, background: b.secondary, color: b.text }}
      >
        <div className="text-xl font-black" style={b.titleFont ? { fontFamily: `"${b.titleFont}", sans-serif` } : undefined}>
          {b.name || "Tu marca"}
        </div>
        <span className="mt-1 inline-block rounded-full px-3 py-0.5 text-sm font-bold" style={{ background: b.primary, color: b.text }}>
          ¡Nueva colección!
        </span>
      </div>

      <div className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-3">
        <Field label="Principal">
          <ColorField id="brand-primary" value={b.primary} onChange={(c) => set({ primary: c })} />
        </Field>
        <Field label="Secundario">
          <ColorField id="brand-secondary" value={b.secondary} onChange={(c) => set({ secondary: c })} />
        </Field>
        <Field label="Texto">
          <ColorField id="brand-text" value={b.text} onChange={(c) => set({ text: c })} />
        </Field>
      </div>

      <Field label="WhatsApp">
        <input id="brand-wa" className="input" value={b.whatsapp} onChange={(e) => set({ whatsapp: e.target.value })} placeholder="Ej: 11 2345-6789" />
      </Field>
      <Field label="Instagram">
        <input id="brand-ig" className="input" value={b.instagram} onChange={(e) => set({ instagram: e.target.value })} placeholder="Ej: @noaindumentaria" />
      </Field>
      <Field label="Web / tienda online">
        <input id="brand-web" className="input" value={b.website} onChange={(e) => set({ website: e.target.value })} placeholder="Ej: noaindumentaria.com.ar" />
      </Field>
      <Field label="Frases de la marca (una por línea)">
        <textarea
          id="brand-phrases"
          className="input"
          rows={3}
          value={b.phrases}
          onChange={(e) => set({ phrases: e.target.value })}
          placeholder={"Envíos a todo el país\n3 cuotas sin interés\nCambios sin cargo"}
        />
      </Field>
      <Field label="Hashtags habituales">
        <input id="brand-tags" className="input" value={b.hashtags} onChange={(e) => set({ hashtags: e.target.value })} placeholder="#moda #ropademujer #buenosaires" />
      </Field>

      <div className="space-y-2 pb-2">
        <button className="btn w-full justify-center" disabled={busy} onClick={save}>
          {busy ? "Guardando…" : "Guardar marca"}
        </button>
        <button className="btn btn-primary w-full justify-center" disabled={busy || !hasVideo} onClick={apply}>
          🎨 Aplicar mi marca al video
        </button>
        {!hasVideo && <p className="text-[11px] text-[var(--muted)]">Sube un video para aplicar la marca.</p>}
        {status && <p className="text-xs text-emerald-300">{status}</p>}
        {confirmDelete ? (
          <div className="flex items-center gap-2 text-[11px]">
            <span>¿Borrar «{saved.name}» de tus marcas?</span>
            <button className="text-red-400 underline" onClick={() => deleteBrand(saved.id!)}>
              Sí, borrar
            </button>
            <button className="text-[var(--muted)] underline" onClick={() => setConfirmDelete(false)}>
              No
            </button>
          </div>
        ) : (
          <button className="text-[11px] text-[var(--muted)] hover:text-red-400" onClick={() => setConfirmDelete(true)}>
            Borrar esta marca
          </button>
        )}
      </div>
    </div>
  );
}
