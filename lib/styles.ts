import type { BackgroundStyle, SubtitlePreset } from "./types";

/**
 * Editing styles ("estilos de edición"): complete, coherent looks like the ones creators use —
 * typography pair, palette, subtitles, background, transitions and sounds that go together.
 * The AI picks one per video (a different one per version) instead of improvising.
 */

export interface EditStyle {
  id: string;
  name: string;
  emoji: string;
  hint: string;
  /** what it fits */
  when: string;
  titleFont: string;
  bodyFont: string;
  accent: string;
  text: string;
  background: { style: BackgroundStyle; base: string };
  subtitles: {
    preset: SubtitlePreset;
    color: string;
    highlight?: string; // default: accent
    uppercase: boolean;
    fontSize: number;
  };
  outline: "borde" | "sombra" | "nada";
  transitions: "mixto" | "zoom" | "barrido" | "flash";
  sounds: { appear: string; transition: string; emphasis: string };
  music: "energetica" | "corporativa" | "chill" | "emotiva";
  /** short art direction for the AI */
  notes: string;
}

export const EDIT_STYLES: EditStyle[] = [
  {
    id: "creador",
    name: "Creador viral",
    emoji: "⚡",
    hint: "Letras gruesas, verde lima y ritmo rápido",
    when: "contenido de creadores, tips, negocios digitales, cursos, software",
    titleFont: "Anton",
    bodyFont: "Inter",
    accent: "#d4ff3a",
    text: "#ffffff",
    background: { style: "grilla", base: "#0b0b10" },
    subtitles: { preset: "viral", color: "#ffffff", uppercase: true, fontSize: 60 },
    outline: "borde",
    transitions: "mixto",
    sounds: { appear: "pop", transition: "whoosh", emphasis: "boom" },
    music: "energetica",
    notes: "títulos en mayúsculas con 1–2 palabras en [caja] lima; algo nuevo cada 2 s; zoom en frases fuertes.",
  },
  {
    id: "premium",
    name: "Minimal premium",
    emoji: "🤍",
    hint: "Serif elegante, crema y dorado, calma",
    when: "marcas premium, estética, inmobiliarias, joyería, servicios profesionales de alto valor",
    titleFont: "Playfair Display",
    bodyFont: "Inter",
    accent: "#c9a46a",
    text: "#f5efe6",
    background: { style: "degradado", base: "#14110f" },
    subtitles: { preset: "minimal", color: "#f5efe6", uppercase: false, fontSize: 34 },
    outline: "sombra",
    transitions: "zoom",
    sounds: { appear: "click", transition: "whoosh", emphasis: "ding" },
    music: "emotiva",
    notes: "pocas palabras por pantalla, mucho aire, títulos en tipo oración (no todo en mayúsculas), cambios cada 3–4 s, nada de emojis.",
  },
  {
    id: "tech",
    name: "Tech neón",
    emoji: "🤖",
    hint: "Futurista, cian sobre azul oscuro",
    when: "inteligencia artificial, apps, software, gaming, tecnología",
    titleFont: "Space Grotesk",
    bodyFont: "Space Grotesk",
    accent: "#22d3ee",
    text: "#e6fbff",
    background: { style: "grilla", base: "#060a14" },
    subtitles: { preset: "viral", color: "#e6fbff", uppercase: true, fontSize: 52 },
    outline: "sombra",
    transitions: "barrido",
    sounds: { appear: "glitch", transition: "whoosh", emphasis: "riser" },
    music: "energetica",
    notes: "datos y contadores en tarjetas, listas con ✓, emojis 🤖⚡🚀; glitch suave en las transiciones.",
  },
  {
    id: "urbano",
    name: "Urbano",
    emoji: "🔥",
    hint: "Amarillo y negro, impacto, estilo street",
    when: "gimnasios, barberías, indumentaria urbana, eventos, música, comida rápida",
    titleFont: "Bebas Neue",
    bodyFont: "Archivo Black",
    accent: "#ffe14d",
    text: "#ffffff",
    background: { style: "degradado", base: "#0a0a0a" },
    subtitles: { preset: "tiktok", color: "#ffffff", uppercase: true, fontSize: 58 },
    outline: "borde",
    transitions: "flash",
    sounds: { appear: "boom", transition: "whoosh", emphasis: "boom" },
    music: "energetica",
    notes: "títulos enormes en mayúsculas, emojis 🔥💪, cortes muy rápidos, flash en los cambios.",
  },
  {
    id: "calido",
    name: "Cálido lifestyle",
    emoji: "☕",
    hint: "Serif + redondeada, coral, cercano",
    when: "gastronomía, cafeterías, moda, deco, turismo, bienestar",
    titleFont: "DM Serif Display",
    bodyFont: "Poppins",
    accent: "#ff7a59",
    text: "#fff7f2",
    background: { style: "luces", base: "#1a0f0c" },
    subtitles: { preset: "karaoke", color: "#fff7f2", uppercase: false, fontSize: 42 },
    outline: "sombra",
    transitions: "zoom",
    sounds: { appear: "bubble", transition: "whoosh", emphasis: "tada" },
    music: "chill",
    notes: "tono cercano, emojis suaves ☕✨🌿, tarjetas con precios o datos, cierre amable.",
  },
  {
    id: "profesional",
    name: "Profesional",
    emoji: "💼",
    hint: "Limpio, azul, confiable",
    when: "consultoras, estudios, salud, educación, finanzas, B2B",
    titleFont: "Montserrat",
    bodyFont: "Montserrat",
    accent: "#3b82f6",
    text: "#ffffff",
    background: { style: "degradado", base: "#0b1220" },
    subtitles: { preset: "viral", color: "#ffffff", uppercase: false, fontSize: 48 },
    outline: "sombra",
    transitions: "zoom",
    sounds: { appear: "click", transition: "whoosh", emphasis: "ding" },
    music: "corporativa",
    notes: "datos concretos en tarjetas y contadores, listas de beneficios, tono confiable, pocos emojis.",
  },
  {
    id: "pop",
    name: "Pop colorido",
    emoji: "🍭",
    hint: "Rosa y amarillo, divertido, juvenil",
    when: "público joven, cosmética, juguetería, regalos, promos divertidas",
    titleFont: "League Spartan",
    bodyFont: "Poppins",
    accent: "#ff3d8b",
    text: "#ffffff",
    background: { style: "luces", base: "#1b0b2e" },
    subtitles: { preset: "viral", color: "#ffffff", highlight: "#ffe14d", uppercase: true, fontSize: 56 },
    outline: "borde",
    transitions: "mixto",
    sounds: { appear: "bubble", transition: "whoosh", emphasis: "tada" },
    music: "corporativa",
    notes: "muchos emojis grandes, títulos con [cajas] rosas, ritmo alegre, frases cortas y con humor.",
  },
  {
    id: "editorial",
    name: "Editorial blanco y negro",
    emoji: "🖤",
    hint: "Alto contraste, sobrio, de revista",
    when: "moda, fotografía, arquitectura, arte, marcas de autor",
    titleFont: "Oswald",
    bodyFont: "Inter",
    accent: "#ef4444",
    text: "#ffffff",
    background: { style: "solido", base: "#0a0a0a" },
    subtitles: { preset: "minimal", color: "#ffffff", uppercase: true, fontSize: 34 },
    outline: "nada",
    transitions: "flash",
    sounds: { appear: "click", transition: "whoosh", emphasis: "boom" },
    music: "emotiva",
    notes: "texto en mayúsculas espaciado, el rojo solo para 1 palabra clave; sumar el efecto blanco_negro al video si lo aceptan.",
  },
];

export const styleById = (id: string) => EDIT_STYLES.find((s) => s.id === id);

export function stylesForPrompt(): string {
  return EDIT_STYLES.map(
    (s) =>
      `- ${s.emoji} ${s.name} (id: ${s.id}): ${s.when}. Tipografías ${s.titleFont} / ${s.bodyFont}, acento ${s.accent}, subtítulos ${s.subtitles.preset}, sonidos: ${s.sounds.appear} al aparecer, ${s.sounds.transition} en cortes, ${s.sounds.emphasis} para énfasis; música ${s.music}. ${s.notes}`,
  ).join("\n");
}
