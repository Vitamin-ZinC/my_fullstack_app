"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { api } from "@/lib/api";

type AuthMode = "magic" | "password";

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginContent />
    </Suspense>
  );
}

function LoginFallback() {
  return (
    <article className="auth-page stack">
      <section className="auth-card card cyan-border">
        <div className="eyebrow">Личный кабинет</div>
        <h1 className="ub auth-title">Вход в ORKEN.LIFE</h1>
        <p className="muted auth-copy">Готовим форму входа...</p>
      </section>
    </article>
  );
}

function LoginContent() {
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<AuthMode>("magic");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [isRegister, setIsRegister] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (params.get("mode") === "register") {
      setMode("password");
      setIsRegister(true);
    }

    const token = params.get("token");
    if (!token) return;

    setBusy(true);
    setError("");
    setMessage("Проверяем ссылку входа...");
    api.verifyMagicLink(token)
      .then(() => {
        setMessage("Готово. Открываем личный кабинет...");
        router.replace("/account");
      })
      .catch((reason) => {
        setError(reason instanceof Error ? reason.message : "Ссылка входа не сработала");
        setMessage("");
      })
      .finally(() => setBusy(false));
  }, [params, router]);

  async function submitMagicLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await api.requestMagicLink(email);
      setMessage(result.emailSent
        ? "Отправили ссылку для входа. Проверьте почту."
        : "Запрос принят, но email-сервис сейчас не отправил письмо.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось отправить ссылку");
    } finally {
      setBusy(false);
    }
  }

  async function submitPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (isRegister) {
        await api.register(email, password, name);
      } else {
        await api.login(email, password);
      }
      router.push("/account");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось войти");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="auth-page stack">
      <section className="auth-card card cyan-border">
        <div className="eyebrow">Личный кабинет</div>
        <h1 className="ub auth-title">Вход в ORKEN.LIFE</h1>
        <p className="muted auth-copy">Сохраняйте отчёты диагностики, возвращайтесь к прошлым результатам и продолжайте работу с навигатором привычек.</p>

        <div className="auth-tabs" role="tablist" aria-label="Способ входа">
          <button className={mode === "magic" ? "active" : ""} type="button" onClick={() => setMode("magic")}>Ссылка</button>
          <button className={mode === "password" ? "active" : ""} type="button" onClick={() => setMode("password")}>Пароль</button>
        </div>

        {mode === "magic" ? (
          <form className="auth-form" onSubmit={submitMagicLink}>
            <label>
              <span>Email</span>
              <input className="input" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@email.com" required />
            </label>
            <button className="button" data-testid="magic-link-submit" disabled={busy} type="submit">
              {busy ? "Отправляем..." : "Получить ссылку для входа"}
            </button>
            <button className="button secondary" type="button" onClick={() => { setMode("password"); setIsRegister(true); }}>
              Создать аккаунт по паролю
            </button>
          </form>
        ) : (
          <form className="auth-form" onSubmit={submitPassword}>
            {isRegister && (
              <label>
                <span>Имя</span>
                <input className="input" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Как к вам обращаться" />
              </label>
            )}
            <label>
              <span>Email</span>
              <input className="input" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@email.com" required />
            </label>
            <label>
              <span>Пароль</span>
              <input className="input" type="password" autoComplete={isRegister ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} placeholder="минимум 8 символов" required />
            </label>
            <button className="button" data-testid="password-auth-submit" disabled={busy} type="submit">
              {busy ? "Проверяем..." : isRegister ? "Создать аккаунт" : "Войти"}
            </button>
            <button className="auth-switch" type="button" onClick={() => setIsRegister((value) => !value)}>
              {isRegister ? "Уже есть аккаунт? Войти" : "Нет аккаунта? Создать"}
            </button>
          </form>
        )}

        {message && <p className="auth-message" data-testid="auth-message">{message}</p>}
        {error && <p className="auth-error" data-testid="auth-error">{error}</p>}
      </section>

      <Link className="button secondary" href="/account">Открыть личный кабинет</Link>
      <Link className="btn-back" href="/login?mode=register">Создать новый аккаунт</Link>
    </article>
  );
}
