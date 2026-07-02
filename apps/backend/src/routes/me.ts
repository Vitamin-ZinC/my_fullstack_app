import type { FastifyInstance } from "fastify";
import { requireUserSession } from "../lib/auth.js";
import { prisma } from "../lib/prisma.js";

export async function meRoutes(app: FastifyInstance) {
  app.get("/api/me", async (request, reply) => {
    const session = await requireUserSession(request, reply);
    if (!session?.userId) return;

    const [user, reportCount, lastAnalysis] = await Promise.all([
      prisma.user.findUniqueOrThrow({
        where: { id: session.userId },
        select: {
          id: true,
          email: true,
          name: true,
          locale: true,
          role: true,
          status: true,
          emailVerifiedAt: true,
          lastLoginAt: true,
          createdAt: true
        }
      }),
      prisma.analysis.count({ where: { userId: session.userId } }),
      prisma.analysis.findFirst({
        where: { userId: session.userId },
        orderBy: { createdAt: "desc" },
        select: { id: true, status: true, createdAt: true, completedAt: true, reportFree: true, reportFull: true }
      })
    ]);

    return {
      user: serializeUser(user),
      reportCount,
      lastAnalysis: lastAnalysis ? serializeAnalysisSummary(lastAnalysis) : null
    };
  });

  app.get("/api/me/reports", async (request, reply) => {
    const session = await requireUserSession(request, reply);
    if (!session?.userId) return;

    const analyses = await prisma.analysis.findMany({
      where: { userId: session.userId },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { payment: true }
    });

    return analyses.map((analysis) => ({
      ...serializeAnalysisSummary(analysis),
      fullReportAvailable: analysis.payment?.status === "SUCCEEDED",
      paymentStatus: analysis.payment?.status ?? null,
      amountPaid: analysis.payment?.amount ?? null,
      currency: analysis.payment?.currency ?? null
    }));
  });
}

function serializeUser(user: {
  id: string;
  email: string;
  name: string | null;
  locale: string;
  role: string;
  status: string;
  emailVerifiedAt: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    locale: user.locale,
    role: user.role,
    status: user.status,
    emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString()
  };
}

function serializeAnalysisSummary(analysis: {
  id: string;
  status: string;
  createdAt: Date;
  completedAt: Date | null;
  reportFree: unknown;
  reportFull: unknown;
}) {
  const free = asReportPreview(analysis.reportFree);
  const full = asReportPreview(analysis.reportFull);
  return {
    id: analysis.id,
    status: analysis.status,
    createdAt: analysis.createdAt.toISOString(),
    completedAt: analysis.completedAt?.toISOString() ?? null,
    profession: free?.profession ?? full?.profession ?? null,
    summary: free?.summary ?? full?.summary ?? null
  };
}

function asReportPreview(value: unknown): { profession?: string; summary?: string } | null {
  if (!value || typeof value !== "object") return null;
  return value as { profession?: string; summary?: string };
}
