"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api, type FounderIntakeBatchResponse, type FounderIntakeItem } from "@/lib/api";

const passwordKey = "orken_docs_password";

type ChatMessage = {
  role: "founder" | "system";
  text: string;
  batch?: FounderIntakeBatchResponse;
};

export default function FounderChatPage() {
  const [password, setPassword] = useState("");
  const [chatType, setChatType] = useState<"bug" | "task" | "idea">("bug");
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [loadingBoard, setLoadingBoard] = useState(false);
  const [error, setError] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [items, setItems] = useState<FounderIntakeItem[]>([]);

  useEffect(() => {
    const saved = window.sessionStorage.getItem(passwordKey);
    if (saved) {
      setPassword(saved);
      void loadBoard(saved);
    }
  }, []);

  const columns = useMemo(() => ({
    queued: items.filter((item) => item.queueStatus === "QUEUED" || item.codexStatus === "QUEUED"),
    progress: items.filter((item) => ["ACKNOWLEDGED", "ANALYZED", "IN_PROGRESS", "WAITING_CLARIFICATION", "REVIEW_REQUIRED"].includes(item.codexStatus)),
    done: items.filter((item) => ["DONE", "BLOCKED", "IGNORED", "REJECTED", "ANSWERED_BY_BACKEND"].includes(item.codexStatus))
  }), [items]);

  async function loadBoard(nextPassword = password) {
    if (!nextPassword.trim()) return;
    setLoadingBoard(true);
    setError("");
    try {
      const response = await api.listFounderIntake({ password: nextPassword, limit: 100 });
      setItems(response.items);
      window.sessionStorage.setItem(passwordKey, nextPassword);
    } catch (reason) {
      setItems([]);
      setError(reason instanceof Error ? reason.message : "Не удалось загрузить очередь");
    } finally {
      setLoadingBoard(false);
    }
  }

  async function unlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await loadBoard(password);
  }

  async function sendChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = chatInput.trim();
    if (!message || !password.trim()) return;
    setChatBusy(true);
    setError("");
    setMessages((current) => [...current, { role: "founder", text: message }]);
    setChatInput("");
    try {
      const batch = await api.sendFounderChat({ password, message, type: chatType });
      setMessages((current) => [...current, { role: "system", text: batch.message, batch }]);
      await loadBoard(password);
    } catch (reason) {
      setMessages((current) => [...current, {
        role: "system",
        text: reason instanceof Error ? reason.message : "Не удалось отправить сообщение"
      }]);
    } finally {
      setChatBusy(false);
    }
  }

  function lock() {
    window.sessionStorage.removeItem(passwordKey);
    setPassword("");
    setItems([]);
    setMessages([]);
  }

  return (
    <main className="docs-page founder-chat-page">
      <header className="docs-header">
        <Link href="/" className="docs-brand">ORKEN.LIFE</Link>
        <div>
          <h1>Founder chat</h1>
          <p>Миничат для задач, вопросов и багрепортов. Safe intake сохраняет историю, статусы и отправляет sanitized payload в Codex bridge.</p>
        </div>
        <Link className="button secondary" href="/docs">Документация</Link>
      </header>

      <section className="docs-panel">
        <form className="docs-form" onSubmit={unlock}>
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
          <button type="submit" disabled={loadingBoard || !password.trim()}>
            {loadingBoard ? "Загружаем..." : "Открыть чат"}
          </button>
          {items.length > 0 && <button type="button" onClick={lock}>Закрыть доступ</button>}
        </form>
        {error && <p className="docs-error">{error}</p>}
      </section>

      {password && (
        <>
          <section className="docs-chat">
            <div className="docs-chat-head">
              <div>
                <span>Codex bridge intake</span>
                <h2>Сообщение founder-а</h2>
              </div>
              <select value={chatType} onChange={(event) => setChatType(event.target.value as "bug" | "task" | "idea")}>
                <option value="bug">Баг</option>
                <option value="task">Задача</option>
                <option value="idea">Идея</option>
              </select>
            </div>
            <div className="docs-chat-feed" aria-live="polite">
              {messages.length === 0 ? (
                <p className="docs-chat-empty">Напиши обычным языком. Приветствие или вопрос не попадут в работу; неполная задача получит уточняющие вопросы; безопасная конкретная задача попадёт в очередь и в Codex bridge.</p>
              ) : messages.map((message, index) => (
                <div className={`docs-chat-message ${message.role}`} key={`${message.role}-${index}`}>
                  <strong>{message.role === "founder" ? "Founder" : "Intake"}</strong>
                  <p>{message.text}</p>
                  {message.batch && (
                    <div className="docs-chat-audits">
                      {message.batch.audits.map((audit) => (
                        <div className="docs-chat-audit" key={audit.id}>
                          <div className={`docs-decision ${audit.decision.toLowerCase()}`}>
                            {audit.decision}{audit.queueStatus === "QUEUED" ? " · QUEUED" : ""}
                          </div>
                          <span>{audit.title}</span>
                          {audit.answer && <small>Ответ: {audit.answer}</small>}
                          {audit.clarifyingQuestions.length > 0 && <small>Уточнить: {audit.clarifyingQuestions.join(" ")}</small>}
                          {audit.risks.length > 0 && <small>Риски: {audit.risks.join(", ")}</small>}
                          {audit.blockedReasons.length > 0 && <small>Блокеры: {audit.blockedReasons.join(", ")}</small>}
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
                placeholder="Например: на /habits кнопка «Сохранить инсайт» не нажимается. Ожидаю сохранение, сейчас ничего не происходит. Шаги: открыть /habits, ввести текст, нажать кнопку."
                rows={4}
              />
              <button type="submit" disabled={chatBusy || !chatInput.trim()}>
                {chatBusy ? "Отправляем..." : "Отправить"}
              </button>
            </form>
          </section>

          <section className="founder-board">
            <div className="founder-board-head">
              <div>
                <span>Codex bridge inbox</span>
                <h2>Задачи и статусы</h2>
              </div>
              <button type="button" onClick={() => loadBoard(password)} disabled={loadingBoard}>
                {loadingBoard ? "Обновляем..." : "Обновить"}
              </button>
            </div>
            <div className="founder-board-grid">
              <TaskColumn title="В очереди" items={columns.queued} empty="Нет задач в очереди" />
              <TaskColumn title="В процессе" items={columns.progress} empty="Нет задач в работе" />
              <TaskColumn title="Готово" items={columns.done} empty="Нет завершённых записей" />
            </div>
          </section>
        </>
      )}
    </main>
  );
}

function TaskColumn(props: { title: string; items: FounderIntakeItem[]; empty: string }) {
  return (
    <div className="founder-board-column">
      <h3>{props.title}</h3>
      {props.items.length === 0 ? (
        <p className="founder-board-empty">{props.empty}</p>
      ) : props.items.map((item) => (
        <article className="founder-task-card" key={item.id}>
          <div className={`docs-decision ${item.decision.toLowerCase()}`}>{item.decision}</div>
          <strong>{item.title}</strong>
          <p>{item.summary || item.sanitizedBody}</p>
          <small>ID: {item.id}</small>
          <small>Codex: {item.codexStatus}</small>
          <small>Bridge: {item.bridgeStatus}{item.bridgeAttempts ? ` · ${item.bridgeAttempts}` : ""}</small>
          {item.codexReply && <small>Ответ Codex: {item.codexReply}</small>}
          {item.bridgeLastError && <small className="docs-error">Bridge error: {item.bridgeLastError}</small>}
        </article>
      ))}
    </div>
  );
}
