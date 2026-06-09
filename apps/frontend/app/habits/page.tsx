"use client";

import { useMemo, useState } from "react";
import { useSiteText } from "@/lib/useSiteText";

type HabitsScreen = "dashboard" | "journey" | "habits" | "archive" | "navigator" | "settings" | "guide";

export default function HabitsPage() {
  const text = useSiteText().habits;
  const [screen, setScreen] = useState<HabitsScreen>("dashboard");
  const [completed, setCompleted] = useState(false);
  const [insight, setInsight] = useState("");
  const [name, setName] = useState("Гость");

  const nav = text.nav as unknown as Array<[HabitsScreen, string, string]>;
  const screenTitle = useMemo(() => nav.find(([id]) => id === screen)?.[2] ?? text.dashboardTitle, [nav, screen, text.dashboardTitle]);

  return (
    <div className="habits-app">
      <aside className="habits-sidebar">
        <div className="habits-brand">
          <img src="/assets/levelup-logo.jpg" alt="" />
          <div>
            <div className="habits-brand-title">{text.brand}</div>
            <div className="habits-brand-sub">{text.subtitle}</div>
          </div>
        </div>
        <nav className="habits-nav">
          {nav.map(([id, icon, label]) => (
            <button className={screen === id ? "active" : ""} key={id} onClick={() => setScreen(id)}>
              <span>{icon}</span>
              {label}
            </button>
          ))}
        </nav>
      </aside>

      <main className="habits-main">
        <header className="habits-topbar">
          <div>
            <div className="eyebrow">{text.brand}</div>
            <h1>{screenTitle}</h1>
          </div>
          <button className="button secondary habits-cta" onClick={() => setScreen("navigator")}>🤖 AI</button>
        </header>

        {screen === "dashboard" && (
          <section className="habits-panel stack">
            <div>
              <h2>{text.dashboardTitle}</h2>
              <p className="muted">{text.dashboardCopy}</p>
            </div>
            <div className="habits-current">
              <div className="habit-week">Цикл 1 · Неделя 4</div>
              <h3>{text.currentHabit.title}</h3>
              <p>{text.currentHabit.focus}</p>
              <div className="habit-detail"><strong>Суть</strong>{text.currentHabit.essence}</div>
              <div className="habit-detail"><strong>Практика</strong>{text.currentHabit.practice}</div>
              <div className="habit-detail"><strong>Почему это работает</strong>{text.currentHabit.why}</div>
              <div className="habit-book">{text.currentHabit.book}</div>
              <button className={completed ? "button secondary" : "button"} onClick={() => setCompleted((value) => !value)}>
                {completed ? "✓ Привычка отмечена" : "Отметить привычку дня (+10 XP)"}
              </button>
            </div>
            <div className="grid grid-2">
              {text.metrics.map((metric, index) => (
                <div className="habits-metric" key={metric}>
                  <span>{metric}</span>
                  <strong>{72 + index * 5}%</strong>
                </div>
              ))}
            </div>
          </section>
        )}

        {screen === "journey" && (
          <section className="habits-panel stack">
            <div>
              <h2>{text.journeyTitle}</h2>
              <p className="muted">{text.journeyCopy}</p>
            </div>
            <div className="habits-road">
              {["Ресурс", "Роль", "Масштаб", "Смысл"].map((cycle, index) => (
                <div className="habits-cycle" key={cycle}>
                  <span>0{index + 1}</span>
                  <h3>{cycle}</h3>
                  <p>{index < 1 ? "Активный цикл" : "Откроется позже"}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {screen === "habits" && (
          <section className="habits-panel stack">
            <div>
              <h2>{text.habitsTitle}</h2>
              <p className="muted">{text.habitsCopy}</p>
            </div>
            <div className="grid grid-2">
              {text.habitCards.map(([week, title, copy]) => (
                <div className="habits-card" key={week}>
                  <div className="eyebrow">{week}</div>
                  <h3>{title}</h3>
                  <p>{copy}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {screen === "archive" && (
          <section className="habits-panel stack">
            <div>
              <h2>{text.archiveTitle}</h2>
              <p className="muted">{text.archiveCopy}</p>
            </div>
            <textarea className="input text-editor compact" value={insight} onChange={(event) => setInsight(event.target.value)} placeholder="Инсайт недели" />
            <div className="habits-card">
              <div className="eyebrow">Последний инсайт</div>
              <p>{insight || "Пока нет записей"}</p>
            </div>
          </section>
        )}

        {screen === "navigator" && (
          <section className="habits-panel stack">
            <div>
              <h2>{text.navigatorTitle}</h2>
              <p className="muted">{text.navigatorCopy}</p>
            </div>
            <div className="habits-chat">
              <div className="habits-bubble ai">Привет, {name}! О чём хочешь поговорить?</div>
              <div className="grid grid-2">
                {text.navigatorPrompts.map((prompt) => <button className="button secondary" key={prompt}>{prompt}</button>)}
              </div>
            </div>
          </section>
        )}

        {screen === "settings" && (
          <section className="habits-panel stack">
            <div>
              <h2>{text.settingsTitle}</h2>
              <p className="muted">Персонализируй свой путь</p>
            </div>
            <div className="habits-tabs">
              {text.settingsTabs.map((tab) => <button className="button secondary" key={tab}>{tab}</button>)}
            </div>
            <label className="habits-card">
              <div className="eyebrow">Имя</div>
              <input className="input" value={name} onChange={(event) => setName(event.target.value)} />
            </label>
          </section>
        )}

        {screen === "guide" && (
          <section className="habits-panel stack">
            <div>
              <h2>{text.guideTitle}</h2>
              <p className="muted">{text.subtitle}</p>
            </div>
            {text.guideBlocks.map((block, index) => (
              <div className="habits-card" key={block}>
                <div className="eyebrow">0{index + 1}</div>
                <p>{block}</p>
              </div>
            ))}
          </section>
        )}
      </main>
    </div>
  );
}
