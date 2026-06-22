"use client";

import { useState, type PointerEvent } from "react";
import { useSiteText } from "@/lib/useSiteText";

type ZoneId = "passion" | "mission" | "vocation" | "profession" | "ikigai";

export type IkigaiMapZone = {
  title: string;
  insight: string;
  recommendation: string;
};

type IkigaiPremiumMapProps = {
  allActive?: boolean;
  freeMode?: boolean;
  landingMode?: boolean;
  showPanel?: boolean;
  zoneOverrides?: Partial<Record<ZoneId, IkigaiMapZone>>;
};

const zoneSubtitles: Record<ZoneId, string> = {
  passion: "Что нравится",
  mission: "Что нужно рынку",
  profession: "Что получается",
  vocation: "Что монетизируется",
  ikigai: "центр реализации"
};

export function IkigaiPremiumMap({
  allActive = false,
  freeMode = false,
  landingMode = false,
  showPanel = true,
  zoneOverrides
}: IkigaiPremiumMapProps) {
  const text = useSiteText().ikigaiMap;
  const [active, setActive] = useState<ZoneId>("ikigai");
  const activeId = freeMode ? "profession" : active;
  const activeZone = zoneOverrides?.[activeId] ?? text.zones[activeId];
  const modeClass = freeMode ? "free-mode" : landingMode ? "landing-mode" : "premium-mode";
  const locked = allActive || freeMode || landingMode;
  const sectors = [
    { id: "passion" as const, cx: 145, cy: 165, r: 112, fill: "url(#gradPassion)", stroke: "#00D4FF" },
    { id: "mission" as const, cx: 255, cy: 165, r: 112, fill: "url(#gradMission)", stroke: "#9B5DE5" },
    { id: "profession" as const, cx: 145, cy: 275, r: 112, fill: "url(#gradProfession)", stroke: "#00D4FF" },
    { id: "vocation" as const, cx: 255, cy: 275, r: 112, fill: "url(#gradVocation)", stroke: "#9B5DE5" }
  ];

  function handleMapPointer(event: PointerEvent<SVGSVGElement>) {
    if (locked) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 400;
    const y = ((event.clientY - rect.top) / rect.height) * 430;
    const isCenter = Math.pow((x - 200) / 76, 2) + Math.pow((y - 220) / 66, 2) <= 1;
    if (isCenter) {
      setActive("ikigai");
      return;
    }

    const nearest = sectors.reduce((best, sector) => {
      const distance = Math.hypot(x - sector.cx, y - sector.cy);
      return distance < best.distance ? { id: sector.id, distance } : best;
    }, { id: "passion" as ZoneId, distance: Number.POSITIVE_INFINITY });
    setActive(nearest.id);
  }

  return (
    <div className={`ikigai-premium-map ${modeClass}`}>
      <svg
        className={landingMode ? "ikigai-svg-map" : "ikigai-svg-map has-active"}
        viewBox="0 0 400 430"
        role="img"
        aria-label="Ikigai Premium Map"
        data-testid="ikigai-map-svg"
        onClick={locked ? undefined : handleMapPointer}
      >
        <defs>
          <radialGradient id="gradPassion" cx="45%" cy="42%" r="70%"><stop offset="0%" stopColor="#00D4FF" stopOpacity=".36" /><stop offset="58%" stopColor="#7BE7FF" stopOpacity=".2" /><stop offset="100%" stopColor="#00D4FF" stopOpacity=".06" /></radialGradient>
          <radialGradient id="gradMission" cx="55%" cy="42%" r="70%"><stop offset="0%" stopColor="#9B5DE5" stopOpacity=".34" /><stop offset="58%" stopColor="#FF7AD9" stopOpacity=".18" /><stop offset="100%" stopColor="#9B5DE5" stopOpacity=".06" /></radialGradient>
          <radialGradient id="gradProfession" cx="45%" cy="58%" r="70%"><stop offset="0%" stopColor="#00D4FF" stopOpacity=".38" /><stop offset="58%" stopColor="#2AF7B8" stopOpacity=".2" /><stop offset="100%" stopColor="#00D4FF" stopOpacity=".06" /></radialGradient>
          <radialGradient id="gradVocation" cx="55%" cy="58%" r="70%"><stop offset="0%" stopColor="#9B5DE5" stopOpacity=".34" /><stop offset="58%" stopColor="#FFC64A" stopOpacity=".16" /><stop offset="100%" stopColor="#9B5DE5" stopOpacity=".06" /></radialGradient>
          <radialGradient id="gradCenter" cx="50%" cy="50%" r="70%"><stop offset="0%" stopColor="#FFC64A" stopOpacity=".78" /><stop offset="62%" stopColor="#00D4FF" stopOpacity=".24" /><stop offset="100%" stopColor="#9B5DE5" stopOpacity=".12" /></radialGradient>
          <filter id="softGlass"><feGaussianBlur in="SourceAlpha" stdDeviation="1.2" result="blur" /><feOffset dy="1" /><feComposite in2="SourceAlpha" operator="arithmetic" k2="-1" k3="1" result="shadowDiff" /><feFlood floodColor="#ffffff" floodOpacity=".18" /><feComposite in2="shadowDiff" operator="in" /><feComposite in2="SourceGraphic" operator="over" /></filter>
        </defs>
        <g opacity=".98">
          {sectors.map((sector) => (
            <g
              className={`ikigai-sector ${sector.id} ${allActive || activeId === sector.id ? "active-sector" : ""}`}
              key={sector.id}
              data-testid={`ikigai-zone-${sector.id}`}
            >
              <circle cx={sector.cx} cy={sector.cy} r={sector.r} fill={sector.fill} stroke={sector.stroke} strokeWidth="2.2" filter="url(#softGlass)" />
              <circle className="sector-hit" cx={sector.cx} cy={sector.cy} r={sector.r + 22} />
              <text x={sector.cx} y={sector.cy - 8} textAnchor="middle">{text.labels[sector.id]}</text>
              <text className="sector-sub" x={sector.cx} y={sector.cy + 12} textAnchor="middle">{zoneSubtitles[sector.id]}</text>
            </g>
          ))}
          <g
            className={`ikigai-sector ikigai ${allActive || activeId === "ikigai" ? "active-sector" : ""}`}
            data-testid="ikigai-zone-ikigai"
          >
            <ellipse cx="200" cy="220" rx="58" ry="48" fill="url(#gradCenter)" stroke="#FFC64A" strokeWidth="2.4" filter="url(#softGlass)" />
            <ellipse className="sector-hit" cx="200" cy="220" rx="76" ry="66" />
            <text x="200" y="216" textAnchor="middle">{text.labels.ikigai}</text>
            <text className="sector-sub" x="200" y="236" textAnchor="middle">{zoneSubtitles.ikigai}</text>
          </g>
        </g>
      </svg>
      {!locked && (
        <div className="ikigai-click-layer" aria-label="Выбор зоны Икигай">
          {(["passion", "mission", "profession", "vocation", "ikigai"] as const).map((zone) => (
            <button
              aria-label={text.labels[zone]}
              className={`ikigai-hotspot ${zone}`}
              data-testid={`ikigai-hotspot-${zone}`}
              key={zone}
              type="button"
              onClick={() => setActive(zone)}
            />
          ))}
        </div>
      )}
      {freeMode && <div className="ikigai-lock-badge">{text.lockedNote}</div>}
      {showPanel && !allActive && !landingMode && (
        <div className="ikigai-analysis-panel" data-testid="ikigai-zone-panel">
          <h3>{activeZone.title}</h3>
          <p>{activeZone.insight}</p>
          <p><strong>Рекомендация:</strong> {activeZone.recommendation}</p>
        </div>
      )}
    </div>
  );
}
