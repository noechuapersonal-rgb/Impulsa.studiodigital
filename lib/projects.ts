"use client";

import { idbAll, idbDelete, idbGet, idbPut, MEDIA, PROJECTS } from "./idb";
import { probeFile } from "./media";
import { getPlayer } from "./player";
import { contentDuration, emptyProject } from "./project";
import { store } from "./store";
import type { Asset, AssetMeta, Project, ProjectVersion, Segment } from "./types";

/**
 * Saved projects. The edit (timeline, texts, subtitles, transcripts…) is saved to the account when
 * accounts are set up, and always to this device as well. Media files stay on the device (IndexedDB).
 */

export interface ProjectData {
  version: 1;
  project: Project;
  assets: AssetMeta[];
  transcripts: Record<string, Segment[]>;
  activeRefs: string[];
  versions?: ProjectVersion[];
  activeVersion?: string | null;
}

export interface ProjectSummary {
  id: string;
  name: string;
  thumb: string | null;
  updated_at: string;
}

interface LocalRecord extends ProjectSummary {
  data: ProjectData;
}

const meta = (a: Asset): AssetMeta => ({
  id: a.id,
  kind: a.kind,
  name: a.name,
  duration: a.duration,
  width: a.width,
  height: a.height,
  size: a.file.size,
  type: a.file.type,
});

export function newProjectId() {
  return crypto.randomUUID();
}

function currentData(): ProjectData {
  const s = store.get();
  return {
    version: 1,
    project: s.project,
    assets: [...s.assets.map(meta), ...s.missingAssets],
    transcripts: s.transcripts,
    activeRefs: s.activeRefs,
    versions: s.versions,
    activeVersion: s.activeVersion,
  };
}

/** Saves the open project (account + this device). Returns where it ended up. */
export async function saveCurrentProject(): Promise<"cuenta" | "dispositivo"> {
  const s = store.get();
  const id = s.projectId ?? newProjectId();
  if (!s.projectId) store.set({ projectId: id });
  const data = currentData();
  let thumb: string | null = null;
  try {
    const shot = getPlayer()?.snapshot(240);
    if (shot && contentDuration(s.project) > 0) thumb = `data:image/jpeg;base64,${shot}`;
  } catch {
    /* canvas not ready */
  }
  const record: LocalRecord = { id, name: s.projectName, thumb, updated_at: new Date().toISOString(), data };
  await idbPut(PROJECTS, id, record).catch(() => undefined);
  try {
    const res = await fetch(`/api/projects/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: s.projectName, data, thumb }),
    });
    if (res.ok) return "cuenta";
  } catch {
    /* offline or accounts not configured */
  }
  return "dispositivo";
}

/**
 * Projects of the account plus the ones saved on this device. Projects that only exist on this device
 * (made before the account could save them) are uploaded to the account so they show up everywhere.
 */
export async function listProjects(): Promise<{
  projects: ProjectSummary[];
  where: "cuenta" | "dispositivo";
  problem?: string;
}> {
  const local = await idbAll<LocalRecord>(PROJECTS).catch(() => [] as LocalRecord[]);
  let cloud: ProjectSummary[] | null = null;
  let problem: string | undefined;
  try {
    const res = await fetch("/api/projects", { cache: "no-store" });
    const body = await res.json().catch(() => ({}));
    if (res.ok) cloud = body.projects ?? [];
    else if (res.status !== 404 && res.status !== 401) problem = body.error || `Error ${res.status}`;
  } catch {
    /* offline: this device only */
  }

  if (cloud) {
    const ids = new Set(cloud.map((p) => p.id));
    const onlyHere = local.filter((l) => !ids.has(l.id));
    // upload in the background (best effort)
    for (const l of onlyHere)
      fetch(`/api/projects/${l.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: l.name, data: l.data, thumb: l.thumb }),
      }).catch(() => undefined);
    const merged = [...cloud, ...onlyHere.map(({ id, name, thumb, updated_at }) => ({ id, name, thumb, updated_at }))];
    return { projects: merged.sort((a, b) => b.updated_at.localeCompare(a.updated_at)), where: "cuenta" };
  }
  return {
    projects: local
      .map(({ id, name, thumb, updated_at }) => ({ id, name, thumb, updated_at }))
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    where: "dispositivo",
    problem,
  };
}

export async function deleteProject(id: string) {
  await idbDelete(PROJECTS, id).catch(() => undefined);
  await fetch(`/api/projects/${id}`, { method: "DELETE" }).catch(() => undefined);
}

export async function renameProject(id: string, name: string) {
  const local = await idbGet<LocalRecord>(PROJECTS, id).catch(() => undefined);
  if (local) await idbPut(PROJECTS, id, { ...local, name }).catch(() => undefined);
  // the account copy needs the data too: load it, then save with the new name
  try {
    const res = await fetch(`/api/projects/${id}`);
    if (res.ok) {
      const { project } = await res.json();
      await fetch(`/api/projects/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, data: project.data, thumb: local?.thumb ?? null }),
      });
    }
  } catch {
    /* offline */
  }
}

async function fetchProject(id: string): Promise<{ name: string; data: ProjectData; cloud: boolean } | null> {
  try {
    const res = await fetch(`/api/projects/${id}`, { cache: "no-store" });
    if (res.ok) {
      const { project } = await res.json();
      return { name: project.name, data: project.data, cloud: true };
    }
  } catch {
    /* try this device */
  }
  const local = await idbGet<LocalRecord>(PROJECTS, id).catch(() => undefined);
  return local ? { name: local.name, data: local.data, cloud: false } : null;
}

/** Opens a saved project in the editor; files missing on this device are listed in missingAssets. */
export async function openProject(id: string): Promise<boolean> {
  store.set({ busy: "Abriendo proyecto…" });
  try {
    const rec = await fetchProject(id);
    if (!rec) return false;
    const player = getPlayer();
    const assets: Asset[] = [];
    const missing: AssetMeta[] = [];
    for (const m of rec.data.assets ?? []) {
      const blob = await idbGet<Blob>(MEDIA, m.id).catch(() => undefined);
      if (!blob) {
        missing.push(m);
        continue;
      }
      const file = blob instanceof File ? blob : new File([blob], m.name, { type: m.type });
      const a = await probeFile(file, m.id, m.kind, m.name).catch(() => null);
      if (!a) {
        missing.push(m);
        continue;
      }
      await player?.addAsset(a);
      assets.push(a);
    }
    store.set({
      projectId: id,
      projectName: rec.name,
      project: { ...emptyProject(), ...rec.data.project },
      assets,
      missingAssets: missing,
      transcripts: rec.data.transcripts ?? {},
      activeRefs: rec.data.activeRefs ?? [],
      versions: rec.data.versions ?? [],
      activeVersion: rec.data.activeVersion ?? null,
      selection: null,
      past: [],
      future: [],
      time: 0,
      saveState: rec.cloud ? "saved" : "local",
    });
    return true;
  } finally {
    store.set({ busy: null });
  }
}

/** Re-attaches a file chosen by the user to a missing asset of the open project. */
export async function relinkAsset(m: AssetMeta, file: File) {
  const a = await probeFile(file, m.id, m.kind, m.name);
  if (!a) throw new Error("Ese archivo no es un video, imagen o audio válido.");
  await getPlayer()?.addAsset(a);
  await idbPut(MEDIA, a.id, file).catch(() => undefined);
  store.set((s) => ({ assets: [...s.assets, a], missingAssets: s.missingAssets.filter((x) => x.id !== m.id) }));
}
