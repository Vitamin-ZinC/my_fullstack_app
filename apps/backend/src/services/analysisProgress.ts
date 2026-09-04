export type AnalysisProgressStatus = "PENDING" | "QUEUED" | "PROCESSING" | "DONE" | "FAILED";

export function resolveAnalysisProgress(status: AnalysisProgressStatus, latestProgress?: number | null) {
  if (status === "DONE" || status === "FAILED") return 100;
  if (status === "PENDING") return 0;
  if (status === "QUEUED") return 15;

  const persisted = Number.isFinite(latestProgress) ? Math.round(Number(latestProgress)) : 5;
  return Math.max(5, Math.min(99, persisted));
}

export function publicReportFailureMessage(locale: string) {
  if (locale.toLowerCase().startsWith("ru")) {
    return "Не удалось сформировать отчёт. Данные диагностики сохранены, повторите попытку немного позже.";
  }
  return "The report could not be generated. Your diagnostic data is saved; please try again shortly.";
}
