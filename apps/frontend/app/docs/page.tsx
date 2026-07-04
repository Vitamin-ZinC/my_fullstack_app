"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api, type FounderIntakeBatchResponse, type FounderIntakeResponse, type HandoffDoc } from "@/lib/api";

const passwordKey = "orken_docs_password";

export default function DocsPage() {
  const [password, setPassword] = useState("");
  const [docs, setDocs] = useState<HandoffDoc[]>([]);
  const [updatedAt, setUpdatedAt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [chatType, setChatType] = useState<"bug" | "task" | "idea">("bug");
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [chatMessages, setChatMessages] = useState<Array<{ role: "founder" | "system"; text: string; batch?: FounderIntakeBatchResponse }>>([]);

  useEffect(() => {
    const saved = window.sessionStorage.getItem(passwordKey);
    if (saved) {
      setPassword(saved);
      void loadDocs(saved);
    }
  }, []);

  const combined = useMemo(() => docs.map((doc) => `# ${doc.title}\n\n${doc.content}`).join("\n\n---\n\n"), [docs]);

  async function loadDocs(nextPassword = password) {
    setLoading(true);
    setError("");
    setCopied(false);
    try {
      const response = await api.handoffDocs(nextPassword);
      setDocs(response.docs);
      setUpdatedAt(response.updatedAt);
      window.sessionStorage.setItem(passwordKey, nextPassword);
    } catch (reason) {
      setDocs([]);
      window.sessionStorage.removeItem(passwordKey);
      setError(reason instanceof Error ? reason.message : "Не удалось открыть документацию");
    } finally {
      setLoading(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await loadDocs(password);
  }

  async function copyAll() {
    if (!combined) return;
    await navigator.clipboard.writeText(combined);
    setCopied(true);
  }

  function lock() {
    window.sessionStorage.removeItem(passwordKey);
    setDocs([]);
    setPassword("");
    setUpdatedAt("");
  }

  async function sendChat(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const message = chatInput.trim();
    if (!message || !password.trim()) return;
    setChatBusy(true);
    setError("");
    setChatMessages((items) => [...items, { role: "founder", text: message }]);
    setChatInput("");
    try {
      const batch = await api.sendFounderChat({ password, message, type: chatType });
      setChatMessages((items) => [...items, {
        role: "system",
        text: batch.message,
        batch
      }]);
      await loadDocs(password);
    } catch (reason) {
      setChatMessages((items) => [...items, {
        role: "system",
        text: reason instanceof Error ? reason.message : "Не удалось сохранить сообщение"
      }]);
    } finally {
      setChatBusy(false);
    }
  }

  return (
    <main className="docs-page">
      <header className="docs-header">
        <Link href="/" className="docs-brand">ORKEN.LIFE</Link>
        <div>
          <h1>Техническая документация</h1>
          <p>Постоянная защищенная ссылка для передачи Codex/разработчику.</p>
        </div>
      </header>

      <section className="docs-panel">
        <form className="docs-form" onSubmit={submit}>
          <label>
            <span>Пароль</span>
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Введите пароль документации"
              type="password"
              autoComplete="current-password"
            />
          </label>
          <button type="submit" disabled={loading || !password.trim()}>
            {loading ? "Открываем..." : "Открыть документацию"}
          </button>
        </form>
        {error && <p className="docs-error">{error}</p>}
      </section>

      {docs.length > 0 && (
        <>
          <section className="docs-toolbar">
            <div>
              <strong>Доступ открыт</strong>
              <span>Обновлено: {updatedAt ? new Date(updatedAt).toLocaleString("ru-RU") : "сейчас"}</span>
            </div>
            <button type="button" onClick={() => loadDocs(password)} disabled={loading}>Обновить</button>
            <button type="button" onClick={copyAll}>{copied ? "Скопировано" : "Скопировать все"}</button>
            <button type="button" onClick={lock}>Закрыть доступ</button>
          </section>

          <section className="docs-chat" id="founder-chat">
            <div className="docs-chat-head">
              <div>
                <span>Founder intake</span>
                <h2>Миничат задач и багрепортов</h2>
              </div>
              <select value={chatType} onChange={(event) => setChatType(event.target.value as "bug" | "task" | "idea")}>
                <option value="bug">Баг</option>
                <option value="task">Задача</option>
                <option value="idea">Идея</option>
              </select>
            </div>
            <div className="docs-chat-feed" aria-live="polite">
              {chatMessages.length === 0 ? (
                <p className="docs-chat-empty">Напиши проблему обычным языком. Система сохранит запись, замаскирует секреты и отметит, можно ли брать в работу сразу.</p>
              ) : chatMessages.map((message, index) => (
                <div className={`docs-chat-message ${message.role}`} key={`${message.role}-${index}`}>
                  <strong>{message.role === "founder" ? "Founder" : "Safety intake"}</strong>
                  <p>{message.text}</p>
                  {message.batch && (
                    <div className="docs-chat-audits">
                      {message.batch.audits.map((audit) => (
                        <div className="docs-chat-audit" key={audit.id}>
                          <div className={`docs-decision ${audit.decision.toLowerCase()}`}>
                            {audit.decision}{audit.queueStatus === "QUEUED" ? " · QUEUED" : ""}
                          </div>
                          <span>{audit.title}</span>
                          {audit.risks.length > 0 && <small>Риски: {audit.risks.join(", ")}</small>}
                          {audit.blockedReasons.length > 0 && <small>Блокеры: {audit.blockedReasons.join(", ")}</small>}
                          {audit.howToMakeWorkable.length > 0 && <small>Как сделать рабочим: {audit.howToMakeWorkable.join(" ")}</small>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <form className="docs-chat-form" onSubmit={sendChat}>
              <textarea
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                placeholder="Например: на мобильном в привычках кнопка не нажимается, шаги: открыть /habits..."
                rows={4}
              />
              <button type="submit" disabled={chatBusy || !chatInput.trim()}>
                {chatBusy ? "Сохраняем..." : "Отправить"}
              </button>
            </form>
          </section>

          <section className="docs-list">
            {docs.map((doc) => (
              <article className="docs-document" key={doc.file}>
                <div className="docs-document-title">
                  <span>{doc.file}</span>
                  <h2>{doc.title}</h2>
                </div>
                <pre>{doc.content}</pre>
              </article>
            ))}
          </section>
        </>
      )}
    </main>
  );
}

function buildAuditReply(audit: FounderIntakeResponse) {
  const decision = audit.decision === "TAKE_NOW"
    ? "Можно брать в работу сразу"
    : audit.decision === "REVIEW_REQUIRED"
      ? "Нужен ручной review перед работой"
      : "Заблокировано по safety";
  const risks = audit.risks.length ? ` Риски: ${audit.risks.join(", ")}.` : "";
  const blocked = audit.blockedReasons.length ? ` Блокеры: ${audit.blockedReasons.join(", ")}.` : "";
  return `${decision}. Запись сохранена: ${audit.id}.${risks}${blocked}`;
}
