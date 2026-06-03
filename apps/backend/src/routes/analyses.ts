import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { analysisQueue } from "../lib/queue.js";
import { subscribeProgress } from "../lib/progress.js";
import { prisma } from "../lib/prisma.js";
import { createMediaUploadUrls } from "../services/media.js";
import { buildFallbackReport } from "../services/report.js";

const ikigaiAnswersSchema = z.object({
  love: z.array(z.string()),
  good_at: z.array(z.string()),
  world_needs: z.array(z.string()),
  paid_for: z.array(z.string())
});

export async function analysisRoutes(app: FastifyInstance) {
  app.post("/api/analyses", async (request) => {
    const body = z.object({ sessionId: z.string() }).parse(request.body);
    const media = await createMediaUploadUrls();
    const analysis = await prisma.analysis.create({
      data: {
        sessionId: body.sessionId,
        audioKey: media.audioKey,
        photoKey: media.photoKey,
        status: "PENDING"
      }
    });
    return {
      analysisId: analysis.id,
      audioUploadUrl: media.audioUploadUrl,
      photoUploadUrl: media.photoUploadUrl
    };
  });

  app.post("/api/analyses/:id/confirm", async (request) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({ ikigaiAnswers: ikigaiAnswersSchema }).parse(request.body);
    const job = await analysisQueue.add("generate-report", { analysisId: params.id });
    await prisma.analysis.update({
      where: { id: params.id },
      data: {
        ikigaiAnswers: body.ikigaiAnswers,
        status: "QUEUED",
        jobId: job.id
      }
    });
    return { status: "queued", jobId: job.id };
  });

  app.get("/api/analyses/:id/status", async (request) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const analysis = await prisma.analysis.findUniqueOrThrow({ where: { id: params.id } });
    const progress = analysis.status === "DONE" ? 100 : analysis.status === "PROCESSING" ? 55 : analysis.status === "QUEUED" ? 15 : 0;
    return { status: analysis.status, progress, jobId: analysis.jobId, errorMessage: analysis.errorMessage };
  });

  app.get("/api/analyses/:id/report/free", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const analysis = await prisma.analysis.findUniqueOrThrow({ where: { id: params.id } });
    if (analysis.status !== "DONE") return reply.code(409).send({ error: "Analysis not ready" });
    return { reportFree: analysis.reportFree };
  });

  app.get("/api/analyses/:id/report/full", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const analysis = await prisma.analysis.findUniqueOrThrow({
      where: { id: params.id },
      include: { payment: true }
    });
    if (analysis.payment?.status !== "SUCCEEDED") return reply.code(402).send({ error: "Payment required" });
    return { reportFull: analysis.reportFull };
  });

  app.get("/api/analyses/:id/stream", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
    });
    const unsubscribe = subscribeProgress(params.id, (event) => {
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    });
    request.raw.on("close", unsubscribe);
  });

  app.post("/api/dev/analyses/:id/complete", async (request) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const analysis = await prisma.analysis.findUniqueOrThrow({ where: { id: params.id } });
    const answers = ikigaiAnswersSchema.parse(analysis.ikigaiAnswers ?? {
      love: [], good_at: [], world_needs: [], paid_for: []
    });
    const report = buildFallbackReport(answers);
    await prisma.analysis.update({
      where: { id: params.id },
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
    return { ok: true };
  });
}
