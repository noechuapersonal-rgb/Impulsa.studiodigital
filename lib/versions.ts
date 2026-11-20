"use client";

import { getPlayer } from "./player";
import { contentDuration, uid } from "./project";
import { store } from "./store";
import type { Project, ProjectVersion } from "./types";

/**
 * Versions of the same video ("Versión A / B / C"): the AI (or the user) saves variants with a different
 * hook, format or style, and the user compares them and keeps the one they like.
 */

const MAX_VERSIONS = 6;

async function thumbOf(project: Project): Promise<string | undefined> {
  const player = getPlayer();
  const dur = contentDuration(project);
  if (!player || dur <= 0) return undefined;
  try {
    // a frame from the hook, where the video says the most
    const [f] = await player.renderFrames([Math.min(dur - 0.05, Math.max(0.6, dur * 0.12))], 180);
    return f ? `data:image/jpeg;base64,${f.data}` : undefined;
  } catch {
    return undefined;
  }
}

const nextLetter = (n: number) => String.fromCharCode(65 + (n % 26));

/** Saves what is on screen now as a new version and makes it the active one. */
export async function saveVersion(name?: string): Promise<ProjectVersion> {
  const s = store.get();
  const project = structuredClone(s.project);
  const v: ProjectVersion = {
    id: uid(),
    name: (name?.trim() || `Versión ${nextLetter(s.versions.length)}`).slice(0, 60),
    project,
    thumb: await thumbOf(project),
  };
  store.set((st) => ({ versions: [...st.versions, v].slice(-MAX_VERSIONS), activeVersion: v.id }));
  return v;
}

/** Shows another version. The edits made to the current one are kept in it. */
export function switchVersion(id: string) {
  const s = store.get();
  const target = s.versions.find((v) => v.id === id);
  if (!target || id === s.activeVersion) return;
  let versions = s.versions;
  if (s.activeVersion) {
    // keep the latest edits of the version we are leaving
    versions = versions.map((v) => (v.id === s.activeVersion ? { ...v, project: structuredClone(s.project) } : v));
  } else if (contentDuration(s.project) > 0) {
    // work that was never saved as a version: keep it as one so nothing is lost
    versions = [...versions, { id: uid(), name: "Sin guardar", project: structuredClone(s.project) }];
  }
  store.set({ versions, activeVersion: id, selection: null });
  store.edit(() => structuredClone(target.project));
  getPlayer()?.seek(0);
}

export function renameVersion(id: string, name: string) {
  store.set((s) => ({ versions: s.versions.map((v) => (v.id === id ? { ...v, name: name.slice(0, 60) } : v)) }));
}

export function deleteVersion(id: string) {
  store.set((s) => ({
    versions: s.versions.filter((v) => v.id !== id),
    activeVersion: s.activeVersion === id ? null : s.activeVersion,
  }));
}
