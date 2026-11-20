"use client";

import { loadFont } from "./brand";
import { store } from "./store";
import { styleById, type EditStyle } from "./styles";

/**
 * Applies an editing style to the whole video: typography pair, accent color, subtitles, titles,
 * text outlines and (for videos without footage) the animated background.
 */
export async function applyEditStyle(id: string, o: { brandColors?: boolean } = {}): Promise<EditStyle & { usedAccent: string }> {
  const st = styleById(id);
  if (!st) throw new Error(`No existe el estilo "${id}".`);
  const brand = store.get().brand;
  const accent = o.brandColors && brand?.primary ? brand.primary : st.accent;
  await Promise.all([loadFont(st.titleFont), loadFont(st.bodyFont)]);
  store.edit((p) => ({
    ...p,
    styleId: st.id,
    font: st.bodyFont,
    brandColor: accent,
    subtitleStyle: {
      ...p.subtitleStyle,
      preset: st.subtitles.preset,
      color: st.subtitles.color,
      highlight: st.subtitles.highlight ?? accent,
      uppercase: st.subtitles.uppercase,
      fontSize: st.subtitles.fontSize,
    },
    background:
      !p.clips.length || p.background ? { style: st.background.style, colors: [st.background.base, accent] } : p.background,
    motions: (p.motions ?? []).map((m) => ({
      ...m,
      font: m.type === "titulo_animado" || m.type === "cierre" ? st.titleFont : undefined,
      accent: undefined,
      color: m.type === "titulo_animado" || m.type === "cierre" ? st.text : undefined,
    })),
    overlays: p.overlays.map((x) =>
      x.kind === "text"
        ? {
            ...x,
            font: x.preset === "titulo" || x.preset === "cta" ? st.titleFont : undefined,
            outline: st.outline,
            color: undefined,
          }
        : x,
    ),
  }));
  return { ...st, usedAccent: accent };
}
