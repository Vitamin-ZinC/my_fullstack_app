import type { SiteText } from "./messages";

// Apply only to system/interface copy, never to profiles, reports or messages.
export function presentInterfaceCopy(source: string) {
  return source
    .replace(/кабинет(?:а|е|ом|у)?\s+коуча(?:\s*\/\s*HR)?/gi, value => value.replace(/коуча(?:\s*\/\s*HR)?/i, "эксперта"))
    .replace(/Вход для коуча/g, "Вход для эксперта")
    .replace(/подопечных/gi, value => value[0] === "П" ? "Клиентов" : "клиентов")
    .replace(/подопечные/gi, value => value[0] === "П" ? "Клиенты" : "клиенты")
    .replace(/coach(?:'s)? (workspace|dashboard|account|portal|login)/gi, (value, noun) => `${value[0] === "C" ? "Expert" : "expert"} ${noun}`)
    .replace(/\b(coachees|wards)\b/gi, value => value[0] === value[0].toUpperCase() ? "Clients" : "clients");
}

export function presentStaticCopy<T>(value: T): T {
  if (typeof value === "string") return presentInterfaceCopy(value) as T;
  if (Array.isArray(value)) return value.map(presentStaticCopy) as T;
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, presentStaticCopy(item)])) as T;
  return value;
}

export function presentDiagnosticFlow(flow: SiteText["flow"], defaults: SiteText["flow"]): SiteText["flow"] {
  const oldVisualClaim = /микромим|micro.?expression|500\+/i;
  return { ...flow, analysis: { ...flow.analysis,
    subtitle: /психотип|psychotype/i.test(flow.analysis.subtitle) ? defaults.analysis.subtitle : flow.analysis.subtitle,
    stages: flow.analysis.stages.some(item => oldVisualClaim.test(item)) ? defaults.analysis.stages : flow.analysis.stages,
    neuralLog: flow.analysis.neuralLog.some(item => oldVisualClaim.test(item)) ? defaults.analysis.neuralLog : flow.analysis.neuralLog
  } };
}

export function presentLandingCopy<T>(value: T): T {
  if (typeof value === "string") return value
    .replace(/(Полный отч[её]т|Full report)\s*—\s*/gi, "$1: ")
    .replace(/навигатор — для/gi, "навигатор для")
    .replace(/людей — с контекстом/g, "людей с контекстом")
    .replace(/независимо — можно/g, "независимо: можно")
    .replace(/\s*—\s*/g, ", ") as T;
  if (Array.isArray(value)) return value.map(presentLandingCopy) as T;
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, presentLandingCopy(item)])) as T;
  return value;
}
