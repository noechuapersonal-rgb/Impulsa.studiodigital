import { drawMotion } from "./motion";
import type { Background, Cue, Effect, Fit, Overlay, Project, SubtitleStyle } from "./types";

export type Drawable = HTMLVideoElement | HTMLImageElement;

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const easeOutBack = (x: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};

const DEFAULT_FONT = `"Inter Variable", "Inter", "Helvetica Neue", Arial, sans-serif`;
// set at the start of every frame from the project (brand font)
let FONT = DEFAULT_FONT;
let BRAND_COLOR = "#ff3d71";
export const fontStack = (family?: string) => (family ? `"${family}", ${DEFAULT_FONT}` : DEFAULT_FONT);

function mediaSize(m: Drawable) {
  return m instanceof HTMLVideoElement
    ? { w: m.videoWidth, h: m.videoHeight }
    : { w: m.naturalWidth, h: m.naturalHeight };
}

function drawFitted(
  ctx: CanvasRenderingContext2D,
  m: Drawable,
  W: number,
  H: number,
  mode: "cover" | "contain",
  zoom: number,
  dx: number,
  dy: number,
) {
  const { w, h } = mediaSize(m);
  if (!w || !h) return;
  const s = (mode === "cover" ? Math.max(W / w, H / h) : Math.min(W / w, H / h)) * zoom;
  const dw = w * s;
  const dh = h * s;
  ctx.drawImage(m, (W - dw) / 2 + dx, (H - dh) / 2 + dy, dw, dh);
}

export interface FrameInput {
  project: Project;
  t: number;
  W: number;
  H: number;
  video: HTMLVideoElement | null;
  images: Map<string, HTMLImageElement>;
}

export function activeEffects(effects: Effect[], t: number) {
  return effects.filter((e) => t >= e.start && t < e.end);
}

export function drawFrame(ctx: CanvasRenderingContext2D, f: FrameInput) {
  const { project, t, W, H, video } = f;
  const u = Math.min(W, H) / 720;
  FONT = fontStack(project.font);
  BRAND_COLOR = project.brandColor || "#ff3d71";
  ctx.save();
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);

  const fx = activeEffects(project.effects, t);
  const filters: string[] = [];
  let zoom = 1;
  let dx = 0;
  let dy = 0;
  for (const e of fx) {
    const k = clamp(e.intensity);
    const local = (t - e.start) / Math.max(0.01, e.end - e.start);
    switch (e.type) {
      case "blanco_negro":
        filters.push(`grayscale(${k})`);
        break;
      case "sepia":
        filters.push(`sepia(${k})`);
        break;
      case "vintage":
        filters.push(`sepia(${0.5 * k}) contrast(${1 + 0.15 * k}) saturate(${1 - 0.3 * k})`);
        break;
      case "desenfoque":
        filters.push(`blur(${(2 + 10 * k) * u}px)`);
        break;
      case "brillo":
        filters.push(`brightness(${1 + 0.6 * k})`);
        break;
      case "contraste":
        filters.push(`contrast(${1 + 0.8 * k})`);
        break;
      case "saturacion":
        filters.push(`saturate(${1 + 1.5 * k})`);
        break;
      case "zoom": {
        const ramp = clamp(local / 0.15) * clamp((1 - local) / 0.15);
        zoom *= 1 + 0.25 * k * (0.6 + 0.4 * ramp);
        break;
      }
      case "temblor":
        dx += Math.sin(t * 47) * 12 * k * u + Math.sin(t * 91) * 5 * k * u;
        dy += Math.cos(t * 53) * 10 * k * u;
        zoom *= 1.05;
        break;
      case "glitch":
        if (Math.sin(t * 37) > 0.3) dx += (Math.random() - 0.5) * 30 * k * u;
        filters.push(`hue-rotate(${Math.random() * 90 * k}deg)`);
        break;
      case "barrido": {
        // whip pan: the new shot slides in fast with motion blur
        // slightly enlarged while it slides, so the frame never shows a black gap
        const rest = Math.pow(1 - clamp(local), 3);
        dx += rest * W * 0.2 * k;
        zoom *= 1 + rest * 0.45 * k;
        if (rest > 0.02) filters.push(`blur(${rest * 26 * u}px)`);
        break;
      }
      case "zoom_entrada": {
        const rest = Math.pow(1 - clamp(local), 3);
        zoom *= 1 + 0.4 * k * rest;
        break;
      }
    }
  }

  if (video && video.readyState >= 2) {
    drawVideoLayer(ctx, video, W, H, project.fit, zoom, dx, dy, filters.join(" "));
  } else if (project.background || !project.clips.length) {
    // videos made without footage: animated background (brand colors by default)
    ctx.save();
    ctx.translate(W / 2 + dx, H / 2 + dy);
    ctx.scale(zoom, zoom);
    ctx.translate(-W / 2, -H / 2);
    drawBackground(ctx, project.background ?? { style: "degradado", colors: ["#0f0f1a", BRAND_COLOR] }, t, W, H);
    ctx.restore();
  }
  ctx.filter = "none";

  // overlay-style effects
  for (const e of fx) {
    const k = clamp(e.intensity);
    const local = t - e.start;
    const len = e.end - e.start;
    switch (e.type) {
      case "vineta": {
        const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
        g.addColorStop(0, "rgba(0,0,0,0)");
        g.addColorStop(1, `rgba(0,0,0,${0.85 * k})`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        break;
      }
      case "fundido_entrada":
        ctx.fillStyle = `rgba(0,0,0,${1 - clamp(local / len)})`;
        ctx.fillRect(0, 0, W, H);
        break;
      case "fundido_salida":
        ctx.fillStyle = `rgba(0,0,0,${clamp(local / len)})`;
        ctx.fillRect(0, 0, W, H);
        break;
      case "flash":
        ctx.fillStyle = `rgba(255,255,255,${k * (1 - clamp(local / Math.min(len, 0.5)))})`;
        ctx.fillRect(0, 0, W, H);
        break;
      case "cine": {
        const bar = H * 0.11 * (0.5 + 0.5 * k) * clamp(local / 0.4);
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, W, bar);
        ctx.fillRect(0, H - bar, W, bar);
        break;
      }
      case "glitch": {
        if (video && video.readyState >= 2 && Math.random() < 0.5 * k) {
          for (let i = 0; i < 4; i++) {
            const y = Math.random() * H;
            const h = (10 + Math.random() * 40) * u;
            const off = (Math.random() - 0.5) * 60 * u;
            ctx.drawImage(ctx.canvas, 0, y, W, h, off, y, W, h);
          }
        }
        break;
      }
    }
  }

  for (const o of project.overlays) {
    if (t >= o.start && t < o.end) drawOverlay(ctx, o, t, W, H, f.images);
  }

  for (const m of project.motions ?? []) {
    if (t >= m.start && t < m.end)
      drawMotion(ctx, m, t, W, H, { font: FONT, brandColor: project.brandColor ?? project.background?.colors[1] });
  }

  const cue = project.cues.find((c) => t >= c.start && t < c.end);
  if (cue) drawSubtitle(ctx, cue, t, W, H, project.subtitleStyle);
  ctx.restore();
}

/** Smooth pseudo-random value in 0..1 for index i (stable between frames). */
const rnd = (i: number) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

function withAlpha(hex: string, a: number) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return `rgba(255,255,255,${a})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export function drawBackground(ctx: CanvasRenderingContext2D, bg: Background, t: number, W: number, H: number) {
  const [base, accent] = bg.colors;
  ctx.fillStyle = base;
  ctx.fillRect(-W * 0.1, -H * 0.1, W * 1.2, H * 1.2);
  if (bg.style === "solido") return;
  const R = Math.max(W, H);
  if (bg.style === "degradado") {
    // two big soft glows of the accent color drifting slowly
    for (let i = 0; i < 2; i++) {
      const x = W * (0.5 + 0.38 * Math.sin(t * 0.23 + i * 2.4));
      const y = H * (0.5 + 0.34 * Math.cos(t * 0.19 + i * 1.7));
      const g = ctx.createRadialGradient(x, y, 0, x, y, R * 0.7);
      g.addColorStop(0, withAlpha(accent, i ? 0.32 : 0.45));
      g.addColorStop(1, withAlpha(accent, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
  } else if (bg.style === "grilla") {
    const g = ctx.createRadialGradient(W / 2, H * 0.4, 0, W / 2, H * 0.4, R * 0.75);
    g.addColorStop(0, withAlpha(accent, 0.28));
    g.addColorStop(1, withAlpha(accent, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    const step = Math.min(W, H) / 9;
    const off = (t * step * 0.25) % step;
    ctx.strokeStyle = withAlpha(accent, 0.16);
    ctx.lineWidth = Math.max(1, step / 60);
    ctx.beginPath();
    for (let x = -step + off; x < W + step; x += step) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
    }
    for (let y = -step + off; y < H + step; y += step) {
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
    }
    ctx.stroke();
    // a few glowing dots travelling along the grid
    for (let i = 0; i < 6; i++) {
      const p = (t * 0.12 + rnd(i)) % 1;
      const vertical = i % 2 === 0;
      const x = vertical ? Math.round(rnd(i + 9) * 8) * step + off : p * W;
      const y = vertical ? p * H : Math.round(rnd(i + 19) * 14) * step + off;
      const gl = ctx.createRadialGradient(x, y, 0, x, y, step * 0.6);
      gl.addColorStop(0, withAlpha(accent, 0.9));
      gl.addColorStop(1, withAlpha(accent, 0));
      ctx.fillStyle = gl;
      ctx.fillRect(x - step, y - step, step * 2, step * 2);
    }
  } else if (bg.style === "luces") {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, withAlpha(accent, 0.18));
    g.addColorStop(1, withAlpha(accent, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 22; i++) {
      const r = (0.03 + rnd(i + 3) * 0.09) * R;
      const x = ((rnd(i) + t * 0.012 * (0.5 + rnd(i + 7))) % 1.2 - 0.1) * W;
      const y = ((rnd(i + 11) - t * 0.02 * (0.4 + rnd(i + 5)) + 10) % 1.2 - 0.1) * H;
      const gl = ctx.createRadialGradient(x, y, 0, x, y, r);
      gl.addColorStop(0, withAlpha(accent, 0.1 + rnd(i + 13) * 0.25));
      gl.addColorStop(1, withAlpha(accent, 0));
      ctx.fillStyle = gl;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }
  // soft vignette so texts stand out
  const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, R * 0.75);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
}

function drawVideoLayer(
  ctx: CanvasRenderingContext2D,
  v: HTMLVideoElement,
  W: number,
  H: number,
  fit: Fit,
  zoom: number,
  dx: number,
  dy: number,
  filter: string,
) {
  if (fit === "blur") {
    const { w, h } = mediaSize(v);
    const sameShape = Math.abs(w / h - W / H) < 0.02;
    if (!sameShape) {
      ctx.filter = `blur(${Math.round(Math.min(W, H) / 22)}px) brightness(0.55) ${filter}`;
      drawFitted(ctx, v, W, H, "cover", 1.1, 0, 0);
    }
    ctx.filter = filter || "none";
    drawFitted(ctx, v, W, H, "contain", zoom, dx, dy);
  } else {
    ctx.filter = filter || "none";
    drawFitted(ctx, v, W, H, fit, zoom, dx, dy);
  }
}

function animState(o: { start: number; end: number; animation: string }, t: number) {
  const inP = clamp((t - o.start) / 0.35);
  const outP = clamp((o.end - t) / 0.3);
  let alpha = 1;
  let scale = 1;
  let offY = 0;
  switch (o.animation) {
    case "fade":
      alpha = Math.min(inP, outP);
      break;
    case "pop":
      scale = inP < 1 ? Math.max(0.01, easeOutBack(inP)) : 1;
      alpha = Math.min(1, inP * 3, outP);
      break;
    case "slide_up":
      offY = (1 - inP) * 0.08;
      alpha = Math.min(inP, outP);
      break;
    case "typewriter":
      alpha = outP;
      break;
  }
  return { alpha, scale, offY, inP };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const TEXT_PRESETS = {
  titulo: { size: 72, weight: 900, box: false },
  subtitulo: { size: 40, weight: 700, box: false },
  etiqueta: { size: 34, weight: 800, box: true },
  cta: { size: 42, weight: 900, box: true },
} as const;

export function overlayBounds(o: Overlay, W: number, H: number, images: Map<string, HTMLImageElement>, ctx?: CanvasRenderingContext2D) {
  const u = Math.min(W, H) / 720;
  if (o.kind === "image") {
    if (o.fill === "cover" || o.fill === "contain") return { x: 0, y: 0, w: W, h: H };
    const img = o.assetId ? images.get(o.assetId) : undefined;
    const w = W * o.size;
    const h = img && img.naturalWidth ? (w * img.naturalHeight) / img.naturalWidth : w;
    return { x: o.x * W - w / 2, y: o.y * H - h / 2, w, h };
  }
  const p = TEXT_PRESETS[o.preset ?? "titulo"];
  const size = p.size * u * o.size;
  let w = size * (o.text?.length ?? 1) * 0.55;
  if (ctx) {
    ctx.font = `${p.weight} ${size}px ${o.font ? `"${o.font}", ${FONT}` : FONT}`;
    w = Math.min(W * 0.9, ctx.measureText(o.text ?? "").width);
  }
  return { x: o.x * W - w / 2 - size * 0.4, y: o.y * H - size * 0.8, w: w + size * 0.8, h: size * 1.6 };
}

function drawOverlay(
  ctx: CanvasRenderingContext2D,
  o: Overlay,
  t: number,
  W: number,
  H: number,
  images: Map<string, HTMLImageElement>,
) {
  const full = o.kind === "image" && (o.fill === "cover" || o.fill === "contain");
  let a = animState(o, t);
  // a full-screen photo at the very start is visible from the first frame (no fade from black)
  if (full && o.start < 0.05) a = { ...a, alpha: Math.min(1, Math.max(0, (o.end - t) / 0.3)), scale: 1, offY: 0 };
  const u = Math.min(W, H) / 720;
  ctx.save();
  ctx.globalAlpha = a.alpha;
  const cx = full ? W / 2 : o.x * W;
  const cy = (full ? 0.5 + a.offY : o.y + a.offY) * H;
  ctx.translate(cx, cy);
  ctx.scale(a.scale, a.scale);
  if (full) {
    // full-frame photo that follows the video format (9:16, 16:9…)
    const img = o.assetId ? images.get(o.assetId) : undefined;
    if (img && img.complete && img.naturalWidth) {
      const iw = img.naturalWidth;
      const ih = img.naturalHeight;
      const cover = Math.max(W / iw, H / ih);
      if (o.fill === "contain") {
        ctx.save();
        ctx.filter = `blur(${Math.round(Math.min(W, H) / 22)}px) brightness(0.55)`;
        ctx.drawImage(img, (-iw * cover * 1.1) / 2, (-ih * cover * 1.1) / 2, iw * cover * 1.1, ih * cover * 1.1);
        ctx.restore();
        const s = Math.min(W / iw, H / ih);
        ctx.drawImage(img, (-iw * s) / 2, (-ih * s) / 2, iw * s, ih * s);
      } else {
        ctx.drawImage(img, (-iw * cover) / 2, (-ih * cover) / 2, iw * cover, ih * cover);
      }
    }
  } else if (o.kind === "image") {
    const img = o.assetId ? images.get(o.assetId) : undefined;
    if (img && img.complete && img.naturalWidth) {
      const w = W * o.size;
      const h = (w * img.naturalHeight) / img.naturalWidth;
      ctx.shadowColor = "rgba(0,0,0,0.35)";
      ctx.shadowBlur = 20 * u;
      ctx.drawImage(img, -w / 2, -h / 2, w, h);
    }
  } else {
    const p = TEXT_PRESETS[o.preset ?? "titulo"];
    const size = p.size * u * o.size;
    let text = o.text ?? "";
    if (o.animation === "typewriter") text = text.slice(0, Math.ceil(text.length * clamp((t - o.start) / 1)));
    ctx.font = `${p.weight} ${size}px ${o.font ? `"${o.font}", ${FONT}` : FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const lines = wrap(ctx, text, W * 0.86);
    const lh = size * 1.15;
    const color = o.color || (p.box ? BRAND_COLOR : "#ffffff");
    lines.forEach((line, i) => {
      const y = (i - (lines.length - 1) / 2) * lh;
      if (p.box) {
        const w = ctx.measureText(line).width + size * 0.9;
        ctx.fillStyle = color;
        roundRect(ctx, -w / 2, y - lh / 2, w, lh, o.preset === "cta" ? lh / 2 : size * 0.18);
        ctx.fill();
        ctx.fillStyle = contrastText(color);
        ctx.fillText(line, 0, y + size * 0.04);
      } else {
        const outline = o.outline ?? "borde";
        if (outline === "borde") {
          ctx.lineJoin = "round";
          ctx.lineWidth = size * 0.14;
          ctx.strokeStyle = "rgba(0,0,0,0.85)";
          ctx.strokeText(line, 0, y);
        }
        ctx.save();
        if (outline === "sombra") {
          ctx.shadowColor = "rgba(0,0,0,0.55)";
          ctx.shadowBlur = size * 0.25;
          ctx.shadowOffsetY = size * 0.05;
        }
        ctx.fillStyle = color;
        ctx.fillText(line, 0, y);
        ctx.restore();
      }
    });
  }
  ctx.restore();
}

function contrastText(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#fff";
  const n = parseInt(m[1], 16);
  const l = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return l > 0.6 ? "#111" : "#fff";
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(test).width > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else cur = test;
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

function drawSubtitle(
  ctx: CanvasRenderingContext2D,
  cue: Cue,
  t: number,
  W: number,
  H: number,
  st: SubtitleStyle,
) {
  const u = Math.min(W, H) / 720;
  const size = st.fontSize * u;
  const text = st.uppercase ? cue.text.toUpperCase() : cue.text;
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return;

  // active word by proportional timing
  const total = words.reduce((a, w) => a + w.length + 1, 0);
  const prog = clamp((t - cue.start) / Math.max(0.05, cue.end - cue.start));
  let acc = 0;
  let active = words.length - 1;
  let activeFrom = 0;
  for (let i = 0; i < words.length; i++) {
    const before = acc;
    acc += words[i].length + 1;
    if (acc / total > prog) {
      active = i;
      activeFrom = before / total;
      break;
    }
  }
  // "viral": the word being said pops bigger, in the highlight color
  const activeStart = cue.start + activeFrom * (cue.end - cue.start);

  ctx.save();
  const weight = st.preset === "minimal" ? 600 : 900;
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  const space = Math.max(ctx.measureText(" ").width, size * (st.background || st.preset === "minimal" ? 0.3 : 0.45));
  const maxW = W * 0.84;

  // layout words into lines
  type Placed = { w: string; i: number; width: number };
  const lines: Placed[][] = [[]];
  let lineW = 0;
  words.forEach((w, i) => {
    const width = ctx.measureText(w).width;
    if (lineW + width > maxW && lines[lines.length - 1].length) {
      lines.push([]);
      lineW = 0;
    }
    lines[lines.length - 1].push({ w, i, width });
    lineW += width + space;
  });

  const lh = size * 1.2;
  const baseY = st.position === "top" ? H * 0.16 : st.position === "middle" ? H * 0.62 : H * 0.85;
  const blockTop = baseY - ((lines.length - 1) * lh) / 2;

  // pop-in on cue start for bold styles
  const popIn =
    st.preset === "tiktok" || st.preset === "neon" || st.preset === "viral" ? easeOutBack(clamp((t - cue.start) / 0.18)) : 1;

  lines.forEach((line, li) => {
    const lw = line.reduce((a, p) => a + p.width, 0) + space * (line.length - 1);
    let x = W / 2 - lw / 2;
    const y = blockTop + li * lh;

    // pop-in scales the whole line around its center so words never overlap
    ctx.save();
    ctx.translate(W / 2, y);
    ctx.scale(popIn, popIn);
    ctx.translate(-W / 2, -y);

    if (st.background) {
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      roundRect(ctx, x - size * 0.35, y - lh / 2, lw + size * 0.7, lh, size * 0.2);
      ctx.fill();
    }

    for (const p of line) {
      const isActive = p.i === active && st.preset !== "clasico" && st.preset !== "minimal";
      ctx.save();
      const cx = x + p.width / 2;
      ctx.translate(cx, y);
      if (st.preset === "viral" && isActive) {
        const sc = 0.8 + 0.38 * easeOutBack(clamp((t - activeStart) / 0.16));
        ctx.scale(sc, sc);
      }
      if (st.preset === "karaoke" && isActive) {
        ctx.fillStyle = st.highlight;
        roundRect(ctx, -p.width / 2 - size * 0.15, -lh / 2 + size * 0.05, p.width + size * 0.3, lh - size * 0.1, size * 0.18);
        ctx.fill();
      }
      if (st.preset === "neon") {
        ctx.shadowColor = isActive ? st.highlight : st.color;
        ctx.shadowBlur = size * 0.6;
      } else if (st.preset === "minimal") {
        ctx.shadowColor = "rgba(0,0,0,0.8)";
        ctx.shadowBlur = size * 0.25;
      } else if (!st.background) {
        ctx.lineJoin = "round";
        ctx.lineWidth = size * (st.preset === "viral" ? 0.26 : 0.2);
        ctx.strokeStyle = "#000";
        ctx.strokeText(p.w, -p.width / 2, 0);
      }
      ctx.fillStyle =
        isActive && st.preset !== "karaoke" ? st.highlight : st.color;
      ctx.fillText(p.w, -p.width / 2, 0);
      ctx.restore();
      x += p.width + space;
    }
    ctx.restore();
  });
  ctx.restore();
}
