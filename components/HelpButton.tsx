"use client";

import { useState } from "react";

const WHATSAPP = (process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP ?? "").replace(/\D/g, "");
const EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "";

const TIPS: [string, string][] = [
  ["🎬 Subir y agregar", "Tocá «+» al lado del play: videos, fotos, textos, música, sonidos y efectos. Cada cosa nueva va después de la anterior."],
  ["✨ Pedirle a la IA", "Escribile en el chat lo que querés, como se lo dirías a un editor: «poné subtítulos y sacá los silencios». Cada pedido usa 1 crédito."],
  ["🔤 Subtítulos", "En Editar → Subtítulos. Detecta el idioma solo; si sale mal, elegí el idioma a mano y generá de nuevo."],
  ["✂ Corregir", "Tocá cualquier cosa en la línea de tiempo para cambiarla en Propiedades. Con ↶ deshacés el último cambio."],
  ["💾 Guardado", "Tus proyectos se guardan solos. Los encontrás en 📁 Proyectos."],
  ["⬇ Exportar", "Se arma en tiempo real: tarda lo que dura el video. Dejá la pantalla abierta. En el celu podés guardarlo en la galería o mandarlo a WhatsApp."],
];

/** Help button: quick guide plus how to contact support. */
export default function HelpButton({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className={compact ? "shrink-0 text-xs font-semibold text-[var(--accent)]" : "btn !px-2.5 md:!px-3"}
        onClick={() => setOpen(true)}
        title="Ayuda"
      >
        ❓{compact ? " Ayuda" : <span className="hidden xl:inline"> Ayuda</span>}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 md:items-center" onClick={() => setOpen(false)}>
          <div
            className="panel max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] md:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold">¿Cómo te ayudamos?</h2>
              <button className="text-[var(--muted)] hover:text-white" onClick={() => setOpen(false)} aria-label="Cerrar">
                ✕
              </button>
            </div>
            <div className="space-y-2.5">
              {TIPS.map(([title, text]) => (
                <div key={title} className="rounded-xl bg-[var(--panel-2)] p-3">
                  <div className="text-sm font-semibold">{title}</div>
                  <p className="mt-0.5 text-[13px] text-[var(--muted)]">{text}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-xl border border-[var(--line)] p-3">
              <div className="text-sm font-semibold">¿Algo no funciona o tenés una idea?</div>
              <p className="mt-0.5 text-[13px] text-[var(--muted)]">
                Contanos qué pasó (si podés, con una captura de pantalla) y te respondemos.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {WHATSAPP && (
                  <a
                    className="btn btn-primary"
                    href={`https://wa.me/${WHATSAPP}?text=${encodeURIComponent("Hola! Te escribo por Impulsa Studio: ")}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    💬 Escribir por WhatsApp
                  </a>
                )}
                {EMAIL && (
                  <a className="btn" href={`mailto:${EMAIL}?subject=${encodeURIComponent("Ayuda con Impulsa Studio")}`}>
                    ✉ {EMAIL}
                  </a>
                )}
                {!WHATSAPP && !EMAIL && (
                  <p className="text-[13px] text-[var(--muted)]">Escribinos por el mismo medio por el que recibiste el link.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
