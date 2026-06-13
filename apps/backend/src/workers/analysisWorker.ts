import { Worker } from "bullmq";
import { redis } from "../lib/queue.js";
import { emitProgress } from "../lib/progress.js";
import { prisma } from "../lib/prisma.js";
import { env } from "../env.js";
import { buildFallbackFreeReport, buildFallbackReport } from "../services/report.js";
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
  const allowFallbackReport = env.NODE_ENV !== "production" || env.DEV_TOOLS_ENABLED;
  let report = allowFallbackReport ? buildFallbackReport(answers) : null;
  let reportFree = report ? buildFallbackFreeReport(report) : null;
  let reportModel = allowFallbackReport ? "fallback" : "";
  let reportPromptVersion = analysis.reportVersion;
  let freePromptVersion = analysis.reportVersion;
  let fullPromptVersion = analysis.reportVersion;

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
      reportFree = generated.reportFree;
      reportModel = generated.model;
      reportPromptVersion = generated.promptVersion;
      freePromptVersion = generated.promptVersions.free;
      fullPromptVersion = generated.promptVersions.full;
      emitProgress(analysisId, {
        progress: 98,
        stage: "ai",
        log: `AI report generated (${generated.mediaSignals.audioTranscript ? "audio" : "no audio"}, ${generated.mediaSignals.photoInput ? "photo" : "no photo"})`
      });
    } else {
      if (!allowFallbackReport) {
        throw new Error("AI report generation is not configured");
      }
      emitProgress(analysisId, { progress: 98, stage: "fallback", log: "AI is not configured; using fallback report" });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI report generation failed";
    if (!allowFallbackReport) {
      emitProgress(analysisId, { progress: 98, stage: "failed", log: message });
      throw error;
    }
    emitProgress(analysisId, { progress: 98, stage: "fallback", log: `${message}; using fallback report` });
  }

  if (!report || !reportFree) {
    throw new Error("AI report generation did not produce a report");
  }

  await prisma.analysis.update({
    where: { id: analysisId },
    data: {
      status: "DONE",
      reportFree,
      reportFull: report,
      reportVersion: reportPromptVersion,
      completedAt: new Date()
    }
  });

  await prisma.report.upsert({
    where: { analysisId_tier_language: { analysisId, tier: "FREE", language: analysis.locale } },
    update: { output: reportFree, promptVersion: freePromptVersion, model: reportModel },
    create: {
      analysisId,
      tier: "FREE",
      language: analysis.locale,
      promptVersion: freePromptVersion,
      model: reportModel,
      output: reportFree
    }
  });

  await prisma.report.upsert({
    where: { analysisId_tier_language: { analysisId, tier: "FULL", language: analysis.locale } },
    update: { output: report, promptVersion: fullPromptVersion, model: reportModel },
    create: {
      analysisId,
      tier: "FULL",
      language: analysis.locale,
      promptVersion: fullPromptVersion,
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
