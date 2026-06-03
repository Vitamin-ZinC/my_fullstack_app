import { IkigaiPremiumMap } from "@/components/IkigaiPremiumMap";

export default function FullReportPage() {
  return (
    <article className="stack">
      <section>
        <div className="eyebrow">Premium report</div>
        <h1>Полный аналитический отчёт Икигай</h1>
        <nav className="toc">
          <a href="#map">Карта</a>
          <a href="#voice">Голос</a>
          <a href="#face">Лицо</a>
          <a href="#roles">Роли</a>
          <a href="#plan">План</a>
        </nav>
      </section>
      <section id="map"><IkigaiPremiumMap /></section>
      <section id="voice" className="card"><h2>Анализ голоса</h2><p className="muted">Тембр, эмоциональность, уверенность, скорость речи, энергия, харизма и мотивация подтягиваются из `reportFull.voice_analysis`.</p></section>
      <section id="face" className="card"><h2>Анализ лица</h2><p className="muted">Лидерство, уверенность, тип мышления, социальность, эмпатия и дисциплина подтягиваются из `reportFull.face_analysis`.</p></section>
      <section id="roles" className="card"><h2>Top-5 профессий</h2><p className="muted">Каждая роль связывается с evidence из голоса и лица.</p></section>
      <section id="plan" className="card"><h2>Дорожная карта</h2><p className="muted">План развития строится worker-ом и сохраняется в PostgreSQL.</p></section>
    </article>
  );
}
