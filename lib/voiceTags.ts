/**
 * Turns a script's stage directions ("susurrando", "gritando, furiosa") into the audio tags the expressive
 * ElevenLabs model (v3) understands ("[whispers]", "[shouts] [angry]"). Shared by the browser and the server.
 */

const RULES: [RegExp, string][] = [
  [/susurr|en voz baja|bajito|al oido/, "whispers"],
  [/grit|a los gritos|chill|vocifer/, "shouts"],
  [/enoj|furi|indign|rabia|bronca|enfurec/, "angry"],
  [/llor|sollo|entre lagrimas|lagrimas/, "crying"],
  [/carcaj|riendo|rie\b|se rie|risa/, "laughs"],
  [/suspir/, "sighs"],
  [/sarcas|ironi/, "sarcastic"],
  [/emocion|feliz|alegr|euforic|entusias/, "excited"],
  [/nervios|tartamud|temblando|asustad|miedo/, "nervous"],
  [/triste|apenad|dolid|desconsol/, "sad"],
  [/curios|intrig/, "curious"],
  [/picar|malici|traviesa|travieso|maquiavel|malvad/, "mischievously"],
  [/sorprend|asombr|shock/, "surprised"],
  [/dramatic/, "dramatically"],
];

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** "(susurrando, con malicia)" → ["whispers", "mischievously"] (at most 2, unknown directions are ignored). */
export function stageToTags(stage: string): string[] {
  const s = norm(stage);
  if (!s.trim()) return [];
  const out: string[] = [];
  for (const [re, tag] of RULES) if (re.test(s) && !out.includes(tag)) out.push(tag);
  return out.slice(0, 2);
}

export const isExpressiveModel = (model: string) => /v3/i.test(model);
