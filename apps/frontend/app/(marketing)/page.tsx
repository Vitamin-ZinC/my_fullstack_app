import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { IkigaiPremiumMap } from "@/components/IkigaiPremiumMap";

export default function LandingPage() {
  return (
    <main className="page">
      <section className="hero">
        <div className="stack">
          <div className="eyebrow">LevelUP.AI</div>
          <h1 className="title">Найди свою точку ИКИГАЙ</h1>
          <p className="subtitle">
            AI-диагностика соединяет голос, лицо и модель Икигай в персональный карьерный отчёт:
            от первой роли до premium-разбора психотипа и дорожной карты развития.
          </p>
          <Link className="button" href="/flow/voice">
            Пройти экспресс-диагностику <ArrowRight size={18} />
          </Link>
        </div>
        <div className="video-frame">
          <video src="/assets/paid-report-animation.mp4" autoPlay muted loop playsInline />
        </div>
      </section>

      <section className="stack">
        <div className="eyebrow">Модель Икигай</div>
        <div className="grid grid-2">
          <div className="card">
            <h2>Динамическая модель профессиональной реализации</h2>
            <p className="muted">
              LevelUP показывает пересечение четырёх факторов: что у Вас получается, что даёт энергию,
              что нужно рынку и что может приносить доход. В точке пересечения появляется рабочее окно
              профессиональной реализации.
            </p>
          </div>
          <IkigaiPremiumMap allActive />
        </div>
      </section>
    </main>
  );
}
