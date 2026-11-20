"use client";

import { useState } from "react";
import { useEditor } from "@/lib/store";
import { deleteVersion, renameVersion, saveVersion, switchVersion } from "@/lib/versions";

/** Strip under the preview with the saved versions of this video. */
export default function VersionsBar() {
  const versions = useEditor((s) => s.versions);
  const active = useEditor((s) => s.activeVersion);
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  if (!versions.length) return null;
  return (
    <div className="scroll-thin flex shrink-0 items-center gap-2 overflow-x-auto border-t border-[var(--line)] px-3 py-1.5 md:px-4">
      <span className="shrink-0 text-[11px] font-semibold text-[var(--muted)]">Versiones</span>
      {versions.map((v) => (
        <div
          key={v.id}
          className={`group relative flex shrink-0 items-center gap-1.5 rounded-lg border py-1 pr-2 pl-1 ${active === v.id ? "border-[var(--accent)] bg-[var(--accent)]/15" : "border-[var(--line)] hover:border-[var(--muted)]"}`}
        >
          <button className="flex items-center gap-1.5" onClick={() => switchVersion(v.id)} title="Ver esta versión">
            {v.thumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={v.thumb} alt="" className="h-8 w-[18px] rounded-sm object-cover" />
            ) : (
              <span className="grid h-8 w-[18px] place-items-center rounded-sm bg-[var(--panel-2)] text-[9px]">🎬</span>
            )}
            {editing === v.id ? (
              <input
                autoFocus
                className="w-28 rounded bg-[var(--panel-2)] px-1 text-[11px] outline-none"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => {
                  renameVersion(v.id, name.trim() || v.name);
                  setEditing(null);
                }}
                onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span
                className="max-w-40 truncate text-[11px]"
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  setEditing(v.id);
                  setName(v.name);
                }}
              >
                {v.name}
              </span>
            )}
          </button>
          <button
            className="text-[10px] text-[var(--muted)] opacity-60 hover:text-red-400 hover:opacity-100"
            title="Borrar versión"
            onClick={() => deleteVersion(v.id)}
          >
            ✕
          </button>
        </div>
      ))}
      <button
        className="shrink-0 rounded-lg border border-dashed border-[var(--line)] px-2 py-1.5 text-[11px] text-[var(--muted)] hover:text-white"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await saveVersion();
          setBusy(false);
        }}
        title="Guardar lo que ves ahora como una versión nueva"
      >
        + Guardar versión
      </button>
    </div>
  );
}
