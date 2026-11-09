export type AssetKind = "video" | "image" | "audio";

export interface Asset {
  id: string;
  kind: AssetKind;
  name: string;
  url: string;
  duration: number;
  width?: number;
  height?: number;
  file: File;
}

/** A piece of a source video placed on the main track. Clips play one after another. */
export interface Clip {
  id: string;
  assetId: string;
  in: number; // source time (s)
  out: number; // source time (s)
  volume: number; // 0..2
}

export type Animation = "none" | "fade" | "pop" | "slide_up" | "typewriter";
export type Position =
  | "center"
  | "top"
  | "bottom"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

export type TextPreset = "titulo" | "subtitulo" | "etiqueta" | "cta";

export interface Overlay {
  id: string;
  kind: "image" | "text";
  assetId?: string;
  text?: string;
  preset?: TextPreset;
  color?: string;
  start: number;
  end: number;
  /** center of the overlay, normalized 0..1 */
  x: number;
  y: number;
  /** image: width as fraction of canvas width; text: font size multiplier */
  size: number;
  animation: Animation;
}

export const SFX_NAMES = [
  "whoosh",
  "pop",
  "ding",
  "boom",
  "click",
  "riser",
  "tada",
  "buzzer",
  "glitch",
  "bubble",
] as const;
export type SfxName = (typeof SFX_NAMES)[number];

export interface AudioItem {
  id: string;
  kind: "music" | "sfx";
  assetId?: string;
  sfx?: SfxName;
  name: string;
  start: number; // timeline
  duration: number;
  offset: number; // start offset inside the source
  volume: number;
  fadeIn: number;
  fadeOut: number;
  loop: boolean;
}

export interface Cue {
  id: string;
  start: number;
  end: number;
  text: string;
}

export type SubtitlePreset = "tiktok" | "clasico" | "karaoke" | "minimal" | "neon";

export interface SubtitleStyle {
  preset: SubtitlePreset;
  fontSize: number; // px at a 720px reference
  color: string;
  highlight: string;
  position: "top" | "middle" | "bottom";
  uppercase: boolean;
  background: boolean;
  wordsPerCue: number;
}

export const EFFECT_TYPES = [
  "blanco_negro",
  "sepia",
  "vintage",
  "desenfoque",
  "brillo",
  "contraste",
  "saturacion",
  "vineta",
  "zoom",
  "temblor",
  "fundido_entrada",
  "fundido_salida",
  "flash",
  "glitch",
  "cine",
] as const;
export type EffectType = (typeof EFFECT_TYPES)[number];

export const EFFECT_LABELS: Record<EffectType, string> = {
  blanco_negro: "Blanco y negro",
  sepia: "Sepia",
  vintage: "Vintage",
  desenfoque: "Desenfoque",
  brillo: "Brillo",
  contraste: "Contraste",
  saturacion: "Saturación",
  vineta: "Viñeta",
  zoom: "Zoom (punch-in)",
  temblor: "Temblor de cámara",
  fundido_entrada: "Fundido de entrada",
  fundido_salida: "Fundido de salida",
  flash: "Flash blanco",
  glitch: "Glitch",
  cine: "Barras de cine",
};

export interface Effect {
  id: string;
  type: EffectType;
  start: number;
  end: number;
  intensity: number; // 0..1
}

export type Aspect = "16:9" | "9:16" | "1:1" | "4:5";
export type Fit = "cover" | "contain" | "blur";

export interface Project {
  aspect: Aspect;
  fit: Fit;
  clips: Clip[];
  overlays: Overlay[];
  audio: AudioItem[];
  cues: Cue[];
  subtitleStyle: SubtitleStyle;
  effects: Effect[];
}

export interface Segment {
  start: number; // source time
  end: number;
  text: string;
}

export type Selection =
  | { kind: "clip" | "overlay" | "audio" | "cue" | "effect"; id: string }
  | null;
