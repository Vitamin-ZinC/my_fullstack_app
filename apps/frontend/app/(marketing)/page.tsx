import Link from "next/link";
import { IkigaiPremiumMap } from "@/components/IkigaiPremiumMap";

const problemItems = [
  "Ты вроде бы справляешься, но постоянно устаёшь",
  "Достигать целей, но терять ощущение смысла",
  "Решения даются тяжело, даже когда всё «логично»",
  "Хочется ясности, но не очередного теста"
];

const faceSignals = ["Напряжение", "Внимание", "Когн. нагрузка", "Баланс энергии"];
const voiceSignals = ["Энергия", "Эмоц. нагрузка", "Стиль мышления", "Тип усилия"];

const steps = [
  ["1", "Сканирование лица", "Смотри в экран 10–15 сек или загрузи фото"],
  ["2", "Голосовая фраза", "Произнеси текст до 20 секунд"],
  ["3", "AI-анализ", "Алгоритм формирует персональный отчёт"]
];

const freeReportItems = [
  "Твоя текущая профессиональная роль",
  "Направления, соответствующие твоей энергии",
  "Первичные сигналы твоей точки ИКИГАЙ",
  "Намёк на более подходящие профессии"
];

const privacyItems = [
  "Фото и аудио не сохраняются",
  "Данные не используются для обучения",
  "Никаких оценок внешности",
  "Никаких диагнозов — только паттерны"
];

export default function LandingPage() {
  return (
    <>
      <div className="glow-tl" />
      <div className="glow-br" />
      <div id="app">
        <AppNav />
        <main className="screen">
          <div className="landing-flow">
            <section className="landing-hero">
              <div className="hero-video-wrap float">
                <img src="/assets/levelup-logo.jpg" alt="LevelUP.AI" />
              </div>
              <div className="ub very-muted landing-kicker">LEVELUP.AI</div>
              <h1 className="ub landing-title">
                Найди свою точку
                <br />
                <span className="cyan cyan-glow">ИКИГАЙ</span>
              </h1>
              <p className="muted landing-sub">за 3 минуты с помощью AI</p>
              <p className="very-muted landing-lead">
                Экспресс-диагностика по лицу и голосу помогает увидеть,
                <br />
                как ты на самом деле распределяешь энергию и фокус.
              </p>
              <Link className="btn-primary" href="/flow/voice">👉 Пройти экспресс-диагностику</Link>
              <p className="very-muted landing-note">Займёт 3–5 минут · Без тестов · Бесплатный отчёт</p>
            </section>

            <div className="divider landing-divider" />

            <section className="landing-section">
              <div className="card card-lg">
                <h2 className="ub landing-card-title">
                  🤔 Почему так сложно понять, <span className="cyan">что с тобой происходит</span>?
                </h2>
                {problemItems.map((item) => (
                  <div className="landing-list-row" key={item}>
                    <span className="cyan">—</span>
                    <span>{item}</span>
                  </div>
                ))}
                <div className="divider" />
                <p className="landing-small-copy">
                  Большинство тестов задают <strong>150 вопросов</strong> и анализируют прошлый опыт.
                  <br />
                  <br />
                  Но твои реальные состояния проявляются <strong className="cyan">раньше мыслей</strong> — в лице, голосе, микрореакциях.
                </p>
              </div>
            </section>

            <section className="landing-section compact">
              <h2 className="ub landing-section-title">🔬 Что анализирует LevelUP.AI</h2>
              <div className="landing-two-col">
                <SignalCard tone="cyan" title="Лицо" icon="📷" items={faceSignals} />
                <SignalCard tone="violet" title="Голос" icon="🎤" items={voiceSignals} />
              </div>
            </section>

            <section className="landing-section compact">
              <h2 className="ub landing-section-title">🧩 Как это работает</h2>
              {steps.map(([number, title, description]) => (
                <div className="card landing-step" key={number}>
                  <span className="landing-step-number">{number}</span>
                  <div>
                    <div className="ub landing-step-title">{title}</div>
                    <div className="landing-step-copy">{description}</div>
                  </div>
                </div>
              ))}
            </section>

            <section className="landing-section compact">
              <div className="card cyan-border card-lg">
                <h2 className="ub cyan landing-card-title">📄 В бесплатном отчёте</h2>
                {freeReportItems.map((item) => (
                  <div className="landing-bullet" key={item}>
                    <span className="cyan">✦</span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="landing-section compact">
              <div className="card cyan-border card-lg ikigai-landing-card">
                <h2 className="ub cyan landing-card-title">🧩 МОДЕЛЬ ИКИГАЙ</h2>
                <IkigaiPremiumMap allActive landingMode />
                <p className="landing-model-copy">
                  LevelUP использует динамическую модель ИКИГАЙ. Она показывает пересечение четырех факторов:
                </p>
                <div className="ikigai-factor-list">
                  <div>что у тебя получается</div>
                  <div>что дает тебе энергию</div>
                  <div>что нужно рынку</div>
                  <div>что может приносить доход</div>
                </div>
                <div className="highlight-box">
                  В точке пересечения возникает окно профессиональной реализации: зона, где способности, энергия, польза и деньги перестают конфликтовать.
                </div>
              </div>
            </section>

            <section className="landing-section compact">
              <div className="card green-border">
                <h2 className="ub landing-privacy-title">🛡️ Данные в безопасности</h2>
                {privacyItems.map((item) => (
                  <div className="landing-safe-row" key={item}>
                    <span>✓</span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="landing-section final">
              <h2 className="ub landing-final-title">🚀 Хочешь увидеть свою реальную картину?</h2>
              <p className="landing-final-copy">
                Иногда несколько минут ясности экономят годы движения не в ту сторону.
              </p>
              <Link className="btn-primary" href="/flow/voice">👉 Пройти экспресс-диагностику</Link>
              <p className="very-muted landing-note center">3 минуты · Бесплатный отчёт · Без регистрации</p>
            </section>
          </div>
        </main>
      </div>
    </>
  );
}

function AppNav() {
  return (
    <nav className="app-nav">
      <div className="logo-wrap">
        <div className="logo-mark" aria-hidden="true">
          <img src="/assets/levelup-logo.jpg" alt="" />
        </div>
        <div className="logo-text">
          <div className="brand">ИКИГАЙ</div>
          <div className="sub">от LevelUP.AI</div>
        </div>
      </div>
    </nav>
  );
}

function SignalCard({ icon, items, title, tone }: { icon: string; items: string[]; title: string; tone: "cyan" | "violet" }) {
  return (
    <div className={`card ${tone === "cyan" ? "cyan-border" : "violet-border"}`}>
      <div className="signal-icon">{icon}</div>
      <div className={`ub ${tone} signal-title`}>{title}</div>
      {items.map((item) => (
        <div className="signal-item" key={item}>· {item}</div>
      ))}
    </div>
  );
}
