import type { Motion } from "./types";

/**
 * Animated graphic elements ("elementos animados"): titles that enter word by word with highlighted
 * words, counters, checklists, data cards, a WhatsApp-style audio bubble, closing cards, progress
 * bars, emojis, an open-world game HUD and mission notices. Drawn on the canvas, so they look the same in the preview and in the export.
 */

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const easeOutCubic = (x: number) => 1 - Math.pow(1 - clamp(x), 3);
const easeOutBack = (x: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(clamp(x) - 1, 3) + c1 * Math.pow(clamp(x) - 1, 2);
};

const PANEL = "rgba(20,20,27,0.92)";
const PANEL_LINE = "rgba(255,255,255,0.09)";
const MUTED = "rgba(255,255,255,0.62)";

export const MOTION_DEFAULT_ACCENT = "#d4ff3a";

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  r = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = r * 1.2;
  ctx.shadowOffsetY = r * 0.25;
  ctx.fillStyle = PANEL;
  rr(ctx, x, y, w, h, r);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = PANEL_LINE;
  ctx.lineWidth = Math.max(1, r * 0.06);
  rr(ctx, x, y, w, h, r);
  ctx.stroke();
}

export function contrastOn(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#fff";
  const n = parseInt(m[1], 16);
  const l = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return l > 0.6 ? "#111" : "#fff";
}

function wrapWords(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
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
  return lines;
}

function spaced(ctx: CanvasRenderingContext2D, px: number) {
  // letter spacing for small caps labels (where the browser supports it)
  const c = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
  if ("letterSpacing" in c) c.letterSpacing = `${px}px`;
}

const fmtNumber = (n: number) => Math.round(n).toLocaleString("es-AR");

interface Ctx {
  ctx: CanvasRenderingContext2D;
  m: Motion;
  t: number;
  W: number;
  H: number;
  u: number; // 1 unit = 1px at a 720px short side
  font: string;
  accent: string;
  color: string;
}

export function drawMotion(
  ctx: CanvasRenderingContext2D,
  m: Motion,
  t: number,
  W: number,
  H: number,
  opts: { font: string; brandColor?: string },
) {
  if (t < m.start || t >= m.end) return;
  const u = (Math.min(W, H) / 720) * (m.size || 1);
  const font = m.font ? `"${m.font}", ${opts.font}` : opts.font;
  const c: Ctx = {
    ctx,
    m,
    t,
    W,
    H,
    u,
    font,
    accent: m.accent || opts.brandColor || MOTION_DEFAULT_ACCENT,
    color: m.color || "#ffffff",
  };
  ctx.save();
  ctx.globalAlpha = clamp((m.end - t) / 0.25);
  ctx.translate(m.x * W, m.y * H);
  switch (m.type) {
    case "titulo_animado":
      title(c);
      break;
    case "contador":
      counter(c);
      break;
    case "lista":
      list(c);
      break;
    case "tarjeta":
      card(c);
      break;
    case "audio":
      audio(c);
      break;
    case "cierre":
      closing(c);
      break;
    case "progreso":
      progress(c);
      break;
    case "emoji":
      emoji(c);
      break;
    case "hud_juego":
      ctx.translate(-m.x * W, -m.y * H); // the HUD uses the whole screen
      gameHud(c);
      break;
    case "mision":
      mission(c);
      break;
  }
  ctx.restore();
}

/** Pop-in for whole elements: returns the scale and multiplies the alpha. */
function popIn(c: Ctx, d = 0.35) {
  const p = clamp((c.t - c.m.start) / d);
  c.ctx.globalAlpha *= clamp(p * 2.5);
  const s = 0.82 + 0.18 * easeOutBack(p);
  c.ctx.scale(s, s);
  return p;
}

// ---------- title: words enter one by one; [box] and *accent* ----------

type Word = { w: string; box: boolean; accent: boolean };

export function parseTitle(text: string): Word[] {
  const out: Word[] = [];
  // punctuation right after a group ("[CHAT]?") stays glued to its last word
  const re = /\[([^\]]+)\]([^\s[*]*)|\*([^*]+)\*([^\s[*]*)|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const box = m[1] !== undefined;
    const accent = m[3] !== undefined;
    const words = (m[1] ?? m[3] ?? m[5] ?? "").split(/\s+/).filter(Boolean);
    const tail = m[2] ?? m[4] ?? "";
    if (tail && words.length) words[words.length - 1] += tail;
    for (const w of words) out.push({ w, box, accent });
  }
  return out;
}

function title(c: Ctx) {
  const { ctx, m, t, W, u } = c;
  const words = parseTitle(m.text ?? "");
  if (!words.length) return;
  const size = 64 * u;
  ctx.font = `900 ${size}px ${c.font}`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  const space = ctx.measureText(" ").width * 1.15;
  const maxW = W * 0.88;
  type P = Word & { width: number; i: number };
  const lines: P[][] = [[]];
  let lw = 0;
  words.forEach((w, i) => {
    const width = ctx.measureText(w.w).width;
    if (lw + width > maxW && lines[lines.length - 1].length) {
      lines.push([]);
      lw = 0;
    }
    lines[lines.length - 1].push({ ...w, width, i });
    lw += width + space;
  });
  const lh = size * 1.22;
  const dur = m.end - m.start;
  const stagger = Math.min(0.09, (Math.min(1.3, dur * 0.5)) / words.length);
  const top = -((lines.length - 1) * lh) / 2;
  const padX = size * 0.2;

  lines.forEach((line, li) => {
    const width = line.reduce((a, p) => a + p.width, 0) + space * (line.length - 1);
    let x = -width / 2;
    const y = top + li * lh;
    line.forEach((p, k) => {
      const prog = clamp((t - m.start - p.i * stagger) / 0.3);
      if (prog <= 0) {
        x += p.width + space;
        return;
      }
      ctx.save();
      const cx = x + p.width / 2;
      ctx.translate(cx, y + (1 - easeOutCubic(prog)) * size * 0.35);
      const s = 0.45 + 0.55 * easeOutBack(prog);
      ctx.scale(s, s);
      ctx.globalAlpha *= clamp(prog * 3);
      if (p.box) {
        const prevBox = line[k - 1]?.box;
        const nextBox = line[k + 1]?.box;
        const l = prevBox ? space / 2 + 1 : padX;
        const r = nextBox ? space / 2 + 1 : padX;
        ctx.fillStyle = c.accent;
        ctx.fillRect(-p.width / 2 - l, -lh * 0.46, p.width + l + r, lh * 0.9);
        ctx.fillStyle = contrastOn(c.accent);
      } else {
        ctx.shadowColor = "rgba(0,0,0,0.55)";
        ctx.shadowBlur = size * 0.18;
        ctx.shadowOffsetY = size * 0.04;
        ctx.fillStyle = p.accent ? c.accent : c.color;
      }
      ctx.fillText(p.w, -p.width / 2, size * 0.04);
      ctx.restore();
      x += p.width + space;
    });
  });
}

// ---------- counter ----------

function counter(c: Ctx) {
  const { ctx, m, t, u } = c;
  popIn(c, 0.3);
  const from = Number.isFinite(m.from) ? m.from! : 0;
  const to = Number.isFinite(m.to) ? m.to! : 100;
  const dur = Math.max(0.8, Math.min(2.2, (m.end - m.start) * 0.6));
  const v = from + (to - from) * easeOutCubic((t - m.start) / dur);
  const big = 120 * u;
  ctx.textBaseline = "alphabetic";
  ctx.font = `900 ${big}px ${c.font}`;
  const num = `${m.value ?? ""}${fmtNumber(v)}`;
  const nw = ctx.measureText(num).width;
  ctx.font = `800 ${big * 0.3}px ${c.font}`;
  const unit = m.label ?? "";
  const uw = unit ? ctx.measureText(unit).width + big * 0.12 : 0;
  const total = nw + uw;
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = big * 0.12;
  if (m.text) {
    ctx.font = `800 ${big * 0.26}px ${c.font}`;
    ctx.textAlign = "center";
    ctx.fillStyle = MUTED;
    ctx.fillText(m.text.toUpperCase(), 0, -big * 0.82);
  }
  ctx.textAlign = "left";
  ctx.font = `900 ${big}px ${c.font}`;
  ctx.fillStyle = c.accent;
  ctx.fillText(num, -total / 2, big * 0.35);
  if (unit) {
    ctx.font = `800 ${big * 0.3}px ${c.font}`;
    ctx.fillStyle = c.color;
    ctx.fillText(unit, -total / 2 + nw + big * 0.12, big * 0.35);
  }
}

// ---------- checklist ----------

function check(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, p: number) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r * (0.6 + 0.4 * easeOutBack(p)), 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = contrastOn(color);
  ctx.lineWidth = r * 0.28;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  const k = clamp(p * 1.6);
  ctx.moveTo(x - r * 0.42, y + r * 0.02);
  const mx = x - r * 0.1;
  const my = y + r * 0.34;
  ctx.lineTo(x - r * 0.42 + (mx - (x - r * 0.42)) * clamp(k * 2), y + r * 0.02 + (my - (y + r * 0.02)) * clamp(k * 2));
  if (k > 0.5) ctx.lineTo(mx + (x + r * 0.45 - mx) * clamp((k - 0.5) * 2), my + (y - r * 0.32 - my) * clamp((k - 0.5) * 2));
  ctx.stroke();
}

function list(c: Ctx) {
  const { ctx, m, t, W, u } = c;
  const items = (m.items ?? []).filter(Boolean).slice(0, 8);
  if (!items.length) return;
  popIn(c, 0.3);
  const fs = 32 * u;
  const rowH = fs * 1.75;
  const pad = fs * 0.9;
  ctx.font = `700 ${fs}px ${c.font}`;
  const textW = Math.max(...items.map((x) => ctx.measureText(x).width));
  const r = fs * 0.5;
  const w = Math.min(W * 0.9, Math.max(W * 0.55, textW + r * 2 + fs * 0.7 + pad * 2));
  const titleH = m.label ? fs * 1.6 : 0;
  const h = items.length * rowH + pad * 1.4 + titleH;
  panel(ctx, -w / 2, -h / 2, w, h, fs * 0.7);
  let y = -h / 2 + pad * 0.7 + titleH;
  if (m.label) {
    ctx.font = `800 ${fs * 0.62}px ${c.font}`;
    spaced(ctx, fs * 0.08);
    ctx.fillStyle = MUTED;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText(m.label.toUpperCase(), -w / 2 + pad, -h / 2 + pad * 0.7 + fs * 0.6);
    spaced(ctx, 0);
  }
  const dur = m.end - m.start;
  const every = clamp((dur - 0.8) / items.length, 0.25, 0.7);
  items.forEach((it, i) => {
    const p = clamp((t - m.start - 0.25 - i * every) / 0.3);
    const cy = y + rowH / 2;
    y += rowH;
    if (p <= 0) return;
    ctx.save();
    ctx.globalAlpha *= clamp(p * 2);
    ctx.translate((1 - easeOutCubic(p)) * -fs, 0);
    check(ctx, -w / 2 + pad + r, cy, r, c.accent, p);
    ctx.font = `700 ${fs}px ${c.font}`;
    ctx.fillStyle = c.color;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(it, -w / 2 + pad + r * 2 + fs * 0.55, cy + fs * 0.03, w - pad * 2 - r * 2 - fs * 0.55);
    ctx.restore();
  });
}

// ---------- data card ----------

function card(c: Ctx) {
  const { ctx, m, W, u } = c;
  popIn(c);
  const big = 92 * u;
  const pad = 34 * u;
  ctx.font = `900 ${big}px ${c.font}`;
  const value = m.value ?? "";
  const vw = ctx.measureText(value).width;
  ctx.font = `600 ${28 * u}px ${c.font}`;
  const subLines = m.sub ? wrapWords(ctx, m.sub, W * 0.74 - pad * 2) : [];
  const w = Math.min(W * 0.9, Math.max(W * 0.62, vw + pad * 2));
  const h = pad * 2 + (m.label ? 30 * u : 0) + (value ? big * 1.05 : 0) + subLines.length * 36 * u;
  panel(ctx, -w / 2, -h / 2, w, h, 26 * u);
  let y = -h / 2 + pad;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  if (m.label) {
    ctx.font = `800 ${20 * u}px ${c.font}`;
    spaced(ctx, 3 * u);
    ctx.fillStyle = c.accent;
    ctx.fillText(m.label.toUpperCase(), -w / 2 + pad, y);
    spaced(ctx, 0);
    y += 30 * u;
  }
  if (value) {
    ctx.font = `900 ${big}px ${c.font}`;
    ctx.fillStyle = c.color;
    ctx.fillText(value, -w / 2 + pad, y, w - pad * 2);
    y += big * 1.05;
  }
  ctx.font = `600 ${28 * u}px ${c.font}`;
  ctx.fillStyle = MUTED;
  for (const l of subLines) {
    ctx.fillText(l, -w / 2 + pad, y);
    y += 36 * u;
  }
}

// ---------- WhatsApp-style voice note ----------

function audio(c: Ctx) {
  const { ctx, m, t, W, u } = c;
  popIn(c);
  const h = 96 * u;
  const w = Math.min(W * 0.86, 560 * u);
  panel(ctx, -w / 2, -h / 2, w, h, h / 2);
  const r = h * 0.32;
  const ax = -w / 2 + h * 0.5;
  // avatar
  ctx.fillStyle = "#f97316";
  ctx.beginPath();
  ctx.arc(ax, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = `800 ${r * 1.05}px ${c.font}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText((m.text?.trim()[0] ?? "D").toUpperCase(), ax, r * 0.06);
  // play
  const px = ax + r + h * 0.28;
  ctx.fillStyle = c.color;
  ctx.beginPath();
  ctx.moveTo(px, -r * 0.5);
  ctx.lineTo(px + r * 0.8, 0);
  ctx.lineTo(px, r * 0.5);
  ctx.closePath();
  ctx.fill();
  // waveform
  const x0 = px + r * 1.4;
  const x1 = w / 2 - h * 0.45;
  const n = 34;
  const bw = (x1 - x0) / n;
  const played = clamp((t - m.start) / Math.max(0.5, m.end - m.start - 0.2));
  for (let i = 0; i < n; i++) {
    const amp = 0.25 + 0.75 * Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.63));
    const live = i / n < played ? 1 + 0.25 * Math.sin(t * 18 + i) : 1;
    const bh = h * 0.46 * amp * live;
    ctx.fillStyle = i / n < played ? c.color : "rgba(255,255,255,0.32)";
    rr(ctx, x0 + i * bw + bw * 0.2, -bh / 2 - h * 0.06, bw * 0.6, bh, bw * 0.3);
    ctx.fill();
  }
  ctx.font = `600 ${17 * u}px ${c.font}`;
  ctx.fillStyle = MUTED;
  ctx.textAlign = "left";
  ctx.fillText(m.value ?? "0:36", x0, h * 0.3);
}

// ---------- closing card (call to action) ----------

function closing(c: Ctx) {
  const { ctx, m, W, u } = c;
  popIn(c, 0.4);
  const pad = 40 * u;
  const w = Math.min(W * 0.9, 620 * u);
  const ts = 54 * u;
  ctx.font = `900 ${ts}px ${c.font}`;
  const tLines = m.text ? wrapWords(ctx, m.text, w - pad * 2) : [];
  ctx.font = `600 ${26 * u}px ${c.font}`;
  const sLines = m.sub ? wrapWords(ctx, m.sub, w - pad * 2) : [];
  const btnH = m.label ? 64 * u : 0;
  const h = pad * 2 + tLines.length * ts * 1.08 + (sLines.length ? sLines.length * 34 * u + 14 * u : 0) + (btnH ? btnH + 24 * u : 0);
  panel(ctx, -w / 2, -h / 2, w, h, 30 * u);
  let y = -h / 2 + pad;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.font = `900 ${ts}px ${c.font}`;
  ctx.fillStyle = c.color;
  for (const l of tLines) {
    ctx.fillText(l, -w / 2 + pad, y);
    y += ts * 1.08;
  }
  if (sLines.length) {
    y += 14 * u;
    ctx.font = `600 ${26 * u}px ${c.font}`;
    ctx.fillStyle = MUTED;
    for (const l of sLines) {
      ctx.fillText(l, -w / 2 + pad, y);
      y += 34 * u;
    }
  }
  if (m.label) {
    y += 24 * u;
    ctx.font = `900 ${28 * u}px ${c.font}`;
    const bw = Math.min(w - pad * 2, ctx.measureText(m.label.toUpperCase()).width + 56 * u);
    const pulse = 1 + 0.03 * Math.sin((c.t - m.start) * 6);
    ctx.save();
    ctx.translate(-w / 2 + pad + bw / 2, y + btnH / 2);
    ctx.scale(pulse, pulse);
    ctx.fillStyle = c.accent;
    rr(ctx, -bw / 2, -btnH / 2, bw, btnH, 12 * u);
    ctx.fill();
    ctx.fillStyle = contrastOn(c.accent);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(m.label.toUpperCase(), 0, 2 * u, bw - 20 * u);
    ctx.restore();
  }
}

// ---------- progress bar ----------

function progress(c: Ctx) {
  const { ctx, m, t, W, u } = c;
  popIn(c, 0.3);
  const w = Math.min(W * 0.86, 600 * u);
  const pad = 30 * u;
  const h = 130 * u;
  panel(ctx, -w / 2, -h / 2, w, h, 24 * u);
  const target = clamp((Number.isFinite(m.to) ? m.to! : 100) / 100);
  const p = target * easeOutCubic((t - m.start - 0.2) / Math.max(0.8, Math.min(2, (m.end - m.start) * 0.6)));
  ctx.textBaseline = "middle";
  ctx.font = `800 ${26 * u}px ${c.font}`;
  ctx.fillStyle = c.color;
  ctx.textAlign = "left";
  ctx.fillText(m.label ?? m.text ?? "", -w / 2 + pad, -h / 2 + pad + 14 * u, w * 0.7);
  ctx.textAlign = "right";
  ctx.fillStyle = c.accent;
  ctx.fillText(`${Math.round(p * 100)}%`, w / 2 - pad, -h / 2 + pad + 14 * u);
  const by = h / 2 - pad - 18 * u;
  ctx.fillStyle = "rgba(255,255,255,0.13)";
  rr(ctx, -w / 2 + pad, by, w - pad * 2, 18 * u, 9 * u);
  ctx.fill();
  if (p > 0.005) {
    ctx.fillStyle = c.accent;
    rr(ctx, -w / 2 + pad, by, (w - pad * 2) * p, 18 * u, 9 * u);
    ctx.fill();
  }
}

// ---------- emoji ----------

function emoji(c: Ctx) {
  const { ctx, m, t, u } = c;
  const p = clamp((t - m.start) / 0.4);
  const s = 0.3 + 0.7 * easeOutBack(p);
  ctx.globalAlpha *= clamp(p * 3);
  ctx.translate(0, Math.sin((t - m.start) * 3) * 8 * u);
  ctx.rotate(Math.sin((t - m.start) * 2.4) * 0.12);
  ctx.scale(s, s);
  ctx.font = `${140 * u}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(m.value || "🔥", 0, 0);
}

// ---------- open-world game HUD: minimap, health/armor, money, wanted stars ----------

function outlined(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, fill: string, lw: number) {
  ctx.lineJoin = "round";
  ctx.lineWidth = lw;
  ctx.strokeStyle = "#000";
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr2 = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2);
  }
  ctx.closePath();
}

function gameHud(c: Ctx) {
  const { ctx, m, t, W, H } = c;
  const u = Math.min(W, H) / 720; // the HUD keeps its size; "size" scales only the minimap
  const el = t - m.start;
  ctx.globalAlpha *= clamp(el / 0.3);
  const margin = 34 * u;

  // minimap (bottom left, above the area of the subtitles in vertical videos)
  const r = 120 * u * (m.size || 1);
  const cx = margin + r;
  const cy = H - (H > W ? H * 0.2 : margin * 1.6) - r;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = "#3b4a3f";
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.translate(cx, cy);
  ctx.rotate(Math.sin(el * 0.35) * 0.5);
  const scroll = (el * 26 * u) % (90 * u);
  const g = 90 * u;
  // blocks
  for (let i = -3; i <= 3; i++)
    for (let j = -3; j <= 3; j++) {
      const k = Math.abs((i * 7 + j * 13) % 5);
      ctx.fillStyle = k === 0 ? "#4f7a46" : k === 1 ? "#2f6f8f" : "#56605a";
      ctx.fillRect(i * g + 9 * u, j * g + 9 * u + scroll, g - 18 * u, g - 18 * u);
    }
  // streets
  ctx.strokeStyle = "#c9cfc9";
  ctx.lineWidth = 7 * u;
  for (let i = -3; i <= 3; i++) {
    ctx.beginPath();
    ctx.moveTo(i * g, -4 * g);
    ctx.lineTo(i * g, 4 * g);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-4 * g, i * g + scroll);
    ctx.lineTo(4 * g, i * g + scroll);
    ctx.stroke();
  }
  // route to the destination
  ctx.strokeStyle = c.accent;
  ctx.lineWidth = 6 * u;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, -g + scroll);
  ctx.lineTo(g, -g + scroll);
  ctx.lineTo(g, -2 * g + scroll);
  ctx.stroke();
  ctx.fillStyle = "#ffd23f";
  ctx.beginPath();
  ctx.arc(g, -2 * g + scroll, 10 * u, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // player arrow + ring
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.moveTo(cx, cy - 13 * u);
  ctx.lineTo(cx + 9 * u, cy + 10 * u);
  ctx.lineTo(cx, cy + 5 * u);
  ctx.lineTo(cx - 9 * u, cy + 10 * u);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.75)";
  ctx.lineWidth = 6 * u;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  // health and armor
  const bw = r * 2;
  const bh = 10 * u;
  const by = cy + r + 12 * u;
  const bars: [string, number][] = [
    ["#52c25a", 0.86 + 0.06 * Math.sin(el * 0.7)],
    ["#3a8fd8", 0.6],
  ];
  bars.forEach(([col, v], i) => {
    const x = cx - r + (i * (bw + 6 * u)) / 2;
    const w = (bw - 6 * u) / 2;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(x - 2 * u, by - 2 * u, w + 4 * u, bh + 4 * u);
    ctx.fillStyle = col;
    ctx.fillRect(x, by, w * v, bh);
  });
  // place name next to the minimap
  if (m.text) {
    ctx.font = `${30 * u}px ${c.font}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    outlined(ctx, m.text.toUpperCase(), cx + r + 16 * u, cy + r, c.color, 6 * u);
  }

  // top right: clock, money, wanted stars
  ctx.textAlign = "right";
  ctx.textBaseline = "top";
  const right = W - margin;
  let y = margin + (H > W ? H * 0.04 : 0);
  if (m.label) {
    ctx.font = `${34 * u}px ${c.font}`;
    outlined(ctx, m.label, right, y, "#fff", 6 * u);
    y += 42 * u;
  }
  const from = Number.isFinite(m.from) ? m.from! : 0;
  const to = Number.isFinite(m.to) ? m.to! : from;
  const p = easeOutCubic((el - 0.4) / Math.max(0.6, Math.min(2.5, (m.end - m.start) * 0.4)));
  const money = from + (to - from) * p;
  ctx.font = `${54 * u}px ${c.font}`;
  outlined(ctx, `$${fmtNumber(money)}`, right, y, "#6fd66a", 8 * u);
  y += 66 * u;
  const n = Math.max(0, Math.min(5, Math.round(Number(m.value) || 0)));
  const sr = 17 * u;
  for (let i = 0; i < 5; i++) {
    const x = right - sr - i * sr * 2.3;
    star(ctx, x, y + sr, sr);
    const lit = 4 - i < n;
    const blink = lit && Math.floor(el * 4) % 2 === 0;
    ctx.fillStyle = lit ? (blink ? "#fff" : "#f4f4f4") : "rgba(0,0,0,0.35)";
    ctx.lineWidth = 4 * u;
    ctx.strokeStyle = "#000";
    ctx.stroke();
    ctx.fill();
  }
}

// ---------- mission notice: big centered title + reward, optional hint box top left ----------

function mission(c: Ctx) {
  const { ctx, m, t, W, H, u } = c;
  const el = t - m.start;
  if (m.label) {
    // hint box, in screen coordinates
    ctx.save();
    ctx.translate(-m.x * W, -m.y * H);
    const a = clamp(el / 0.25);
    ctx.globalAlpha *= a;
    const pad = 18 * u;
    const w = Math.min(W * 0.62, 430 * u);
    ctx.font = `600 ${24 * u}px Inter, sans-serif`;
    const lines = wrapWords(ctx, m.label, w - pad * 2);
    const h = pad * 2 + lines.length * 30 * u;
    const x = 30 * u;
    const y = 30 * u + (H > W ? H * 0.04 : 0);
    ctx.fillStyle = "rgba(0,0,0,0.78)";
    ctx.fillRect(x, y, w, h);
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillStyle = "#fff";
    lines.forEach((l, i) => ctx.fillText(l, x + pad, y + pad + i * 30 * u));
    ctx.restore();
  }
  if (!m.text) return;
  const p = clamp(el / 0.45);
  const s = 1.25 - 0.25 * easeOutCubic(p);
  ctx.globalAlpha *= clamp(p * 2.5);
  // dark band behind
  const bandH = (m.sub ? 190 : 140) * u;
  const grad = ctx.createLinearGradient(-W / 2, 0, W / 2, 0);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(0.5, "rgba(0,0,0,0.6)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(-W / 2, -bandH / 2, W, bandH);
  ctx.scale(s, s);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let size = 78 * u;
  ctx.font = `${size}px ${c.font}`;
  const txt = m.text.toUpperCase();
  const tw = ctx.measureText(txt).width;
  if (tw > W * 0.9) {
    size *= (W * 0.9) / tw;
    ctx.font = `${size}px ${c.font}`;
  }
  const ty = m.sub ? -26 * u : 0;
  outlined(ctx, txt, 0, ty, c.accent, 10 * u);
  if (m.sub) {
    const sp = clamp((el - 0.35) / 0.3);
    ctx.globalAlpha *= sp;
    ctx.font = `${38 * u}px ${c.font}`;
    outlined(ctx, m.sub, 0, ty + size * 0.5 + 34 * u, c.color, 7 * u);
  }
}
