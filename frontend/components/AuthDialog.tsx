"use client";

// Sign in / Create account window. Opened from anywhere with openAuth() (lib/accounts.ts):
// the landing page header, the profile panel ("Sign in", "Create another account", switching).
// AuthHost is mounted next to the profile button, so it exists on the landing page and in the app.

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import {
  AUTH_EVENT, type AuthError, type AuthMode, type AuthRequest, createAccount, digits10, reconcile, signInAccount, useAccounts,
} from "@/lib/accounts";
import { LANGS, type Lang, useT } from "@/lib/i18n";
import { M } from "@/lib/i18n/messages/Auth";
import { M as PM } from "@/lib/i18n/messages/ProfilePanel";
import { getProfile, setAppLanguage, TERRITORIES } from "@/lib/profile";
import Icon from "./Icon";

type Key = keyof typeof M.en;
const noop = () => () => undefined;
const inputCls = "h-12 w-full rounded-xl border border-hairline bg-container-lowest px-3 text-body outline-none focus:border-primary focus:ring-2 focus:ring-primary/30";

/** Listens for openAuth() and shows the window; also shows the short "welcome" message after. */
export default function AuthHost() {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const [req, setReq] = useState<AuthRequest | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    reconcile();
    const onOpen = (e: Event) => setReq((e as CustomEvent<AuthRequest>).detail);
    window.addEventListener(AUTH_EVENT, onOpen);
    return () => window.removeEventListener(AUTH_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(id);
  }, [toast]);

  if (!mounted) return null;
  return createPortal(
    <>
      {req && <AuthDialog key={`${req.mode}-${req.login ?? ""}`} initial={req} onClose={() => setReq(null)} onDone={(msg) => { setReq(null); setToast(msg); }} />}
      {toast && (
        <div role="status" className="anim-toast fixed inset-x-0 top-20 z-[1500] mx-auto flex w-fit max-w-[90vw] items-center gap-2 rounded-xl bg-inverse-surface px-4 py-3 text-small font-semibold text-inverse-on-surface shadow-float">
          <Icon name="check_circle" className="text-[20px]" /> {toast}
        </div>
      )}
    </>,
    document.body,
  );
}

function AuthDialog({ initial, onClose, onDone }: { initial: AuthRequest; onClose: () => void; onDone: (msg: string) => void }) {
  const t = useT(M);
  const [mode, setMode] = useState<AuthMode>(initial.mode);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[1400] flex items-end justify-center sm:items-center sm:p-4">
      <button type="button" aria-label={t("close")} tabIndex={-1} onClick={onClose} className="anim-backdrop absolute inset-0 bg-scrim" />
      <div role="dialog" aria-modal="true" aria-labelledby="auth-title"
        className="anim-dialog relative flex max-h-[94dvh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-container-lowest shadow-float sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-5">
          <div>
            <h2 id="auth-title" className="text-title font-bold">{mode === "signup" ? t("signupTitle") : t("signinTitle")}</h2>
            <p className="text-small text-on-surface-variant">{mode === "signup" ? t("signupSub") : t("signinSub")}</p>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label={t("close")} className="rounded-lg p-1.5 text-on-surface-variant hover:bg-container-low">
            <Icon name="close" />
          </button>
        </div>
        <div role="tablist" aria-label={t("tabSignin")} className="mx-5 grid grid-cols-2 gap-1 rounded-xl bg-container p-1">
          {(["signup", "signin"] as AuthMode[]).map((m) => (
            <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)}
              className={`rounded-lg py-2 text-small ${mode === m ? "bg-container-lowest font-semibold text-primary shadow-sm" : "text-on-surface-variant hover:text-on-surface"}`}>
              {m === "signup" ? t("tabSignup") : t("tabSignin")}
            </button>
          ))}
        </div>
        <div className="overflow-y-auto px-5 pb-5 pt-4">
          <div key={mode} className="anim-fade">
            {mode === "signup"
              ? <SignupForm onDone={onDone} onSwitch={() => setMode("signin")} />
              : <SigninForm initialLogin={initial.login ?? ""} onDone={onDone} onSwitch={() => setMode("signup")} />}
          </div>
          <p className="mt-4 flex items-start gap-1.5 text-caption text-on-surface-variant">
            <Icon name="lock" className="mt-px text-[14px]" /> {t("privacy")}
          </p>
        </div>
      </div>
    </div>
  );
}

function Field({ label, error, id, children }: { label: string; error?: string; id: string; children: React.ReactNode }) {
  return (
    <label className="block" htmlFor={id}>
      <span className="mb-1 block text-small font-semibold">{label}</span>
      {children}
      {error && <span id={`${id}-err`} className="mt-1 block text-caption text-error">{error}</span>}
    </label>
  );
}

function PasswordInput({ id, value, onChange, autoComplete, invalid }: {
  id: string; value: string; onChange: (v: string) => void; autoComplete: string; invalid: boolean;
}) {
  const t = useT(M);
  const [show, setShow] = useState(false);
  return (
    <span className="relative block">
      <input id={id} className={`${inputCls} pr-20`} type={show ? "text" : "password"} value={value} autoComplete={autoComplete}
        placeholder={t("passwordPh")} onChange={(e) => onChange(e.target.value)} aria-invalid={invalid} aria-describedby={invalid ? `${id}-err` : undefined} />
      <button type="button" onClick={() => setShow(!show)} aria-pressed={show}
        className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-1 rounded-lg px-2 py-1.5 text-caption font-semibold text-primary hover:bg-container-low">
        <Icon name={show ? "visibility_off" : "visibility"} className="text-[18px]" /> {show ? t("hide") : t("show")}
      </button>
    </span>
  );
}

function SignupForm({ onDone, onSwitch }: { onDone: (msg: string) => void; onSwitch: () => void }) {
  const t = useT(M);
  const tp = useT(PM);
  const id = useId();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [language, setLanguage] = useState<Lang>(() => getProfile().appLanguage);
  const [territory, setTerritory] = useState(TERRITORIES[0]);
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Partial<Record<"name" | "email" | "phone" | "password" | "form", Key>>>({});
  const [busy, setBusy] = useState(false);

  function pickLanguage(l: Lang) {
    setLanguage(l);
    setAppLanguage(l); // the form switches to the chosen language right away
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs: typeof errors = {};
    if (!name.trim()) errs.name = "errName";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errs.email = "errEmail";
    const d = phone.replace(/\D/g, "");
    if (!(d.length === 10 || (d.length === 12 && d.startsWith("91")))) errs.phone = "errPhone";
    if (password.length < 6) errs.password = "errPassword";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    const res = await createAccount({ name, email, phone: digits10(phone), appLanguage: language, territory, password });
    setBusy(false);
    if (!res.ok) { setErrors({ form: res.error satisfies AuthError }); return; }
    onDone(t("welcomeNew", { name: name.trim().split(/\s+/)[0] }));
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-3">
      <fieldset>
        <legend className="mb-1 text-small font-semibold">{t("language")}</legend>
        <div role="radiogroup" aria-label={t("language")} className="grid grid-cols-3 gap-2">
          {LANGS.map((l) => {
            const on = language === l.value;
            return (
              <button key={l.value} type="button" role="radio" aria-checked={on} lang={l.html} onClick={() => pickLanguage(l.value)}
                className={`flex flex-col items-center rounded-xl px-2 py-2 ${on ? "bg-primary text-on-primary" : "bg-container-low ring-1 ring-hairline hover:bg-container"}`}>
                <span className="text-small font-bold">{l.label}</span>
                <span className={`text-micro ${on ? "opacity-80" : "text-on-surface-variant"}`}>{l.english}</span>
              </button>
            );
          })}
        </div>
      </fieldset>
      <Field id={`${id}-name`} label={t("name")} error={errors.name && t(errors.name)}>
        <input id={`${id}-name`} className={inputCls} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name"
          placeholder={t("namePh")} aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? `${id}-name-err` : undefined} />
      </Field>
      <Field id={`${id}-email`} label={t("email")} error={errors.email && t(errors.email)}>
        <input id={`${id}-email`} className={inputCls} type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)}
          autoComplete="email" placeholder={t("emailPh")} aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? `${id}-email-err` : undefined} />
      </Field>
      <Field id={`${id}-phone`} label={t("phone")} error={errors.phone && t(errors.phone)}>
        <span className="flex gap-2">
          <span className="grid h-12 shrink-0 place-items-center rounded-xl bg-container px-3 text-body font-semibold">+91</span>
          <input id={`${id}-phone`} className={inputCls} type="tel" inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value)}
            autoComplete="tel-national" placeholder={t("phonePh")} aria-invalid={Boolean(errors.phone)} aria-describedby={errors.phone ? `${id}-phone-err` : undefined} />
        </span>
      </Field>
      <Field id={`${id}-area`} label={t("area")}>
        <select id={`${id}-area`} className={inputCls} value={territory} onChange={(e) => setTerritory(e.target.value)}>
          {TERRITORIES.map((x) => <option key={x} value={x}>{tp(`terr.${x}` as keyof typeof PM.en)}</option>)}
        </select>
      </Field>
      <Field id={`${id}-pw`} label={t("password")} error={errors.password && t(errors.password)}>
        <PasswordInput id={`${id}-pw`} value={password} onChange={setPassword} autoComplete="new-password" invalid={Boolean(errors.password)} />
      </Field>
      {errors.form && <p role="alert" className="rounded-xl bg-error-container px-3 py-2 text-small text-on-error-container">{t(errors.form)}</p>}
      <button type="submit" disabled={busy} className="btn-primary w-full !min-h-12">
        <Icon name="person_add" className="text-[20px]" /> {busy ? t("working") : t("create")}
      </button>
      <p className="text-center text-small text-on-surface-variant">
        {t("haveAccount")} <button type="button" onClick={onSwitch} className="font-semibold text-primary hover:underline">{t("signIn")}</button>
      </p>
    </form>
  );
}

function SigninForm({ initialLogin, onDone, onSwitch }: { initialLogin: string; onDone: (msg: string) => void; onSwitch: () => void }) {
  const t = useT(M);
  const id = useId();
  const accounts = useAccounts();
  const [login, setLogin] = useState(initialLogin);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<Key | null>(null);
  const [busy, setBusy] = useState(false);
  const pwRef = useRef<HTMLDivElement>(null);
  const others = accounts.filter((a) => !a.current);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!login.trim()) { setError("errLogin"); return; }
    if (!password) { setError("errPassword"); return; }
    setBusy(true);
    const res = await signInAccount(login, password);
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    onDone(t("welcomeBack", { name: res.name.split(/\s+/)[0] }));
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-3">
      {others.length > 0 && (
        <div>
          <p className="mb-1 text-small font-semibold">{t("onDevice")}</p>
          <div className="flex flex-wrap gap-2">
            {others.map((a) => (
              <button key={a.id} type="button" onClick={() => { setLogin(a.email); setError(null); pwRef.current?.querySelector("input")?.focus(); }}
                className={`flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-small ${login === a.email ? "bg-primary-soft text-primary-ink ring-1 ring-primary" : "bg-container-low hover:bg-container"}`}>
                <span className="grid h-7 w-7 place-items-center rounded-full bg-primary text-micro font-bold text-on-primary">{a.initials}</span>
                <span className="max-w-[10rem] truncate">{a.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <Field id={`${id}-login`} label={t("login")}>
        <input id={`${id}-login`} className={inputCls} value={login} onChange={(e) => { setLogin(e.target.value); setError(null); }}
          autoComplete="username" inputMode="email" placeholder={t("loginPh")} />
      </Field>
      <div ref={pwRef}>
        <Field id={`${id}-pw`} label={t("password")}>
          <PasswordInput id={`${id}-pw`} value={password} onChange={(v) => { setPassword(v); setError(null); }} autoComplete="current-password" invalid={Boolean(error)} />
        </Field>
      </div>
      {error && <p role="alert" className="rounded-xl bg-error-container px-3 py-2 text-small text-on-error-container">{t(error)}</p>}
      <button type="submit" disabled={busy} className="btn-primary w-full !min-h-12">
        <Icon name="login" className="text-[20px]" /> {busy ? t("working") : t("signIn")}
      </button>
      <p className="text-center text-small text-on-surface-variant">
        {t("noAccount")} <button type="button" onClick={onSwitch} className="font-semibold text-primary hover:underline">{t("create")}</button>
      </p>
    </form>
  );
}
