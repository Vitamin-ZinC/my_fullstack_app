export const TRAFFIC_PAGES = [
  "/", "/coaches", "/coaches/[profile]", "/for-coaches", "/partners", "/coach",
  "/habits", "/habits/progress", "/habits/archive", "/habits/coaching",
  "/account", "/login", "/offer", "/privacy", "/flow/voice", "/flow/face",
  "/flow/ikigai", "/flow/analysis", "/report/[report]/free", "/report/[report]/full", "/pay/[report]"
] as const;
export type TrafficPage = typeof TRAFFIC_PAGES[number];
export type TrafficDevice = "mobile" | "tablet" | "desktop";
export type TrafficViewInput = {
  consent: true;
  visitorId: string;
  visitId: string;
  eventId: string;
  page: TrafficPage;
  source: string;
  medium: string;
  campaign?: string;
  device: TrafficDevice;
};
export type TrafficConfig = { enabled: boolean; retentionDays: number };
export type AdminTrafficReport = {
  generatedAt: string;
  range: { days: number; from: string; to: string; timezone: "UTC" };
  enabled: boolean;
  retentionDays: number;
  observedSince: string | null;
  totals: { visitors: number; visits: number; pageViews: number };
  daily: Array<{ date: string; visitors: number; visits: number; pageViews: number }>;
  sources: Array<{ source: string; medium: string; campaign: string | null; visits: number; registrations: number; paidReports: number }>;
  pages: Array<{ page: string; pageViews: number; visitors: number }>;
  devices: Array<{ device: string; visits: number }>;
  conversions: { registrationVisits: number; diagnosticVisits: number; paidReportVisits: number };
  business: { registrations: number; diagnostics: number; paidReports: number };
};

export function trafficPageForPath(pathname: string): TrafficPage | null {
  if ((TRAFFIC_PAGES as readonly string[]).includes(pathname)) return pathname as TrafficPage;
  if (/^\/coaches\/[a-z0-9][a-z0-9-]{0,120}$/.test(pathname)) return "/coaches/[profile]";
  if (/^\/report\/[A-Za-z0-9_-]+\/free$/.test(pathname)) return "/report/[report]/free";
  if (/^\/report\/[A-Za-z0-9_-]+\/full$/.test(pathname)) return "/report/[report]/full";
  if (/^\/pay\/[A-Za-z0-9_-]+$/.test(pathname)) return "/pay/[report]";
  return null;
}
