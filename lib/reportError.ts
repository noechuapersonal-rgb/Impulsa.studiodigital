"use client";

/**
 * Sends an error to the admin panel ("Errores recientes"), so problems are seen before users write in.
 * At most a few per page load, without repeating the same message.
 */
const seen = new Set<string>();
let sent = 0;

export function reportError(where: string, err: unknown, detail?: string) {
  try {
    const message = (err instanceof Error ? err.message : String(err ?? "")).trim();
    if (!message || sent >= 12) return;
    // expected situations, not bugs: out of credits, trial ended, signed out, offline
    if (/créditos|prueba gratis|suscr[ií]bete|sesión expiró|Failed to fetch|NetworkError|aborted/i.test(message)) return;
    const key = `${where}|${message}`;
    if (seen.has(key)) return;
    seen.add(key);
    sent++;
    const stack = err instanceof Error && err.stack ? err.stack.split("\n").slice(0, 6).join("\n") : "";
    fetch("/api/errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        where,
        message,
        detail: [detail, stack, `pantalla ${window.innerWidth}x${window.innerHeight}`].filter(Boolean).join("\n"),
        url: location.pathname,
      }),
    }).catch(() => undefined);
  } catch {
    /* never break the app while reporting */
  }
}

/** Catches errors nobody handled (once per page). */
let installed = false;
export function installErrorReporting() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("error", (e) => {
    // ignore noise from browser extensions and cross-origin scripts
    if (!e.message || e.message === "Script error." || /extension:\/\//.test(e.filename ?? "")) return;
    reportError("app", e.error ?? e.message, e.filename ? `${e.filename}:${e.lineno}` : undefined);
  });
  window.addEventListener("unhandledrejection", (e) => reportError("app (promesa)", e.reason));
}
