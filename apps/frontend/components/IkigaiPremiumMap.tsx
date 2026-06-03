"use client";

import { useState } from "react";

const zones = {
  passion: {
    title: "Страсть",
    insight: "Зона показывает, где интерес совпадает с тем, что у Вас уже получается.",
    recommendation: "Навыки: сторителлинг, исследование, методология."
  },
  mission: {
    title: "Миссия",
    insight: "Зона связывает личную энергию с задачами, которые нужны людям и рынку.",
    recommendation: "Роли: консультант, фасилитатор, образовательный продукт."
  },
  vocation: {
    title: "Призвание",
    insight: "Зона отвечает за пользу, которую можно превратить в устойчивую карьерную траекторию.",
    recommendation: "Роли: продуктовый стратег, карьерный аналитик, CX/UX эксперт."
  },
  profession: {
    title: "Профессия",
    insight: "Зона соединяет сильные навыки и платежеспособный спрос. Это главный мост к монетизации.",
    recommendation: "Роли: продуктовый стратег, AI-консультант, методолог."
  },
  ikigai: {
    title: "Икигай",
    insight: "Центральная точка, где энергия, компетенции, польза рынку и доход соединяются в рабочую стратегию.",
    recommendation: "Соберите 7-дневную проверку оффера и покажите ее реальным клиентам."
  }
} as const;

type ZoneId = keyof typeof zones;

export function IkigaiPremiumMap({ allActive = false }: { allActive?: boolean }) {
  const [active, setActive] = useState<ZoneId>("ikigai");
  const activeZone = zones[active];

  return (
    <div className="card stack">
      <svg viewBox="0 0 620 560" role="img" aria-label="Ikigai Premium Map" style={{ width: "100%", filter: "drop-shadow(0 0 18px rgba(0, 212, 255, .28))" }}>
        <defs>
          <radialGradient id="cyanGlow"><stop offset="0%" stopColor="#00D4FF" stopOpacity=".48" /><stop offset="100%" stopColor="#00D4FF" stopOpacity=".12" /></radialGradient>
          <radialGradient id="violetGlow"><stop offset="0%" stopColor="#9B5DE5" stopOpacity=".48" /><stop offset="100%" stopColor="#9B5DE5" stopOpacity=".12" /></radialGradient>
          <radialGradient id="goldGlow"><stop offset="0%" stopColor="#FFD166" stopOpacity=".78" /><stop offset="100%" stopColor="#FFD166" stopOpacity=".2" /></radialGradient>
        </defs>
        <g opacity={allActive || active === "passion" ? 1 : .4} filter={active === "passion" || allActive ? "none" : "blur(2px)"} onClick={() => setActive("passion")} style={{ cursor: "pointer" }}>
          <circle cx="245" cy="230" r="145" fill="url(#cyanGlow)" stroke="#00D4FF" strokeWidth="3" />
          <text x="170" y="225" fill="white" fontWeight="800">СТРАСТЬ</text>
        </g>
        <g opacity={allActive || active === "mission" ? 1 : .4} filter={active === "mission" || allActive ? "none" : "blur(2px)"} onClick={() => setActive("mission")} style={{ cursor: "pointer" }}>
          <circle cx="375" cy="230" r="145" fill="url(#violetGlow)" stroke="#9B5DE5" strokeWidth="3" />
          <text x="374" y="225" fill="white" fontWeight="800">МИССИЯ</text>
        </g>
        <g opacity={allActive || active === "profession" ? 1 : .4} filter={active === "profession" || allActive ? "none" : "blur(2px)"} onClick={() => setActive("profession")} style={{ cursor: "pointer" }}>
          <circle cx="245" cy="350" r="145" fill="url(#cyanGlow)" stroke="#00D4FF" strokeWidth="3" />
          <text x="155" y="390" fill="white" fontWeight="800">ПРОФЕССИЯ</text>
        </g>
        <g opacity={allActive || active === "vocation" ? 1 : .4} filter={active === "vocation" || allActive ? "none" : "blur(2px)"} onClick={() => setActive("vocation")} style={{ cursor: "pointer" }}>
          <circle cx="375" cy="350" r="145" fill="url(#violetGlow)" stroke="#9B5DE5" strokeWidth="3" />
          <text x="365" y="390" fill="white" fontWeight="800">ПРИЗВАНИЕ</text>
        </g>
        <g onClick={() => setActive("ikigai")} style={{ cursor: "pointer", filter: "drop-shadow(0 0 18px rgba(255, 209, 102, .8))" }}>
          <circle cx="310" cy="290" r="72" fill="url(#goldGlow)" stroke="#FFD166" strokeWidth="4" />
          <text x="268" y="298" fill="white" fontWeight="900">Икигай</text>
        </g>
      </svg>
      {!allActive && (
        <div>
          <div className="eyebrow">{activeZone.title}</div>
          <h3>{activeZone.insight}</h3>
          <p className="muted">{activeZone.recommendation}</p>
        </div>
      )}
    </div>
  );
}
