"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { uiText } from "@/lib/locale";

export function AccountRecovery({ mode, token = "", onBack }: { mode: "forgot" | "reset" | "verify"; token?: string; onBack: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError("");
    if (mode === "reset" && password !== confirm) { setError(uiText("Пароли не совпадают")); return; }
    setBusy(true);
    try {
      if (mode === "forgot") await api.requestPasswordReset(email);
      if (mode === "reset") await api.confirmPasswordReset(token, password);
      if (mode === "verify") await api.confirmEmailVerification(token);
      setDone(true); setPassword(""); setConfirm("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : uiText("Не удалось выполнить запрос")); }
    finally { setBusy(false); }
  }
  return <section className="auth-form" data-testid="account-recovery">
    <h2>{uiText(mode === "verify" ? "Подтверждение почты" : "Восстановление пароля")}</h2>
    {done ? <p role="status">{uiText(mode === "forgot" ? "Если этот адрес зарегистрирован, вы получите одноразовую ссылку для восстановления. Проверьте почту и папку Спам." : mode === "reset" ? "Пароль изменён. Войдите с новым паролем." : "Почта подтверждена. Добро пожаловать в ORKEN.LIFE!")}</p> : <form className="auth-form" onSubmit={submit}>
      {mode === "forgot" && <label>Email<input className="input" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /></label>}
      {mode === "reset" && <>
        <label>{uiText("Новый пароль")}<input className="input" type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={password} onChange={e => setPassword(e.target.value)} /></label>
        <label>{uiText("Повторите новый пароль")}<input className="input" type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={confirm} onChange={e => setConfirm(e.target.value)} /></label>
      </>}
      <button className="button" type="submit" disabled={busy}>{uiText(busy ? "Проверяем..." : mode === "forgot" ? "Отправить ссылку восстановления" : mode === "reset" ? "Сохранить новый пароль" : "Подтвердить почту")}</button>
    </form>}
    {error && <p role="alert" className="auth-error">{error}</p>}
    <button className="auth-switch" type="button" disabled={busy} onClick={onBack}>{uiText("Вернуться ко входу")}</button>
  </section>;
}

export function EmailVerificationNotice({ verifiedAt }: { verifiedAt?: string | null }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  if (verifiedAt) return null;
  return <section className="email-verification-notice" aria-label={uiText("Подтверждение почты")}>
    <p>{uiText("Подтвердите почту, чтобы получать письма от ORKEN. Доступ в кабинет уже открыт.")}</p>
    <button className="button secondary" type="button" disabled={busy} onClick={async () => {
      setBusy(true); setMessage("");
      try { await api.requestEmailVerification(); setMessage(uiText("Запрос принят. Проверьте почту и папку Спам. Повторный запрос доступен через минуту.")); }
      catch (error) { setMessage(error instanceof Error ? error.message : uiText("Не удалось выполнить запрос")); }
      finally { setBusy(false); }
    }}>{uiText("Отправить подтверждение почты")}</button>
    {message && <p role="status">{message}</p>}
  </section>;
}
