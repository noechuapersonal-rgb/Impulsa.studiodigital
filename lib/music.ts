"use client";

/**
 * Original background music, composed in the browser (no copyrighted songs, nothing to download):
 * drums, bass, chords and melody synthesized with the Web Audio API in the chosen style.
 * Returns a WAV file plus the beat times, so cuts and elements can follow the rhythm.
 */

export const MUSIC_STYLES = {
  energetica: { label: "Energética", hint: "Electrónica con pulso fuerte (anuncios, ofertas, tecnología)", bpm: 124 },
  corporativa: { label: "Positiva", hint: "Alegre y limpia (servicios, marcas, cursos)", bpm: 112 },
  chill: { label: "Chill", hint: "Relajada, lo-fi (gastronomía, moda, lifestyle)", bpm: 86 },
  emotiva: { label: "Emotiva", hint: "Piano y pads (historias, testimonios, antes y después)", bpm: 72 },
} as const;
export type MusicStyle = keyof typeof MUSIC_STYLES;

const SR = 44100;
const midi = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

// chord progressions (MIDI notes) — 4 bars each, looped
const PROGRESSIONS: Record<MusicStyle, number[][]> = {
  energetica: [
    [57, 60, 64], // Am
    [53, 57, 60], // F
    [48, 52, 55], // C
    [55, 59, 62], // G
  ],
  corporativa: [
    [48, 52, 55], // C
    [55, 59, 62], // G
    [57, 60, 64], // Am
    [53, 57, 60], // F
  ],
  chill: [
    [53, 57, 60, 64], // Fmaj7
    [52, 55, 59, 62], // Em7
    [50, 53, 57, 60], // Dm7
    [48, 52, 55, 59], // Cmaj7
  ],
  emotiva: [
    [48, 52, 55], // C
    [57, 60, 64], // Am
    [53, 57, 60], // F
    [55, 59, 62], // G
  ],
};

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 10000) / 10000;
  };
}

export interface GeneratedMusic {
  file: File;
  bpm: number;
  beats: number[];
  duration: number;
}

export async function generateMusic(style: MusicStyle, seconds: number, seed = Date.now()): Promise<GeneratedMusic> {
  const { bpm } = MUSIC_STYLES[style];
  const beat = 60 / bpm;
  const bar = beat * 4;
  const duration = Math.max(6, Math.min(180, seconds));
  const ctx = new OfflineAudioContext(1, Math.ceil(SR * (duration + 0.5)), SR);
  const rand = rng(seed);

  const master = ctx.createGain();
  master.gain.value = 0.9;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 4;
  master.connect(comp).connect(ctx.destination);
  // gentle fade in / out of the whole track
  master.gain.setValueAtTime(0.0001, 0);
  master.gain.linearRampToValueAtTime(0.9, 0.4);
  master.gain.setValueAtTime(0.9, Math.max(0.5, duration - 1.6));
  master.gain.linearRampToValueAtTime(0.0001, duration);

  // "sidechain": music ducks on every kick (the pumping sound of modern tracks)
  const duck = ctx.createGain();
  duck.connect(master);

  const noise = ctx.createBuffer(1, SR, SR);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

  const env = (g: GainNode, t: number, peak: number, attack: number, decay: number) => {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  };

  const kick = (t: number, level = 1) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.13);
    env(g, t, level, 0.003, 0.38);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + 0.45);
    duck.gain.setValueAtTime(0.35, t);
    duck.gain.linearRampToValueAtTime(1, t + beat * 0.7);
  };
  const noiseHit = (t: number, type: BiquadFilterType, freq: number, level: number, decay: number) => {
    const s = ctx.createBufferSource();
    s.buffer = noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    env(g, t, level, 0.002, decay);
    s.connect(f).connect(g).connect(master);
    s.start(t, rand() * 0.5);
    s.stop(t + decay + 0.05);
  };
  const clap = (t: number, level = 0.45) => {
    for (let i = 0; i < 3; i++) noiseHit(t + i * 0.012, "bandpass", 1500, level * (i === 2 ? 1 : 0.6), i === 2 ? 0.2 : 0.03);
  };
  const hat = (t: number, open = false, level = 0.16) => noiseHit(t, "highpass", 7500, level, open ? 0.22 : 0.045);
  const snare = (t: number, level = 0.35) => {
    noiseHit(t, "bandpass", 2200, level, 0.16);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = 190;
    env(g, t, level * 0.6, 0.002, 0.1);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + 0.15);
  };
  const tone = (
    t: number,
    note: number,
    len: number,
    o: { type: OscillatorType; level: number; attack?: number; cutoff?: number; detune?: number; dest?: AudioNode; release?: number },
  ) => {
    const osc = ctx.createOscillator();
    osc.type = o.type;
    osc.frequency.value = midi(note);
    if (o.detune) osc.detune.value = o.detune;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = o.cutoff ?? 2000;
    const g = ctx.createGain();
    const a = o.attack ?? 0.01;
    const r = o.release ?? 0.15;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(o.level, t + a);
    g.gain.setValueAtTime(o.level, t + Math.max(a, len - r));
    g.gain.linearRampToValueAtTime(0.0001, t + len);
    osc.connect(f).connect(g).connect(o.dest ?? duck);
    osc.start(t);
    osc.stop(t + len + 0.05);
  };
  const piano = (t: number, note: number, level = 0.18) => {
    for (const [mult, lv, type] of [
      [1, 1, "triangle"],
      [2, 0.35, "sine"],
      [3, 0.12, "sine"],
    ] as [number, number, OscillatorType][]) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = midi(note) * mult;
      const g = ctx.createGain();
      env(g, t, level * lv, 0.005, 1.6);
      osc.connect(g).connect(master);
      osc.start(t);
      osc.stop(t + 1.7);
    }
  };

  const prog = PROGRESSIONS[style];
  const beats: number[] = [];
  for (let t = 0; t < duration; t += beat) beats.push(Number(t.toFixed(3)));

  // melody notes from the chord + passing tones, chosen once and repeated every 4 bars (a hook)
  const motif = Array.from({ length: 8 }, () => Math.floor(rand() * 3));

  for (let b = 0; b * bar < duration; b++) {
    const t0 = b * bar;
    const chord = prog[b % prog.length];
    const root = chord[0];
    const intro = b === 0;

    switch (style) {
      case "energetica": {
        for (let i = 0; i < 4; i++) {
          const t = t0 + i * beat;
          if (!intro || i >= 2) kick(t);
          hat(t + beat / 2, true, 0.12);
          if (i % 2 === 1) clap(t);
          // rolling sixteenth bass
          for (let k = 1; k < 4; k++) tone(t + (k * beat) / 4, root - 24, beat / 4.4, { type: "sawtooth", level: 0.16, cutoff: 520 });
        }
        // offbeat chord stabs
        for (let i = 0; i < 4; i++)
          for (const n of chord) tone(t0 + i * beat + beat / 2, n + 12, beat / 3, { type: "sawtooth", level: 0.045, cutoff: 2600, detune: (rand() - 0.5) * 14 });
        // lead hook on the second half of the track
        if (b >= 2)
          motif.forEach((m, i) => tone(t0 + i * (beat / 2), chord[m] + 24, beat / 2.2, { type: "square", level: 0.03, cutoff: 3200 }));
        break;
      }
      case "corporativa": {
        for (let i = 0; i < 4; i++) {
          const t = t0 + i * beat;
          kick(t, 0.85);
          if (i % 2 === 1) clap(t, 0.35);
          hat(t + beat / 2, false, 0.13);
          tone(t, root - 24, beat * 0.9, { type: "triangle", level: 0.22, cutoff: 900 });
        }
        // bright plucked arpeggio
        for (let k = 0; k < 8; k++) tone(t0 + (k * beat) / 2, chord[k % chord.length] + 12, beat / 2.3, { type: "triangle", level: 0.09, cutoff: 4200 });
        for (const n of chord) tone(t0, n, bar, { type: "sine", level: 0.05, attack: 0.3, release: 0.4 });
        break;
      }
      case "chill": {
        const swing = beat * 0.08;
        for (let i = 0; i < 4; i++) {
          const t = t0 + i * beat;
          if (i === 0 || i === 2) kick(t, 0.6);
          if (i === 1 || i === 3) snare(t, 0.22);
          hat(t, false, 0.07);
          hat(t + beat / 2 + swing, false, 0.05);
        }
        for (const n of chord) tone(t0, n, bar, { type: "triangle", level: 0.06, attack: 0.25, cutoff: 1300, release: 0.5, dest: master });
        tone(t0, root - 12, beat * 1.8, { type: "sine", level: 0.2, cutoff: 600, dest: master });
        tone(t0 + beat * 2.5, root - 12, beat * 1.2, { type: "sine", level: 0.16, cutoff: 600, dest: master });
        if (b >= 1) motif.slice(0, 4).forEach((m, i) => piano(t0 + i * beat + (i % 2) * swing, chord[m] + 12, 0.08));
        break;
      }
      case "emotiva": {
        for (const n of chord) tone(t0, n - 12, bar, { type: "sine", level: 0.07, attack: 0.8, release: 0.8, dest: master });
        // arpeggiated piano
        for (let k = 0; k < 8; k++) piano(t0 + (k * beat) / 2, chord[k % chord.length] + (k >= 4 ? 12 : 0), 0.12);
        if (b >= 4) {
          kick(t0, 0.5);
          kick(t0 + beat * 2, 0.4);
        }
        break;
      }
    }
  }

  const buf = await ctx.startRendering();
  const data = buf.getChannelData(0).subarray(0, Math.ceil(SR * duration));
  return {
    file: new File([encodeWav(data, SR)], `musica-${style}.wav`, { type: "audio/wav" }),
    bpm,
    beats,
    duration,
  };
}

export function encodeWav(samples: Float32Array, rate: number): ArrayBuffer {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
  // normalize every style to the same loudness ceiling
  const k = peak > 0 ? Math.min(4, 0.95 / peak) : 1;
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + samples.length * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] * k));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buf;
}
