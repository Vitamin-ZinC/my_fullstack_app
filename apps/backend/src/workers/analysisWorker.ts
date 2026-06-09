import { Worker } from "bullmq";
import { redis } from "../lib/queue.js";
import { emitProgress } from "../lib/progress.js";
import { prisma } from "../lib/prisma.js";
import { buildFallbackReport } from "../services/report.js";
import { generateOpenAiReport } from "../services/aiReport.js";

const logs = [
  [15, "Analyzing facial micro-signals..."],
  [35, "Estimating voice tone and confidence..."],
  [55, "Matching profile against career roles..."],
  [78, "Building premium report structure..."],
  [95, "Writing final insight..."]
] as const;

export const worker = new Worker("analysis", async (job) => {
  const { analysisId } = job.data as { analysisId: string };
  await prisma.analysis.update({ where: { id: analysisId }, data: { status: "PROCESSING" } });

  for (const [progress, log] of logs) {
    emitProgress(analysisId, { progress, log, stage: "processing" });
    await new Promise((resolve) => setTimeout(resolve, 900));
  }

  const analysis = await prisma.analysis.findUniqueOrThrow({
    where: { id: analysisId },
    include: { mediaAssets: true }
  });
  const answers = analysis.ikigaiAnswers as any;
  let report = buildFallbackReport(answers);
  let reportModel = "fallback";

  try {
    emitProgress(analysisId, { progress: 96, log: "Generating AI report...", stage: "ai" });
    const generated = await generateOpenAiReport({
      analysisId,
      locale: analysis.locale,
      answers,
      mediaAssets: analysis.mediaAssets
    });
    if (generated) {
      report = generated.report;
      reportModel = generated.model;
      emitProgress(analysisId, {
        progress: 98,
        stage: "ai",
        log: `AI report generated (${generated.mediaSignals.audioTranscript ? "audio" : "no audio"}, ${generated.mediaSignals.photoInput ? "photo" : "no photo"})`
      });
    } else {
      emitProgress(analysisId, { progress: 98, stage: "fallback", log: "AI is not configured; using fallback report" });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI report generation failed";
    emitProgress(analysisId, { progress: 98, stage: "fallback", log: `${message}; using fallback report` });
  }

  const reportFree = {
    profession: report.profession,
    summary: report.summary,
    ikigai_scores: report.ikigai_scores
  };

  await prisma.analysis.update({
    where: { id: analysisId },
    data: {
      status: "DONE",
      reportFree,
      reportFull: report,
      completedAt: new Date()
    }
  });

  await prisma.report.upsert({
    where: { analysisId_tier_language: { analysisId, tier: "FREE", language: analysis.locale } },
    update: { output: reportFree, promptVersion: analysis.reportVersion, model: reportModel },
    create: {
      analysisId,
      tier: "FREE",
      language: analysis.locale,
      promptVersion: analysis.reportVersion,
      model: reportModel,
      output: reportFree
    }
  });

  await prisma.report.upsert({
    where: { analysisId_tier_language: { analysisId, tier: "FULL", language: analysis.locale } },
    update: { output: report, promptVersion: analysis.reportVersion, model: reportModel },
    create: {
      analysisId,
      tier: "FULL",
      language: analysis.locale,
      promptVersion: analysis.reportVersion,
      model: reportModel,
      output: report
    }
  });

  await prisma.analyticsEvent.create({
    data: {
      name: "analysis_done",
      locale: analysis.locale,
      sessionId: analysis.sessionId,
      userId: analysis.userId,
      analysisId
    }
  });

  emitProgress(analysisId, { status: "DONE", progress: 100, log: "Report is ready" });
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
