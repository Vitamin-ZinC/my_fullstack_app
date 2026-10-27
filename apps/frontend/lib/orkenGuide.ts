export type GuideContext = "landing" | "user" | "coach" | "partner";
export type GuidePreference = { disabled: boolean; lastShownAt: number };

const fallback = new Map<string, GuidePreference>();
export const GUIDE_PREFERENCE_EVENT = "orken:guide-preference";

export function guidePreferenceKey(context: GuideContext, scope: string) {
  return `orken_guide_v1:${context}:${encodeURIComponent(scope)}`;
}

export function localGuideDay(date: Date) {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

export function guideIsDue(context: GuideContext, preference: GuidePreference, now: Date) {
  if (preference.disabled) return false;
  if (!preference.lastShownAt) return true;
  if (context === "landing") return false;
  if (localGuideDay(new Date(preference.lastShownAt)) === localGuideDay(now)) return false;
  return context !== "user" || now.getHours() < 12;
}

export function readGuidePreference(context: GuideContext, key: string): GuidePreference {
  try {
    const storage = context === "landing" ? window.sessionStorage : window.localStorage;
    const raw = storage.getItem(key);
    if (raw) {
      const value = JSON.parse(raw);
      return {
        disabled: value.disabled === true,
        lastShownAt: typeof value.lastShownAt === "number" && Number.isFinite(value.lastShownAt) && value.lastShownAt > 0
          ? value.lastShownAt : 0
      };
    }
  } catch { /* Preference storage must never interrupt a cabinet. */ }
  return fallback.get(key) ?? { disabled: false, lastShownAt: 0 };
}

export function saveGuidePreference(context: GuideContext, key: string, preference: GuidePreference) {
  fallback.set(key, preference);
  try {
    const storage = context === "landing" ? window.sessionStorage : window.localStorage;
    storage.setItem(key, JSON.stringify(preference));
  } catch { /* Keep the preference for this application session when storage is blocked. */ }
  window.dispatchEvent(new CustomEvent(GUIDE_PREFERENCE_EVENT, { detail: key }));
}
