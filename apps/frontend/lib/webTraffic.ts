import { trafficPageForPath, type TrafficViewInput } from "@levelup/contracts";

export const TRAFFIC_CONSENT_KEY = "orken_analytics_choice_v1";
const VISITOR_KEY = "orken_analytics_browser_v1";
const VISIT_KEY = "orken_analytics_visit_v1";
export const TRAFFIC_CHOICE_EVENT = "orken-analytics-choice";
const IDLE_MS = 30 * 60 * 1000;
const RETENTION_MS = 180 * 86400000;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Visit = { id: string; startedAt: number; lastAt: number; source: string; medium: string; campaign?: string };

export function trafficPrivacySignal() {
  return typeof navigator !== "undefined" && (navigator.doNotTrack === "1" || (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true);
}

export function readTrafficChoice(): "allow" | "deny" | null {
  if (typeof window === "undefined") return null;
  if (trafficPrivacySignal()) return "deny";
  try {
    const saved = JSON.parse(localStorage.getItem(TRAFFIC_CONSENT_KEY) ?? "null");
    return saved && (saved.choice === "allow" || saved.choice === "deny") && saved.expiresAt > Date.now() ? saved.choice : null;
  } catch { return "deny"; }
}

export function saveTrafficChoice(choice: "allow" | "deny") {
  try {
    if (readTrafficChoice() !== "allow") {
      localStorage.removeItem(VISITOR_KEY);
      localStorage.removeItem(VISIT_KEY);
    }
    localStorage.setItem(TRAFFIC_CONSENT_KEY, JSON.stringify({ choice, expiresAt: Date.now() + RETENTION_MS }));
    if (choice === "deny") {
      localStorage.removeItem(VISITOR_KEY);
      localStorage.removeItem(VISIT_KEY);
    }
  } catch { /* No storage means no analytics. */ }
  window.dispatchEvent(new Event(TRAFFIC_CHOICE_EVENT));
}

export function safeMarketingTag(value: string | null) {
  return value && value.length <= 48 && /^[a-z][a-z0-9_-]*$/.test(value) && !/(token|secret|password|bearer|session)/i.test(value) ? value : undefined;
}

function acquisition() {
  const params = new URLSearchParams(window.location.search);
  const source = safeMarketingTag(params.get("utm_source"));
  const medium = safeMarketingTag(params.get("utm_medium"));
  const campaign = safeMarketingTag(params.get("utm_campaign"));
  if (source) return { source, medium: medium ?? "campaign", campaign };
  try {
    const host = new URL(document.referrer).hostname;
    if (host === location.hostname) return { source: "direct", medium: "none" };
    for (const [pattern, label, type] of [
      [/(^|\.)google\.[a-z.]+$/, "google", "organic"], [/(^|\.)yandex\.[a-z]+$/, "yandex", "organic"],
      [/(^|\.)bing\.com$/, "bing", "organic"], [/(^|\.)duckduckgo\.com$/, "duckduckgo", "organic"],
      [/(^|\.)(t\.me|telegram\.org)$/, "telegram", "social"], [/(^|\.)instagram\.com$/, "instagram", "social"],
      [/(^|\.)(facebook\.com|fb\.com)$/, "facebook", "social"], [/(^|\.)linkedin\.com$/, "linkedin", "social"]
    ] as const) if (pattern.test(host)) return { source: label, medium: type };
    return { source: "external", medium: "referral" };
  } catch { return { source: "direct", medium: "none" }; }
}

function storedVisit(): Visit | null {
  try {
    const saved = JSON.parse(localStorage.getItem(VISIT_KEY) ?? "null");
    return saved && uuid.test(saved.id) && saved.lastAt <= Date.now() && Date.now() - saved.lastAt < IDLE_MS
      && Date.now() - saved.startedAt < 86400000 ? saved : null;
  } catch { return null; }
}

export function trafficRequestHeaders(): Record<string, string> {
  if (typeof window === "undefined" || readTrafficChoice() !== "allow" || !trafficPageForPath(location.pathname)) return {};
  try {
    const visitorId = localStorage.getItem(VISITOR_KEY);
    const visit = storedVisit();
    return visitorId && uuid.test(visitorId) && visit ? { "x-traffic-visitor": visitorId, "x-traffic-visit": visit.id } : {};
  } catch { return {}; }
}

export function prepareTrafficView(pathname: string, rotate = false): TrafficViewInput | null {
  const page = trafficPageForPath(pathname);
  if (!page || readTrafficChoice() !== "allow") return null;
  try {
    let visitorId = localStorage.getItem(VISITOR_KEY);
    if (!visitorId || !uuid.test(visitorId)) {
      visitorId = crypto.randomUUID();
      localStorage.setItem(VISITOR_KEY, visitorId);
    }
    const visit = (!rotate && storedVisit()) || { id: crypto.randomUUID(), startedAt: Date.now(), lastAt: Date.now(), ...acquisition() };
    visit.lastAt = Date.now();
    localStorage.setItem(VISIT_KEY, JSON.stringify(visit));
    return { consent: true, visitorId, visitId: visit.id, eventId: crypto.randomUUID(), page, source: visit.source,
      medium: visit.medium, campaign: visit.campaign, device: innerWidth < 768 ? "mobile" : innerWidth < 1024 ? "tablet" : "desktop" };
  } catch { return null; }
}
