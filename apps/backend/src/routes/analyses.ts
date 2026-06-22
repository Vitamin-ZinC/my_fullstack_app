import type { FastifyInstance } from "fastify";
import { mkdir, writeFile } from "node:fs/promises";
import { join, normalize } from "node:path";
import { z } from "zod";
import { env } from "../env.js";
import { getRequestedLocale, requireAdmin, requireAnalysisAccess, requireSession } from "../lib/auth.js";
import { analysisQueue } from "../lib/queue.js";
import { subscribeProgress } from "../lib/progress.js";
import { prisma } from "../lib/prisma.js";
import { createMediaUploadUrls, verifyRequiredMedia } from "../services/media.js";
import { sendReportEmail } from "../services/email.js";
import { buildFallbackFreeReport, buildFallbackReport } from "../services/report.js";

const ikigaiAnswersSchema = z.object({
  love: z.array(z.string()),
  good_at: z.array(z.string()),
  world_needs: z.array(z.string()),
  paid_for: z.array(z.string())
});

const clientMetricsSchema = z.object({
  voiceDurationSeconds: z.number().positive().max(300).optional()
}).optional();

const contactEmailSchema = z.object({
  email: z.string().trim().email().max(254)
});

export async function analysisRoutes(app: FastifyInstance) {
  app.post("/api/analyses", async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    const body = z.object({ locale: z.string().optional() }).parse(request.body ?? {});
    const locale = (body.locale ?? session.locale ?? getRequestedLocale(request)).slice(0, 12);
    const media = await createMediaUploadUrls();
    const analysis = await prisma.analysis.create({
      data: {
        sessionId: session.id,
        userId: session.userId,
        locale,
        audioKey: media.audioKey,
        photoKey: media.photoKey,
        status: "PENDING",
        mediaAssets: {
          create: [
            { type: "AUDIO", key: media.audioKey, mimeType: "audio/webm" },
            { type: "PHOTO", key: media.photoKey, mimeType: "image/jpeg" }
          ]
        }
      }
    });
    await prisma.analyticsEvent.create({
      data: {
        name: "analysis_created",
        locale,
        sessionId: session.id,
        userId: session.userId,
        analysisId: analysis.id
      }
    });
    return {
      analysisId: analysis.id,
      audioUploadUrl: media.audioUploadUrl,
      photoUploadUrl: media.photoUploadUrl
    };
  });

  app.post("/api/analyses/:id/confirm", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const access = await requireAnalysisAccess(request, reply, params.id);
    if (!access) return;
    const body = z.object({ ikigaiAnswers: ikigaiAnswersSchema, clientMetrics: clientMetricsSchema }).parse(request.body);
    const answersWithMetrics = body.clientMetrics
      ? { ...body.ikigaiAnswers, clientMetrics: body.clientMetrics }
      : body.ikigaiAnswers;
    const mediaStatus = await verifyRequiredMedia(params.id);
    if (!mediaStatus.ok) return reply.code(409).send({ error: mediaStatus.reason });
    const job = await analysisQueue.add("generate-report", { analysisId: params.id });
    await prisma.analysis.update({
      where: { id: params.id },
      data: {
        ikigaiAnswers: answersWithMetrics,
        status: "QUEUED",
        jobId: job.id
      }
    });
    await prisma.analyticsEvent.create({
      data: {
        name: "questionnaire_completed",
        locale: access.analysis.locale,
        sessionId: access.session.id,
        userId: access.session.userId,
        analysisId: params.id
      }
    });
    return { status: "queued", jobId: job.id };
  });

  app.get("/api/analyses/:id/status", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const access = await requireAnalysisAccess(request, reply, params.id);
    if (!access) return;
    const analysis = access.analysis;
    const progress = analysis.status === "DONE" ? 100 : analysis.status === "PROCESSING" ? 55 : analysis.status === "QUEUED" ? 15 : 0;
    return { status: analysis.status, progress, jobId: analysis.jobId, errorMessage: analysis.errorMessage };
  });

  app.get("/api/analyses/:id/report/free", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const access = await requireAnalysisAccess(request, reply, params.id);
    if (!access) return;
    const analysis = access.analysis;
    if (analysis.status !== "DONE") return reply.code(409).send({ error: "Analysis not ready" });
    await prisma.analyticsEvent.create({
      data: {
        name: "free_report_viewed",
        locale: analysis.locale,
        sessionId: access.session.id,
        userId: access.session.userId,
        analysisId: params.id
      }
    });
    return { reportFree: analysis.reportFree };
  });

  app.get("/api/analyses/:id/report/full", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const access = await requireAnalysisAccess(request, reply, params.id);
    if (!access) return;
    const analysis = access.analysis;
    if (analysis.payment?.status !== "SUCCEEDED") return reply.code(402).send({ error: "Payment required" });
    await prisma.analyticsEvent.create({
      data: {
        name: "full_report_viewed",
        locale: analysis.locale,
        sessionId: access.session.id,
        userId: access.session.userId,
        analysisId: params.id
      }
    });
    return { reportFull: analysis.reportFull };
  });

  app.post("/api/analyses/:id/contact", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const access = await requireAnalysisAccess(request, reply, params.id);
    if (!access) return;
    const analysis = access.analysis;
    if (analysis.status !== "DONE") return reply.code(400).send({ error: "Analysis not ready" });

    const body = contactEmailSchema.parse(request.body);
    const email = body.email.toLowerCase();
    const emailDomain = email.split("@")[1] ?? "";

    const user = await prisma.$transaction(async (tx) => {
      const nextUser = await tx.user.upsert({
        where: { email },
        update: { locale: analysis.locale },
        create: { email, locale: analysis.locale }
      });
      await tx.session.update({
        where: { id: access.session.id },
        data: { userId: nextUser.id }
      });
      await tx.analysis.update({
        where: { id: analysis.id },
        data: { userId: nextUser.id }
      });
      await tx.payment.updateMany({
        where: { analysisId: analysis.id },
        data: { userId: nextUser.id }
      });
      await tx.analyticsEvent.create({
        data: {
          name: "contact_email_saved",
          locale: analysis.locale,
          sessionId: access.session.id,
          userId: nextUser.id,
          analysisId: analysis.id,
          properties: { emailDomain }
        }
      });
      return nextUser;
    });

    const freeReportUrl = buildAccessUrl(`/report/${analysis.id}/free`, access.session);
    const paymentUrl = buildAccessUrl(`/pay/${analysis.id}`, access.session);
    const reportFree = analysis.reportFree as { profession?: string } | null;
    const emailResult = await sendReportEmail({
      analysisId: analysis.id,
      email,
      freeReportUrl,
      paymentUrl,
      locale: analysis.locale,
      profession: reportFree?.profession
    });

    await prisma.analyticsEvent.create({
      data: {
        name: emailResult.emailSent ? "report_email_sent" : "report_email_failed",
        locale: analysis.locale,
        sessionId: access.session.id,
        userId: user.id,
        analysisId: analysis.id,
        properties: JSON.parse(JSON.stringify({
          emailDomain,
          emailId: emailResult.emailId,
          error: emailResult.error
        }))
      }
    });

    return {
      ok: true,
      emailSent: emailResult.emailSent,
      emailId: emailResult.emailId
    };
  });

  app.get("/api/analyses/:id/stream", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const access = await requireAnalysisAccess(request, reply, params.id);
    if (!access) return;
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
    });
    const unsubscribe = subscribeProgress(params.id, (event) => {
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    });
    reply.raw.write(`data: ${JSON.stringify({ status: access.analysis.status, progress: 0 })}\n\n`);
    request.raw.on("close", unsubscribe);
  });

  app.put("/api/uploads/:key", async (request, reply) => {
    if (!env.LOCAL_UPLOADS_ENABLED && env.NODE_ENV === "production") return reply.code(404).send({ error: "Not found" });
    const params = z.object({ key: z.string() }).parse(request.params);
    if (params.key.includes("/") || params.key.includes("..")) return reply.code(400).send({ error: "Invalid upload key" });
    const contentLength = Number(request.headers["content-length"] ?? 0);
    const contentTypeHeader = request.headers["content-type"];
    const contentType = Array.isArray(contentTypeHeader) ? contentTypeHeader[0] : contentTypeHeader;
    const body = request.body instanceof Buffer ? request.body : Buffer.from([]);
    await mkdir(env.LOCAL_UPLOAD_DIR, { recursive: true });
    const uploadPath = normalize(join(env.LOCAL_UPLOAD_DIR, params.key));
    await writeFile(uploadPath, body);
    const asset = await prisma.mediaAsset.update({
      where: { key: params.key },
      data: {
        status: "UPLOADED",
        size: body.length || (Number.isFinite(contentLength) ? contentLength : undefined),
        mimeType: contentType ?? undefined,
        uploadedAt: new Date()
      }
    });
    return { ok: true, mediaAssetId: asset.id };
  });

  app.put("/api/dev/uploads/:key", async (request, reply) => {
    return app.inject({
      method: "PUT",
      url: `/api/uploads/${(request.params as { key: string }).key}`,
      headers: request.headers,
      payload: request.body as Buffer
    }).then((response) => reply.code(response.statusCode).send(response.body));
  });

  app.post("/api/dev/analyses/:id/complete", async (request, reply) => {
    if (!env.DEV_TOOLS_ENABLED) return reply.code(404).send({ error: "Not found" });
    const admin = await requireAdmin(request, reply);
    if (!admin) return;
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
        reportFree: buildFallbackFreeReport(report),
        reportFull: report,
        completedAt: new Date()
      }
    });
    return { ok: true };
  });
}

function buildAccessUrl(path: string, session: { id: string; guestToken: string }) {
  const url = new URL(path, env.APP_ORIGIN);
  url.searchParams.set("x-session-id", session.id);
  url.searchParams.set("x-guest-token", session.guestToken);
  return url.toString();
}
