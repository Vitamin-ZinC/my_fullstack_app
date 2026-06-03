import { Worker } from "bullmq";
import { redis } from "../lib/queue.js";
import { emitProgress } from "../lib/progress.js";
import { prisma } from "../lib/prisma.js";
import { buildFallbackReport } from "../services/report.js";

const logs = [
  [15, "Анализируем микромимику..."],
  [35, "Оценка тембрального окраса..."],
  [55, "Сопоставление с базой 500+ профессий..."],
  [78, "Собираем premium-структуру отчёта..."],
  [95, "Формируем финальный вывод..."]
] as const;

export const worker = new Worker("analysis", async (job) => {
  const { analysisId } = job.data as { analysisId: string };
  await prisma.analysis.update({ where: { id: analysisId }, data: { status: "PROCESSING" } });

  for (const [progress, log] of logs) {
    emitProgress(analysisId, { progress, log, stage: "processing" });
    await new Promise((resolve) => setTimeout(resolve, 900));
  }

  const analysis = await prisma.analysis.findUniqueOrThrow({ where: { id: analysisId } });
  const report = buildFallbackReport(analysis.ikigaiAnswers as any);
  await prisma.analysis.update({
    where: { id: analysisId },
    data: {
      status: "DONE",
      reportFree: {
        profession: report.profession,
        summary: report.summary,
        ikigai_scores: report.ikigai_scores
      },
      reportFull: report,
      completedAt: new Date()
    }
  });
  emitProgress(analysisId, { status: "DONE", progress: 100, log: "Отчёт готов" });
}, {
  connection: redis,
  concurrency: 3
});

worker.on("failed", async (job, error) => {
  if (!job) return;
  if (job.attemptsMade >= 3) {
    await prisma.analysis.update({
      where: { id: job.data.analysisId },
      data: { status: "FAILED", errorMessage: error.message }
    });
    emitProgress(job.data.analysisId, { status: "FAILED", progress: 100, log: error.message });
  }
});
