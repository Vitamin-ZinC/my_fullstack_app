import { readTrafficChoice } from "./webTraffic";

export const GOOGLE_ANALYTICS_ID = "G-T661WL38LP";
const SCRIPT_ID = "orken-google-analytics";
// Never load third-party analytics on authenticated, diagnostic or token-bearing pages.
const PUBLIC_PAGES = new Set(["/", "/coaches", "/for-coaches", "/offer", "/privacy"]);
type AnalyticsWindow = Window & {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
  "ga-disable-G-T661WL38LP"?: boolean;
};
let initialized = false;

function analyticsWindow() { return window as AnalyticsWindow; }

export function enableGoogleAnalytics() { analyticsWindow()[`ga-disable-${GOOGLE_ANALYTICS_ID}`] = false; }

export function googleAnalyticsPage(pathname: string) {
  return PUBLIC_PAGES.has(pathname) && !location.search && !location.hash ? pathname : null;
}

export function disableGoogleAnalytics(clearCookies = false) {
  const target = analyticsWindow();
  target[`ga-disable-${GOOGLE_ANALYTICS_ID}`] = true;
  if (!clearCookies) return;
  // Our GA cookies are host-only; also remove legacy parent-domain GA cookies.
  const domains = ["", ...location.hostname.split(".").map((_, index, parts) => `; Domain=${parts.slice(index).join(".")}`)];
  try {
    for (const item of document.cookie.split(";")) {
      const name = item.trim().split("=")[0];
      if (name !== "_ga" && !name.startsWith("_ga_")) continue;
      for (const domain of domains) document.cookie = `${name}=; Max-Age=0; Path=/${domain}; SameSite=Lax`;
    }
  } catch { /* Cookie restrictions must not break the workspace or consent controls. */ }
}

export function recordGooglePage(pathname: string) {
  const page = googleAnalyticsPage(pathname);
  if (!page || readTrafficChoice() !== "allow") return;
  const target = analyticsWindow();
  target[`ga-disable-${GOOGLE_ANALYTICS_ID}`] = false;
  target.dataLayer ??= [];
  target.gtag ??= function () { target.dataLayer!.push(arguments); };
  const safeLocation = `${location.origin}${page}`;
  if (!initialized) {
    initialized = true;
    target.gtag("consent", "default", { analytics_storage: "granted", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
    target.gtag("js", new Date());
    target.gtag("config", GOOGLE_ANALYTICS_ID, {
      send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false,
      page_location: safeLocation, page_referrer: "", page_title: "ORKEN.LIFE",
      cookie_domain: "none", cookie_expires: 180 * 86400, cookie_flags: "SameSite=Lax;Secure"
    });
  }
  if (!document.getElementById(SCRIPT_ID)) {
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.async = true;
    script.referrerPolicy = "no-referrer";
    script.src = `https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ANALYTICS_ID}`;
    script.onerror = () => script.remove();
    document.head.appendChild(script);
  }
  target.gtag("event", "page_view", { send_to: GOOGLE_ANALYTICS_ID, page_location: safeLocation, page_referrer: "", page_title: "ORKEN.LIFE" });
}
