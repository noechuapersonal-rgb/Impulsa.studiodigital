// Text-to-speech worker. Runs Meta's MMS-TTS voices fully in the browser via Transformers.js
// (each voice is downloaded once from the Hugging Face Hub and cached by the browser).
import { pipeline } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2";

const voices = new Map();

async function load(model, dtype, id) {
  const key = `${model}:${dtype}`;
  if (voices.has(key)) return voices.get(key);
  const progress_callback = (progress) => self.postMessage({ type: "progress", id, progress });
  // these models are small: WASM works everywhere (also on phones)
  const p = pipeline("text-to-speech", model, { device: "wasm", dtype, progress_callback });
  voices.set(key, p);
  try {
    return await p;
  } catch (e) {
    voices.delete(key);
    throw e;
  }
}

self.onmessage = async (e) => {
  const { id, texts, model, dtype = "fp32" } = e.data;
  try {
    self.postMessage({ type: "status", id, status: "Cargando la voz…" });
    const tts = await load(model, dtype, id);
    const out = [];
    for (let i = 0; i < texts.length; i++) {
      self.postMessage({ type: "status", id, status: `Generando voz ${i + 1} de ${texts.length}…` });
      const t = texts[i];
      if (!t) {
        out.push({ audio: new Float32Array(0), sampling_rate: 16000 });
        continue;
      }
      const r = await tts(t);
      const audio = r.audio ?? r.data;
      out.push({ audio: new Float32Array(audio), sampling_rate: r.sampling_rate ?? 16000 });
    }
    self.postMessage(
      { type: "result", id, result: out },
      out.map((o) => o.audio.buffer),
    );
  } catch (err) {
    self.postMessage({ type: "error", id, error: String((err && err.message) || err) });
  }
};
