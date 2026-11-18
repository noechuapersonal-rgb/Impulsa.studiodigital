"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function PasswordForm({ email }: { email: string }) {
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 6) return setError("La contraseña tiene que tener al menos 6 caracteres.");
    if (password !== repeat) return setError("Las dos contraseñas no coinciden.");
    setBusy(true);
    const { error } = await supabaseBrowser().auth.updateUser({ password });
    setBusy(false);
    if (error)
      return setError(
        /different|same/i.test(error.message)
          ? "Esa ya es tu contraseña actual. Elegí otra."
          : /reauth|recent/i.test(error.message)
            ? "Por seguridad, cerrá sesión, entrá con el enlace por mail y volvé a intentar."
            : `No se pudo guardar. (Detalle: ${error.message})`,
      );
    setOk(true);
  };

  if (ok)
    return (
      <div className="space-y-4 text-center">
        <div className="text-4xl">✅</div>
        <h1 className="text-xl font-bold">Contraseña guardada</h1>
        <p className="text-sm text-[var(--muted)]">
          Desde ahora entrás con <b className="text-[var(--text)]">{email}</b> y tu contraseña.
        </p>
        <a href="/proyectos" className="btn btn-primary w-full justify-center !py-2.5">
          Ir a mis proyectos
        </a>
      </div>
    );

  return (
    <form onSubmit={save} className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Tu contraseña</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Elegí una contraseña para entrar con <span className="text-[var(--text)]">{email}</span> sin esperar mails.
        </p>
      </div>
      <label className="block space-y-1">
        <span className="label block">Nueva contraseña</span>
        <input
          id="new-password"
          className="input !py-2.5 !text-base"
          type={show ? "text" : "password"}
          autoComplete="new-password"
          required
          minLength={6}
          placeholder="Mínimo 6 caracteres"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      <label className="block space-y-1">
        <span className="label block">Repetila</span>
        <input
          id="repeat-password"
          className="input !py-2.5 !text-base"
          type={show ? "text" : "password"}
          autoComplete="new-password"
          required
          value={repeat}
          onChange={(e) => setRepeat(e.target.value)}
        />
      </label>
      <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
        <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Mostrar contraseña
      </label>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button className="btn btn-primary w-full justify-center !py-2.5" disabled={busy}>
        {busy ? "Guardando…" : "Guardar contraseña"}
      </button>
      <a href="/cuenta" className="block text-center text-sm text-[var(--muted)] hover:text-white">
        Volver a mi cuenta
      </a>
    </form>
  );
}
