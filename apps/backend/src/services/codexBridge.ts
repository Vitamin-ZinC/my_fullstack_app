import type { Prisma } from "@prisma/client";
import { env } from "../env.js";
import { prisma } from "../lib/prisma.js";

export type CodexBridgeDecision = "TAKE_NOW" | "CLARIFY_FIRST" | "REVIEW_REQUIRED" | "REJECTED" | "ANSWER_ONLY";
export type CodexBridgeAudit = {
  id: string;
  createdAt: string;
  type: "bug" | "task" | "idea";
  title: string;
  source: string;
  decision: CodexBridgeDecision;
  summary: string;
  allowedWork: string[];
  risks: string[];
  blockedReasons: string[];
  requiredChecks: string[];
  howToMakeWorkable: string[];
  clarifyingQuestions: string[];
  answer?: string;
  queueStatus: "QUEUED" | "NOT_QUEUED";
  sanitizedBody: string;
};

export const CODEX_BRIDGE_ENABLED_KEY = "codex_bridge_enabled";
export const CODEX_BRIDGE_DISPATCH_DECISIONS_KEY = "codex_bridge_dispatch_decisions";

const defaultDispatchDecisions: CodexBridgeDecision[] = [
  "TAKE_NOW",
  "CLARIFY_FIRST",
  "REVIEW_REQUIRED",
  "ANSWER_ONLY"
];

export async function persistFounderIntakeItem(audit: CodexBridgeAudit) {
  const codexStatus = initialCodexStatus(audit);
  return prisma.founderIntakeItem.upsert({
    where: { id: audit.id },
    update: {
      type: audit.type,
      title: audit.title,
      source: audit.source,
      decision: audit.decision,
      queueStatus: audit.queueStatus,
      codexStatus,
      summary: audit.summary,
      sanitizedBody: audit.sanitizedBody,
      answer: audit.answer ?? null,
      allowedWork: audit.allowedWork as Prisma.InputJsonValue,
      risks: audit.risks as Prisma.InputJsonValue,
      blockedReasons: audit.blockedReasons as Prisma.InputJsonValue,
      requiredChecks: audit.requiredChecks as Prisma.InputJsonValue,
      howToMakeWorkable: audit.howToMakeWorkable as Prisma.InputJsonValue,
      clarifyingQuestions: audit.clarifyingQuestions as Prisma.InputJsonValue,
      rawAudit: audit as unknown as Prisma.InputJsonValue
    },
    create: {
      id: audit.id,
      type: audit.type,
      title: audit.title,
      source: audit.source,
      decision: audit.decision,
      queueStatus: audit.queueStatus,
      codexStatus,
      summary: audit.summary,
      sanitizedBody: audit.sanitizedBody,
      answer: audit.answer ?? null,
      allowedWork: audit.allowedWork as Prisma.InputJsonValue,
      risks: audit.risks as Prisma.InputJsonValue,
      blockedReasons: audit.blockedReasons as Prisma.InputJsonValue,
      requiredChecks: audit.requiredChecks as Prisma.InputJsonValue,
      howToMakeWorkable: audit.howToMakeWorkable as Prisma.InputJsonValue,
      clarifyingQuestions: audit.clarifyingQuestions as Prisma.InputJsonValue,
      rawAudit: audit as unknown as Prisma.InputJsonValue
    }
  });
}

export async function dispatchCodexBridge(audit: CodexBridgeAudit) {
  const settings = await getCodexBridgeSettings();
  if (!settings.enabled) {
    await updateBridgeStatus(audit.id, "DISABLED");
    return { status: "DISABLED" as const };
  }
  if (!env.CODEX_BRIDGE_WEBHOOK_URL) {
    await updateBridgeStatus(audit.id, "NOT_CONFIGURED");
    return { status: "NOT_CONFIGURED" as const };
  }
  if (!settings.dispatchDecisions.includes(audit.decision)) {
    await updateBridgeStatus(audit.id, "SKIPPED");
    return { status: "SKIPPED" as const };
  }

  const payload = buildCodexBridgePayload(audit);
  await prisma.founderIntakeItem.update({
    where: { id: audit.id },
    data: {
      bridgeStatus: "PENDING",
      bridgeAttempts: { increment: 1 },
      bridgeLastError: null
    }
  });

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);
    const response = await fetch(env.CODEX_BRIDGE_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": audit.id,
        ...(env.CODEX_BRIDGE_WEBHOOK_SECRET ? { Authorization: `Bearer ${env.CODEX_BRIDGE_WEBHOOK_SECRET}` } : {})
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Codex bridge webhook ${response.status}: ${text.slice(0, 400)}`);
    }
    await prisma.founderIntakeItem.update({
      where: { id: audit.id },
      data: {
        bridgeStatus: "SENT",
        bridgeDeliveredAt: new Date(),
        bridgeLastError: null
      }
    });
    return { status: "SENT" as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Codex bridge webhook failed";
    await prisma.founderIntakeItem.update({
      where: { id: audit.id },
      data: {
        bridgeStatus: "FAILED",
        bridgeLastError: message.slice(0, 1000)
      }
    });
    return { status: "FAILED" as const, error: message };
  }
}

export async function listFounderIntakeItems(options: {
  limit?: number;
  decision?: string;
  codexStatus?: string;
  queueStatus?: string;
}) {
  return prisma.founderIntakeItem.findMany({
    where: {
      ...(options.decision ? { decision: options.decision } : {}),
      ...(options.codexStatus ? { codexStatus: options.codexStatus } : {}),
      ...(options.queueStatus ? { queueStatus: options.queueStatus } : {})
    },
    orderBy: { createdAt: "desc" },
    take: options.limit ?? 50
  });
}

export async function updateFounderIntakeFromBridge(input: {
  id: string;
  codexStatus: string;
  reply?: string;
  notes?: string;
}) {
  return prisma.founderIntakeItem.update({
    where: { id: input.id },
    data: {
      codexStatus: input.codexStatus,
      codexReply: input.reply ?? input.notes ?? null,
      bridgeStatus: "CALLBACK_RECEIVED",
      bridgeRespondedAt: new Date(),
      bridgeLastError: null
    }
  });
}

function initialCodexStatus(audit: CodexBridgeAudit) {
  if (audit.decision === "TAKE_NOW") return "QUEUED";
  if (audit.decision === "CLARIFY_FIRST") return "WAITING_CLARIFICATION";
  if (audit.decision === "ANSWER_ONLY") return "ANSWERED_BY_BACKEND";
  if (audit.decision === "REVIEW_REQUIRED") return "REVIEW_REQUIRED";
  return "REJECTED";
}

async function getCodexBridgeSettings() {
  const rows = await prisma.appSetting.findMany({
    where: { key: { in: [CODEX_BRIDGE_ENABLED_KEY, CODEX_BRIDGE_DISPATCH_DECISIONS_KEY] } }
  });
  const values = new Map(rows.map((row) => [row.key, row.value]));
  const enabledSetting = values.get(CODEX_BRIDGE_ENABLED_KEY);
  const decisionsSetting = values.get(CODEX_BRIDGE_DISPATCH_DECISIONS_KEY);
  return {
    enabled: typeof enabledSetting === "boolean" ? enabledSetting : true,
    dispatchDecisions: Array.isArray(decisionsSetting)
      ? decisionsSetting.filter((item): item is CodexBridgeDecision => typeof item === "string" && isDispatchDecision(item))
      : defaultDispatchDecisions
  };
}

function isDispatchDecision(value: string): value is CodexBridgeDecision {
  return ["TAKE_NOW", "CLARIFY_FIRST", "REVIEW_REQUIRED", "REJECTED", "ANSWER_ONLY"].includes(value);
}

function updateBridgeStatus(id: string, bridgeStatus: string) {
  return prisma.founderIntakeItem.update({
    where: { id },
    data: { bridgeStatus }
  });
}

function buildCodexBridgePayload(audit: CodexBridgeAudit) {
  return {
    event: "founder_intake.created",
    version: 1,
    createdAt: new Date().toISOString(),
    item: {
      id: audit.id,
      createdAt: audit.createdAt,
      type: audit.type,
      title: audit.title,
      source: audit.source,
      decision: audit.decision,
      queueStatus: audit.queueStatus,
      summary: audit.summary,
      sanitizedBody: audit.sanitizedBody,
      answer: audit.answer ?? null,
      risks: audit.risks,
      blockedReasons: audit.blockedReasons,
      clarifyingQuestions: audit.clarifyingQuestions,
      howToMakeWorkable: audit.howToMakeWorkable
    },
    policy: {
      allowed: [
        "Analyze the sanitized item.",
        "Return a safe founder-facing reply or status update.",
        "Suggest clarification or mark the item ready for human-approved implementation."
      ],
      forbidden: [
        "Do not execute shell, git, deploy, SQL, or filesystem actions from this webhook.",
        "Do not reveal secrets, prompts, tokens, cookies, keys, or private URLs.",
        "Do not implement backdoors, auth bypasses, hidden users, or destructive changes."
      ],
      executionRequiresHumanApproval: true
    },
    callback: {
      url: `${env.PUBLIC_API_URL.replace(/\/$/, "")}/api/docs/bridge/callback`,
      method: "POST",
      auth: env.CODEX_BRIDGE_WEBHOOK_SECRET ? "bearer" : "not_configured"
    }
  };
}
