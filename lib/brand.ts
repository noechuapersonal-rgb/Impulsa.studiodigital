"use client";

import { addFiles } from "./media";
import { totalDuration, uid } from "./project";
import { store } from "./store";
import type { BrandKit, CustomFont } from "./types";

/** Google Fonts offered for the brand (weights that each family really has). */
export const BRAND_FONTS: { name: string; weights: string; style: string }[] = [
  { name: "Inter", weights: "400;700;900", style: "Moderna y neutra" },
  { name: "Montserrat", weights: "400;700;900", style: "Geométrica, muy usada en moda" },
  { name: "Poppins", weights: "400;700;900", style: "Redondeada y amigable" },
  { name: "Bebas Neue", weights: "400", style: "Títulos altos en mayúsculas" },
  { name: "Anton", weights: "400", style: "Impacto, ideal para promos" },
  { name: "Oswald", weights: "400;700", style: "Condensada y fuerte" },
  { name: "Archivo Black", weights: "400", style: "Gruesa y llamativa" },
  { name: "League Spartan", weights: "400;700;900", style: "Fuerte y moderna" },
  { name: "Raleway", weights: "400;700;900", style: "Elegante y fina" },
  { name: "Playfair Display", weights: "400;700;900", style: "Elegante con serifa (lujo, moda)" },
  { name: "DM Serif Display", weights: "400", style: "Serifa editorial" },
  { name: "Lora", weights: "400;700", style: "Serifa clásica" },
  { name: "Space Grotesk", weights: "400;700", style: "Tecnológica" },
  { name: "Pacifico", weights: "400", style: "Manuscrita divertida" },
  { name: "Caveat", weights: "400;700", style: "Escrita a mano" },
];

const loaded = new Map<string, Promise<boolean>>();

function googleCss(href: string): Promise<boolean> {
  return new Promise((res) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.onload = () => res(true);
    link.onerror = () => {
      link.remove();
      res(false);
    };
    document.head.appendChild(link);
  });
}

/**
 * Loads a font so both the page and the canvas can use it: one of the brand's uploaded files, or any
 * Google Font by name. Resolves to false when the font could not be loaded.
 */
export function loadFont(name: string, extra: CustomFont[] = store.get().brand?.fonts ?? []): Promise<boolean> {
  if (!name || name === "Inter") return Promise.resolve(true);
  let p = loaded.get(name);
  if (!p) {
    const custom = extra.find((f) => f.name === name && f.source === "file" && f.data);
    if (custom) {
      // one file = one weight: declare it for every weight so bold texts don't get a fake bold
      const face = new FontFace(name, `url(${custom.data})`, { weight: "100 900" });
      p = face
        .load()
        .then((f) => {
          document.fonts.add(f);
          return true;
        })
        .catch(() => false);
    } else {
      const f = BRAND_FONTS.find((x) => x.name === name);
      const fam = encodeURIComponent(name).replace(/%20/g, "+");
      p = (async () => {
        // ask for the weights we use; fonts that only have one weight need the plain request
        const ok =
          (await googleCss(`https://fonts.googleapis.com/css2?family=${fam}:wght@${f?.weights ?? "400;700;900"}&display=swap`)) ||
          (await googleCss(`https://fonts.googleapis.com/css2?family=${fam}:wght@400;700&display=swap`)) ||
          (await googleCss(`https://fonts.googleapis.com/css2?family=${fam}&display=swap`));
        if (!ok) return false;
        await Promise.all([document.fonts.load(`400 40px "${name}"`), document.fonts.load(`900 40px "${name}"`)]).catch(
          () => undefined,
        );
        return document.fonts.check(`40px "${name}"`);
      })();
    }
    loaded.set(name, p);
    p.then((ok) => {
      if (!ok) loaded.delete(name);
    });
  }
  return p;
}

const FONT_EXT = /\.(ttf|otf|woff2?)$/i;
export const MAX_FONT_BYTES = 800_000;
export const MAX_FONT_FILES = 3;

/** Reads an uploaded font file; returns the font to add to the brand (name taken from the file). */
export async function fontFromFile(file: File): Promise<CustomFont> {
  if (!FONT_EXT.test(file.name)) throw new Error("Ese archivo no es una tipografía. Usá un archivo .ttf, .otf, .woff o .woff2.");
  if (file.size > MAX_FONT_BYTES)
    throw new Error("La tipografía pesa más de 800 KB. Probá con la versión .woff2 o con un solo estilo (por ejemplo Bold).");
  const name =
    file.name
      .replace(FONT_EXT, "")
      .replace(/[-_]+/g, " ")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/[^\p{L}\p{N} ]/gu, "")
      .trim()
      .slice(0, 40) || "Mi tipografía";
  const data = await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(new Error("No se pudo leer el archivo."));
    r.readAsDataURL(file);
  });
  // make sure the browser can actually use it
  try {
    await new FontFace(`check-${Date.now()}`, `url(${data})`).load();
  } catch {
    throw new Error("No pudimos leer esa tipografía. Probá con otro formato (.ttf u .otf suelen funcionar).");
  }
  return { name, source: "file", data };
}

/** Shrinks a photo of a typography to a JPEG (base64, no prefix) for the AI. */
export async function photoForAI(file: File, max = 1200): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.naturalWidth * s));
    c.height = Math.max(1, Math.round(img.naturalHeight * s));
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.85).split(",")[1];
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function emptyBrand(): BrandKit {
  return {
    name: "",
    description: "",
    tone: "Cercano y entusiasta",
    font: "Montserrat",
    primary: "#ec4899",
    secondary: "#8b5cf6",
    text: "#ffffff",
    logo: null,
    whatsapp: "",
    instagram: "",
    website: "",
    phrases: "",
    hashtags: "",
  };
}

const LS_KEY = "impulsa-brand";

export async function loadBrand(): Promise<BrandKit | null> {
  try {
    const res = await fetch("/api/brand");
    if (res.ok) {
      const { brand } = await res.json();
      if (brand) return { ...emptyBrand(), ...brand };
    }
  } catch {
    /* fall back to this browser */
  }
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? { ...emptyBrand(), ...JSON.parse(raw) } : null;
  } catch {
    return null;
  }
}

/** Saves to the account (or to this browser when accounts are not set up). Returns where it was saved. */
export async function saveBrand(brand: BrandKit): Promise<"cuenta" | "navegador"> {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(brand));
  } catch {
    /* storage full or blocked */
  }
  try {
    const res = await fetch("/api/brand", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brand }),
    });
    if (res.ok) return "cuenta";
  } catch {
    /* offline */
  }
  return "navegador";
}

/** Shrinks an uploaded logo to a PNG data URL (max 512px) so it can be stored with the brand. */
export async function logoToDataUrl(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const s = Math.min(1, 512 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.naturalWidth * s));
    c.height = Math.max(1, Math.round(img.naturalHeight * s));
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

export const LOGO_ASSET_NAME = "logo-de-la-marca.png";

/** Makes sure the brand logo exists as an image in "Medios" and returns its asset id. */
export async function ensureLogoAsset(brand: BrandKit): Promise<string | null> {
  if (!brand.logo) return null;
  const existing = store.get().assets.find((a) => a.name === LOGO_ASSET_NAME);
  if (existing) return existing.id;
  const blob = await (await fetch(brand.logo)).blob();
  await addFiles([new File([blob], LOGO_ASSET_NAME, { type: "image/png" })], { autoPlace: false });
  return store.get().assets.find((a) => a.name === LOGO_ASSET_NAME)?.id ?? null;
}

/**
 * Applies the brand to the current video: font, colors of subtitles and labels, and the logo
 * in a corner for the whole video.
 */
export async function applyBrand(
  brand: BrandKit,
  opts: { logo?: boolean; logoPosition?: "top-left" | "top-right" | "bottom-left" | "bottom-right" } = {},
) {
  await loadFont(brand.font, brand.fonts ?? []);
  if (brand.titleFont) await loadFont(brand.titleFont, brand.fonts ?? []);
  const logoId = opts.logo === false ? null : await ensureLogoAsset(brand);
  const pos = opts.logoPosition ?? "top-right";
  const xy = {
    "top-left": { x: 0.12, y: 0.08 },
    "top-right": { x: 0.88, y: 0.08 },
    "bottom-left": { x: 0.12, y: 0.92 },
    "bottom-right": { x: 0.88, y: 0.92 },
  }[pos];
  store.edit((p) => {
    const dur = Math.max(totalDuration(p), 1);
    const overlays = p.overlays
      .filter((o) => !(o.kind === "image" && o.assetId === logoId))
      // titles and calls to action take the brand's title typography
      .map((o) =>
        o.kind === "text" && brand.titleFont && (o.preset === "titulo" || o.preset === "cta") ? { ...o, font: brand.titleFont } : o,
      );
    if (logoId)
      overlays.push({
        id: uid(),
        kind: "image",
        assetId: logoId,
        start: 0,
        end: dur,
        x: xy.x,
        y: xy.y,
        size: 0.16,
        animation: "fade",
      });
    return {
      ...p,
      font: brand.font,
      brandColor: brand.primary,
      subtitleStyle: { ...p.subtitleStyle, color: brand.text || "#ffffff", highlight: brand.primary },
      overlays,
    };
  });
}

/** Short text for the AI describing the brand. */
export function describeBrand(b: BrandKit | null): string {
  if (!b || !(b.name || b.description)) return "Kit de marca: (no configurado)";
  const L = [
    `Kit de marca: "${b.name}"`,
    b.description && `  Qué hace / público: ${b.description}`,
    b.tone && `  Tono: ${b.tone}`,
    `  Tipografía: ${b.font}${b.titleFont && b.titleFont !== b.font ? ` (títulos y llamados a la acción: ${b.titleFont}; úsala en el campo font de esos textos)` : ""}. Colores: principal ${b.primary}, secundario ${b.secondary}, texto ${b.text}.`,
    `  Logo: ${b.logo ? "sí (usa apply_brand para ponerlo)" : "no cargado"}`,
    b.whatsapp && `  WhatsApp: ${b.whatsapp}`,
    b.instagram && `  Instagram: ${b.instagram}`,
    b.website && `  Web: ${b.website}`,
    b.phrases && `  Frases de la marca: ${b.phrases.split("\n").filter(Boolean).join(" · ")}`,
    b.hashtags && `  Hashtags habituales: ${b.hashtags}`,
  ];
  return L.filter(Boolean).join("\n");
}
