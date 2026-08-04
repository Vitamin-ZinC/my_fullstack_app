import { createHash, randomBytes } from "node:crypto";
import { Prisma, type CoachPartnershipLead, type CoachPartnershipLeadStatus } from "@prisma/client";
import type {
  AdminCoachPartnershipLead,
  CoachPartnershipInterest,
  CoachPartnershipMaterial
} from "@levelup/contracts";
import { env } from "../env.js";
import { prisma } from "../lib/prisma.js";

export const COACH_MATERIAL_TTL_DAYS = 14;

export type CreateCoachPartnershipLeadInput = {
  idempotencyKey: string;
  fullName: string;
  email: string;
  telegram?: string | null;
  city?: string | null;
  practiceFormat: string;
  experienceYears?: number | null;
  activeClients?: number | null;
  interests: CoachPartnershipInterest[];
  message?: string | null;
  consentAt: Date;
};

export function createCoachMaterialToken() {
  return randomBytes(32).toString("base64url");
}

export function hashCoachMaterialToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createCoachPartnershipLead(input: CreateCoachPartnershipLeadInput) {
  const existing = await prisma.coachPartnershipLead.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) return { lead: existing, materialToken: null, created: false };

  const materialToken = createCoachMaterialToken();
  const materialExpiresAt = new Date(Date.now() + COACH_MATERIAL_TTL_DAYS * 24 * 60 * 60 * 1000);
  try {
    const lead = await prisma.coachPartnershipLead.create({
      data: {
        ...input,
        email: input.email.toLowerCase(),
        telegram: input.telegram || null,
        city: input.city || null,
        experienceYears: input.experienceYears ?? null,
        activeClients: input.activeClients ?? null,
        interests: input.interests,
        message: input.message || null,
        materialTokenHash: hashCoachMaterialToken(materialToken),
        materialExpiresAt
      }
    });
    return { lead, materialToken, created: true };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const duplicate = await prisma.coachPartnershipLead.findUnique({
        where: { idempotencyKey: input.idempotencyKey }
      });
      if (duplicate) return { lead: duplicate, materialToken: null, created: false };
    }
    throw error;
  }
}

export async function markCoachApplicationDelivery(
  id: string,
  result: { applicantEmailSent: boolean; teamNotificationSent: boolean }
) {
  return prisma.coachPartnershipLead.update({
    where: { id },
    data: {
      applicantEmailStatus: result.applicantEmailSent ? "SENT" : "FAILED",
      teamNotificationStatus: result.teamNotificationSent ? "SENT" : "FAILED"
    }
  });
}

export async function getCoachPartnershipMaterial(token: string) {
  if (!/^[A-Za-z0-9_-]{40,80}$/.test(token)) return null;
  const tokenHash = hashCoachMaterialToken(token);
  const lead = await prisma.coachPartnershipLead.findUnique({ where: { materialTokenHash: tokenHash } });
  if (!lead || lead.status === "REJECTED" || lead.materialExpiresAt.getTime() <= Date.now()) return null;

  if (!lead.materialOpenedAt) {
    await prisma.coachPartnershipLead.update({ where: { id: lead.id }, data: { materialOpenedAt: new Date() } });
  }
  const program = await prisma.partnerAffiliateProgram.findFirst({
    where: { status: "ACTIVE" },
    orderBy: { updatedAt: "desc" },
    select: { commissionRateBps: true, termsVersion: true }
  });
  return buildCoachPartnershipMaterial({
    expiresAt: lead.materialExpiresAt,
    referralRateBps: program?.commissionRateBps ?? 1000,
    termsVersion: program?.termsVersion ?? "coach-v1"
  });
}

export function buildCoachPartnershipMaterial(input: {
  expiresAt: Date;
  referralRateBps: number;
  termsVersion: string;
}): CoachPartnershipMaterial {
  const referralRate = `${formatPercent(input.referralRateBps / 100)}%`;
  return {
    version: input.termsVersion,
    title: "Коммерческие условия сотрудничества с ORKEN.LIFE",
    expiresAt: input.expiresAt.toISOString(),
    intro: "Материал предназначен для кандидата в партнёры. Финальные условия вступают в силу только после одобрения и подписания партнёрского соглашения.",
    wholesale: [
      { product: "AI-диагностика Икигай", retail: "$3", partnerPrice: "$2" },
      { product: "ORKEN Premium — 1 месяц", retail: "$8", partnerPrice: "$5" },
      { product: "ORKEN Premium — 3 месяца", retail: "$24", partnerPrice: "$15" },
      { product: "ORKEN Premium — 6 месяцев", retail: "$48", partnerPrice: "$30" },
      { product: "ORKEN Premium — 12 месяцев", retail: "$96", partnerPrice: "$60" }
    ],
    referral: {
      rate: referralRate,
      basis: "От успешно проведённых оплат подписки пользователей, закреплённых за партнёром по его реферальной ссылке.",
      duration: "За последующие платежи пользователя, пока действует подписка и партнёрский доступ не приостановлен.",
      payoutRule: "Начисление становится доступно после периода возвратов и проверки на дубли, саморефералы и злоупотребления."
    },
    personal: {
      rate: "50%",
      standardSlotLimit: "До 10 одновременно активных клиентов на одного коуча.",
      workloadRule: "Новый клиент может выбрать коуча только при наличии свободного слота. Индивидуальный лимит может быть уменьшен или расширен в соглашении."
    },
    visibilityRules: [
      "Пользователь, пришедший по персональной ссылке коуча, видит этого коуча как закреплённого специалиста.",
      "Пользователь без партнёрской привязки видит каталог одобренных коучей и выбирает самостоятельно.",
      "В каталоге показываются только одобренные профили с актуальной программой и свободными слотами.",
      "При приостановке доступа, окончании слотов или нарушении стандартов карточка временно скрывается из новых назначений."
    ],
    onboardingSteps: [
      "Команда проверяет заявку и формат практики.",
      "Стороны согласуют цены, слоты, территорию, White Label и правила выплат.",
      "Коуч принимает партнёрское соглашение и получает единый аккаунт Partner Core.",
      "ORKEN выдаёт реферальную ссылку, настраивает карточку и при необходимости White Label.",
      "Оплаты, закрепления, начисления и выплаты отображаются в партнёрском кабинете."
    ],
    legalNotes: [
      "Ставки рассчитаны по текущей базовой коммерческой модели и могут меняться только новой версией соглашения.",
      "Вознаграждение не начисляется по отменённым платежам, возвратам, саморефералам и операциям с признаками злоупотребления.",
      "White Label, налоги, валюта расчётов, график выплат и дополнительные услуги согласуются индивидуально.",
      "Этот материал не является публичной офертой. При расхождении применяется подписанное партнёрское соглашение."
    ],
    partnerPortalUrl: `${env.APP_ORIGIN.replace(/\/$/, "")}/partners`,
    supportEmail: env.COACH_APPLICATION_NOTIFY_EMAIL
  };
}

export function serializeCoachPartnershipLead(lead: CoachPartnershipLead): AdminCoachPartnershipLead {
  return {
    id: lead.id,
    fullName: lead.fullName,
    email: lead.email,
    telegram: lead.telegram,
    city: lead.city,
    practiceFormat: lead.practiceFormat,
    experienceYears: lead.experienceYears,
    activeClients: lead.activeClients,
    interests: readInterests(lead.interests),
    message: lead.message,
    status: lead.status,
    materialOpenedAt: lead.materialOpenedAt?.toISOString() ?? null,
    materialExpiresAt: lead.materialExpiresAt.toISOString(),
    applicantEmailStatus: lead.applicantEmailStatus,
    teamNotificationStatus: lead.teamNotificationStatus,
    createdAt: lead.createdAt.toISOString(),
    updatedAt: lead.updatedAt.toISOString()
  };
}

export async function updateCoachPartnershipLeadStatus(id: string, status: CoachPartnershipLeadStatus) {
  return prisma.coachPartnershipLead.update({ where: { id }, data: { status } });
}

function readInterests(value: unknown): CoachPartnershipInterest[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is CoachPartnershipInterest => (
    typeof item === "string" && ["wholesale", "referral", "marketplace", "white_label", "personal"].includes(item)
  ));
}

function formatPercent(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}
