"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

type Mode = "login" | "signup" | "forgot" | "link" | "code";

const GOOGLE = process.env.NEXT_PUBLIC_GOOGLE_LOGIN === "1";

export default function LoginForm({ next, linkError }: { next: string; linkError?: boolean }) {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState("");
  const [error, setError] = useState(
    linkError ? "Ese enlace ya venció o se abrió en otro navegador. Entrá con tu mail y contraseña, o pedí un enlace nuevo." : "",
  );

  const callback = (to = next) => `${window.location.origin}/auth/callback?next=${encodeURIComponent(to)}`;
  const go = (m: Mode) => {
    setMode(m);
    setError("");
    setInfo("");
  };
  const done = () => {
    window.location.href = next;
  };

  const google = async () => {
    setBusy(true);
    setError("");
    const { error } = await supabaseBrowser().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callback() },
    });
    if (error) {
      setBusy(false);
      setError(`No se pudo entrar con Google. (Detalle: ${error.message})`);
    }
  };

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await supabaseBrowser().auth.signInWithPassword({ email: email.trim(), password });
    if (!error) return done();
    setBusy(false);
    if (/confirm/i.test(error.message))
      setError("Todavía no confirmaste tu mail. Abrí el mail que te mandamos al crear la cuenta (mirá en spam).");
    else
      setError(
        "Mail o contraseña incorrectos. Si antes entrabas con el enlace por mail, todavía no tenés contraseña: tocá «¿Olvidaste tu contraseña?» para crear una.",
      );
  };

  const signup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) return setError("La contraseña tiene que tener al menos 6 caracteres.");
    setBusy(true);
    setError("");
    const { data, error } = await supabaseBrowser().auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: callback() },
    });
    if (error) {
      setBusy(false);
      setError(
        /registered|exists/i.test(error.message)
          ? "Ese mail ya tiene cuenta. Ingresá, o tocá «¿Olvidaste tu contraseña?»."
          : /password/i.test(error.message)
            ? `Elegí una contraseña más segura. (Detalle: ${error.message})`
            : `No se pudo crear la cuenta. (Detalle: ${error.message})`,
      );
      return;
    }
    if (data.session) return done();
    setBusy(false);
    // the account already existed (Supabase hides it for privacy) or the mail must be confirmed first
    if (data.user && data.user.identities?.length === 0)
      setError("Ese mail ya tiene cuenta. Ingresá, o tocá «¿Olvidaste tu contraseña?».");
    else setInfo(`Listo. Te mandamos un mail a ${email.trim()} para confirmar tu cuenta: abrilo y vas a entrar directo.`);
  };

  const forgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await supabaseBrowser().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: callback("/cuenta/clave"),
    });
    setBusy(false);
    if (error)
      return setError(
        error.status === 429
          ? "Se pidieron demasiados mails. Esperá unos minutos y volvé a intentar."
          : `No pudimos enviar el mail. (Detalle: ${error.message})`,
      );
    setInfo(`Te mandamos un mail a ${email.trim()}. Abrilo en este navegador y elegí tu nueva contraseña.`);
  };

  const sendLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await supabaseBrowser().auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true, emailRedirectTo: callback() },
    });
    setBusy(false);
    if (error) {
      setError(
        error.status === 429
          ? "Se pidieron demasiados mails. Esperá unos minutos y volvé a intentar."
          : `No pudimos enviar el mail. Revisá que esté bien escrito. (Detalle: ${error.message || error.status || "desconocido"})`,
      );
      return;
    }
    go("code");
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await supabaseBrowser().auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email" });
    if (error) {
      setBusy(false);
      setError("El código no es correcto o ya venció. Pedí uno nuevo.");
      return;
    }
    done();
  };

  const emailField = (
    <label className="block space-y-1">
      <span className="label block">Tu mail</span>
      <input
        id="email"
        className="input !py-2.5 !text-base"
        type="email"
        required
        autoComplete="email"
        placeholder="nombre@ejemplo.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
    </label>
  );

  const passwordField = (
    <label className="block space-y-1">
      <span className="label block">Contraseña</span>
      <div className="relative">
        <input
          id="password"
          className="input !py-2.5 !pr-16 !text-base"
          type={show ? "text" : "password"}
          required
          minLength={6}
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          placeholder={mode === "signup" ? "Mínimo 6 caracteres" : ""}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button
          type="button"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[var(--muted)] hover:text-white"
          onClick={() => setShow((v) => !v)}
        >
          {show ? "Ocultar" : "Ver"}
        </button>
      </div>
    </label>
  );

  const messages = (
    <>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {info && <p className="text-sm text-emerald-300">{info}</p>}
    </>
  );

  const link = (label: string, m: Mode) => (
    <button type="button" className="text-sm text-[var(--muted)] underline-offset-2 hover:text-white hover:underline" onClick={() => go(m)}>
      {label}
    </button>
  );

  if (mode === "code")
    return (
      <form onSubmit={verify} className="space-y-4">
        <div>
          <h1 className="text-xl font-bold">Revisá tu mail</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Mandamos un mail a <span className="text-[var(--text)]">{email}</span>. Tocá el enlace desde este mismo
            navegador, o escribí acá el código si te llegó uno. Si no llega, mirá en spam.
          </p>
        </div>
        <label className="block space-y-1">
          <span className="label block">Código (si te llegó uno)</span>
          <input
            id="code"
            className="input !py-2.5 text-center font-mono !text-2xl tracking-[0.4em]"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={10}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          />
        </label>
        {messages}
        <button className="btn btn-primary w-full justify-center !py-2.5" disabled={busy || code.length < 6}>
          {busy ? "Verificando…" : "Entrar"}
        </button>
        <div className="flex flex-col items-center gap-2">
          {link("Pedir un enlace nuevo", "link")}
          {link("Entrar con mail y contraseña", "login")}
        </div>
      </form>
    );

  if (mode === "forgot" || mode === "link")
    return (
      <form onSubmit={mode === "forgot" ? forgot : sendLink} className="space-y-4">
        <div>
          <h1 className="text-xl font-bold">{mode === "forgot" ? "Crear o recuperar contraseña" : "Entrar con un enlace"}</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {mode === "forgot"
              ? "Te mandamos un mail para elegir tu contraseña. Sirve también si siempre entraste con el enlace por mail."
              : "Te mandamos un mail con un enlace para entrar, sin contraseña."}
          </p>
        </div>
        {emailField}
        {messages}
        {!info && (
          <button className="btn btn-primary w-full justify-center !py-2.5" disabled={busy}>
            {busy ? "Enviando…" : mode === "forgot" ? "Mandarme el mail" : "Mandarme el enlace"}
          </button>
        )}
        <div className="text-center">{link("Volver", "login")}</div>
      </form>
    );

  const signingUp = mode === "signup";
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-[var(--panel-2)] p-1">
        {(
          [
            ["login", "Ingresar"],
            ["signup", "Crear cuenta"],
          ] as const
        ).map(([m, l]) => (
          <button
            key={m}
            type="button"
            onClick={() => go(m)}
            className={`rounded-lg py-2 text-sm font-bold ${mode === m ? "bg-[var(--panel)] text-white shadow" : "text-[var(--muted)]"}`}
          >
            {l}
          </button>
        ))}
      </div>
      {signingUp && (
        <p className="text-sm text-[var(--muted)]">Creá tu cuenta y probá gratis. Sin tarjeta.</p>
      )}

      {GOOGLE && (
        <>
          <button
            type="button"
            onClick={google}
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-white py-2.5 text-sm font-bold text-[#1f1f1f] hover:bg-white/90"
          >
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
              <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
              <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
            </svg>
            {signingUp ? "Crear cuenta con Google" : "Entrar con Google"}
          </button>
          <div className="flex items-center gap-3 text-xs text-[var(--muted)]">
            <span className="h-px flex-1 bg-[var(--line)]" />o con tu mail<span className="h-px flex-1 bg-[var(--line)]" />
          </div>
        </>
      )}

      <form onSubmit={signingUp ? signup : login} className="space-y-4">
        {emailField}
        {passwordField}
        {messages}
        {!info && (
          <button className="btn btn-primary w-full justify-center !py-2.5" disabled={busy}>
            {busy ? "Un momento…" : signingUp ? "Crear cuenta" : "Ingresar"}
          </button>
        )}
      </form>
      <div className="flex flex-col items-center gap-2">
        {!signingUp && link("¿Olvidaste tu contraseña?", "forgot")}
        {link("Entrar con un enlace por mail (sin contraseña)", "link")}
      </div>
    </div>
  );
}
