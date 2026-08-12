export type AnalysisStatus = "PENDING" | "QUEUED" | "PROCESSING" | "DONE" | "FAILED";
export type PaymentStatus = "PENDING" | "SUCCEEDED" | "FAILED" | "REFUNDED";
export type PromoDiscountType = "PERCENT" | "FIXED_AMOUNT";
export type UserRole = "USER" | "ADMIN";
export type MediaAssetType = "AUDIO" | "PHOTO";
export type MediaAssetStatus = "CREATED" | "UPLOADED" | "VERIFIED" | "REJECTED";
export type ReportTier = "FREE" | "FULL";
export type PromptStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";
export type HabitProgramStatus = "ACTIVE" | "PAUSED" | "COMPLETED" | "ARCHIVED";
export type HabitEnrollmentStatus = "ACTIVE" | "COMPLETED" | "SKIPPED" | "ARCHIVED";
export type SupportedLocale = "ru" | "en";

export type IkigaiAnswers = {
  love: string[];
  good_at: string[];
  world_needs: string[];
  paid_for: string[];
};

export type VoiceAnalysis = {
  timbre: string;
  emotionality: string;
  confidence: string;
  pace: string;
  energy: string;
  leadership: string;
  anxiety: string;
  communication: string;
  charisma: string;
  analytical: string;
  sociality: string;
  persuasion: string;
  motivation: string;
};

export type FaceAnalysis = {
  emotionality: string;
  leadership: string;
  confidence: string;
  thinkingType: string;
  sociality: string;
  stressTolerance: string;
  analytical: string;
  motivation: string;
  empathy: string;
  openness: string;
  communication: string;
  discipline: string;
  ambition: string;
};

export type RoleFit = {
  name: string;
  match: number;
  why: string;
  voiceEvidence: string;
  faceEvidence: string;
  strengths: string;
  risks: string;
};

export type IkigaiScores = {
  love: number;
  good_at: number;
  paid_for: number;
  world_needs: number;
};

export type IkigaiReportZone = {
  title: string;
  insight: string;
  recommendation: string;
};

export type ReportFree = {
  profession: string;
  summary: string;
  ikigai_scores: IkigaiScores;
  key_insight?: string;
  paid_report_teaser?: string;
  paid_report_preview?: string[];
};

export type ReportFull = {
  profession: string;
  summary: string;
  ikigai_scores: IkigaiScores;
  voice_analysis: VoiceAnalysis;
  face_analysis: FaceAnalysis;
  top_roles: RoleFit[];
  ikigai_zones?: {
    passion: IkigaiReportZone;
    mission: IkigaiReportZone;
    profession: IkigaiReportZone;
    vocation: IkigaiReportZone;
    ikigai: IkigaiReportZone;
  };
  career_action: string;
  final_insight: string;
};

export type AuthUser = {
  id: string;
  email: string;
  name?: string | null;
  locale: string;
  role: UserRole;
  status: "ACTIVE" | "DISABLED";
  emailVerifiedAt?: string | null;
  lastLoginAt?: string | null;
  createdAt: string;
};

export type AuthSessionResponse = {
  sessionId: string;
  guestToken: string;
  userId?: string | null;
  locale: string;
  user?: AuthUser | null;
};

export type AuthResult = {
  sessionId: string;
  guestToken: string;
  user: AuthUser;
};

export type MagicLinkRequestResponse = {
  ok: true;
  emailSent: boolean;
  expiresAt: string;
  debugLoginUrl?: string;
};

export type MeReportSummary = {
  id: string;
  status: AnalysisStatus;
  createdAt: string;
  completedAt?: string | null;
  profession?: string | null;
  summary?: string | null;
  fullReportAvailable: boolean;
  paymentStatus?: PaymentStatus | null;
  amountPaid?: number | null;
  currency?: string | null;
};

export type MeResponse = {
  user: AuthUser;
  reportCount: number;
  lastAnalysis?: Omit<MeReportSummary, "fullReportAvailable" | "paymentStatus" | "amountPaid" | "currency"> | null;
};

export type CreateAnalysisResponse = {
  analysisId: string;
  audioUploadUrl: string;
  photoUploadUrl: string;
};

export type PhotoSuitabilityResponse = {
  suitable: true;
  cached: boolean;
  confidence: number;
};

export type AudioSuitabilityResponse = {
  suitable: true;
  cached: boolean;
  wordCount: number;
};

export type AnalysisProgressEvent = {
  status?: AnalysisStatus;
  progress: number;
  stage?: string;
  log?: string;
};

export type ReportGenerationItemMeta = {
  model: string | null;
  promptVersion: number;
  generatedBy: "llm" | "fallback" | "unknown";
  createdAt: string;
};

export type ReportGenerationMeta = {
  free?: ReportGenerationItemMeta;
  full?: ReportGenerationItemMeta;
  usedFallback: boolean;
  fallbackReason?: string;
  fallbackAt?: string;
};

export type AnalysisStatusResponse = {
  status: AnalysisStatus;
  progress: number;
  jobId?: string | number | null;
  errorMessage?: string | null;
  reportMeta?: ReportGenerationMeta;
};

export type FreeReportResponse = {
  reportFree: ReportFree;
  reportMeta?: ReportGenerationMeta;
};

export type FullReportResponse = {
  reportFull: ReportFull;
  reportMeta?: ReportGenerationMeta;
};

export type AdminStats = {
  analysesTotal: number;
  analysesByStatus: Array<{ status: AnalysisStatus; count: number }>;
  paymentsSucceeded: number;
  revenueSucceeded: number;
  eventsLast24h: number;
  failedAnalyses: number;
  habitProgramsTotal: number;
  habitProgramsActive: number;
  habitXpTotal: number;
  habitCheckinsTotal: number;
  habitInsightsTotal: number;
};

export type AdminReportBreakdown = {
  key: string;
  count: number;
};

export type AdminMoneyTotal = {
  currency: string;
  amount: number;
};

export type AdminSubscriptionAccessType =
  | "PAID_SUBSCRIPTION"
  | "STANDARD_TRIAL"
  | "GIFTED_DAYS"
  | "PARTNER_BONUS"
  | "FREE_ACCESS";

export type AdminBusinessReport = {
  generatedAt: string;
  range: {
    days: number;
    from: string;
    to: string;
  };
  users: {
    total: number;
    newInPeriod: number;
    activeInPeriod: number;
  };
  diagnostics: {
    createdInPeriod: number;
    completedInPeriod: number;
    failedInPeriod: number;
    byStatus: AdminReportBreakdown[];
  };
  payments: {
    createdInPeriod: number;
    succeededInPeriod: number;
    promoUsesInPeriod: number;
    byStatus: AdminReportBreakdown[];
    revenue: AdminMoneyTotal[];
    discounts: AdminMoneyTotal[];
    recent: Array<{
      id: string;
      userEmail?: string | null;
      productType: "DIAGNOSTIC_REPORT";
      status: string;
      amount: number;
      originalAmount?: number | null;
      discountAmount: number;
      currency: string;
      promoCode?: string | null;
      createdAt: string;
      paidAt?: string | null;
    }>;
  };
  subscriptions: {
    totalPrograms: number;
    createdInPeriod: number;
    trialStartedInPeriod: number;
    paidCurrent: number;
    cancellingCurrent: number;
    trialsEndingWithin7Days: number;
    cohortTrialToPaidPercent: number;
    byStatus: AdminReportBreakdown[];
    byAccessType: AdminReportBreakdown[];
    estimatedMrr: AdminMoneyTotal;
    estimatedArr: AdminMoneyTotal;
    rows: Array<{
      id: string;
      userId?: string | null;
      userEmail?: string | null;
      title: string;
      planType: "HABITS_MONTHLY";
      accessType: AdminSubscriptionAccessType;
      status: string;
      source: string;
      trialStartedAt?: string | null;
      trialEndsAt?: string | null;
      currentPeriodEnd?: string | null;
      cancelAtPeriodEnd: boolean;
      createdAt: string;
      updatedAt: string;
    }>;
  };
  coaches: {
    applicationsTotal: number;
    applicationsInPeriod: number;
    byStatus: AdminReportBreakdown[];
    byPracticeFormat: AdminReportBreakdown[];
    byInterest: AdminReportBreakdown[];
  };
  partners: {
    attributedUsersTotal: number;
    attributionsInPeriod: number;
    bonusesAppliedTotal: number;
    eventsInPeriod: number;
    eventsByType: AdminReportBreakdown[];
    redemptionsInPeriod: number;
    redemptionsByStatus: AdminReportBreakdown[];
  };
};

export type AppSettingValue = string | number | boolean | null | AppSettingValue[] | { [key: string]: AppSettingValue };

export type AppSetting = {
  key: string;
  value: AppSettingValue;
  updatedAt: string;
};

export type FeatureFlag = {
  key: string;
  enabled: boolean;
  payload?: AppSettingValue;
  updatedAt: string;
};

export type PromptTemplate = {
  id: string;
  key: string;
  locale: string;
  version: number;
  status: PromptStatus;
  title: string;
  content: string;
  createdAt?: string;
  updatedAt?: string;
  publishedAt?: string | null;
};

export type PromptTemplateInput = Omit<PromptTemplate, "id">;

export type PromoCode = {
  id: string;
  code: string;
  description?: string | null;
  discountType: PromoDiscountType;
  percentOff?: number | null;
  amountOff?: number | null;
  currency?: string | null;
  active: boolean;
  maxRedemptions?: number | null;
  redemptions: number;
  startsAt?: string | null;
  expiresAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PartnerCustomerBonusType = "NONE" | "FREE_DAYS" | "DISCOUNT" | "CREDITS" | "CUSTOM_ENTITLEMENT";
export type PartnerCommissionModel = "FIXED" | "PERCENT" | "HYBRID";
export type PartnerCommissionWindow = "FIRST_PAYMENT" | "MONTHS" | "LIFETIME";
export type PartnerProgramStatus = "ACTIVE" | "PAUSED";
export type PartnerOfferStatus = "DRAFT" | "PENDING_REVIEW" | "APPROVED" | "REJECTED" | "PAUSED";
export type PartnerRedemptionStatus = "PENDING" | "FULFILLED" | "PARTNER_FAILED" | "REFUNDED";

export type PartnerReferralLinkSummary = {
  id: string;
  programConfigId: string;
  channel: string;
  referralCode?: string | null;
  url?: string | null;
  partnerCoreLinkId?: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type PartnerAffiliateProgramInput = {
  id?: string;
  partnerCoreProgramId?: string | null;
  name: string;
  referralDestination: string;
  customerBonusType: PartnerCustomerBonusType;
  customerBonusValue?: number | null;
  customerBonusEntitlement?: string | null;
  commissionModel: PartnerCommissionModel;
  commissionRateBps?: number | null;
  fixedPayoutCents?: number | null;
  commissionWindowType: PartnerCommissionWindow;
  commissionWindowMonths?: number | null;
  lockDays: number;
  status: PartnerProgramStatus;
  termsVersion: string;
};

export type PartnerAffiliateProgramSummary = PartnerAffiliateProgramInput & {
  id: string;
  referralLinks: PartnerReferralLinkSummary[];
  createdAt: string;
  updatedAt: string;
};

export type PartnerOfferInput = {
  id?: string;
  programConfigId?: string | null;
  partnerId?: string | null;
  partnerCorePlacementId?: string | null;
  partnerCoreStatus?: string | null;
  kind?: string;
  surface?: string;
  title: string;
  description: string;
  imageUrl?: string | null;
  redemptionCurrency: string;
  redemptionAmount: number;
  userBenefit: string;
  partnerPayoutCents: number;
  capPerMonth?: number | null;
  status: PartnerOfferStatus;
  entitlementType: string;
  entitlementValue?: string | null;
};

export type PartnerOfferSummary = {
  id: string;
  programConfigId?: string | null;
  partnerId?: string | null;
  partnerCorePlacementId?: string | null;
  partnerCoreStatus?: string | null;
  partnerCoreSyncedAt?: string | null;
  kind?: string;
  surface?: string;
  title: string;
  description: string;
  imageUrl?: string | null;
  redemptionCost: {
    currency: string;
    amount: number;
  };
  userBenefit: string;
  partnerPayoutCents: number;
  capPerMonth?: number | null;
  status: PartnerOfferStatus;
  entitlementType: string;
  entitlementValue?: string | null;
  redemptionsCount?: number;
  createdAt: string;
  updatedAt: string;
};

export type PartnerRedemptionSummary = {
  id: string;
  offerId: string;
  offerTitle?: string | null;
  userId?: string | null;
  userEmail?: string | null;
  sessionId?: string | null;
  costCurrency: string;
  costAmount: number;
  status: PartnerRedemptionStatus;
  entitlementType?: string | null;
  entitlementValue?: string | null;
  partnerCoreRedemptionId?: string | null;
  deliveryError?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PartnerMarketplaceResponse = {
  balance: number;
  currency: string;
  offers: PartnerOfferSummary[];
  redemptions: PartnerRedemptionSummary[];
};

export type PartnerOfferRedemptionResponse = {
  redemption: PartnerRedemptionSummary;
  balance: number;
  currency: string;
};

export type PartnerPortalStatus = "DRAFT" | "PENDING_REVIEW" | "APPROVED" | "REJECTED" | "SUSPENDED" | string;

export type PartnerPortalIdentity = {
  partnerCorePartnerId: string;
  status: PartnerPortalStatus;
  displayName?: string | null;
  accountName?: string | null;
  email?: string | null;
};

export type PartnerPortalSessionResponse = {
  partner: PartnerPortalIdentity;
  expiresAt: string;
};

export type PartnerPortalDashboard = {
  partner: PartnerPortalIdentity;
  metrics: Record<string, unknown>;
  referralLinks: Array<Record<string, unknown>>;
  offers: Array<Record<string, unknown>>;
  registrations: Array<Record<string, unknown>>;
  payments: Array<Record<string, unknown>>;
  leads: Array<Record<string, unknown>>;
  conversions: Array<Record<string, unknown>>;
  payouts: Record<string, unknown>;
};

export type PartnerPortalReferralLink = Record<string, unknown>;
export type PartnerPortalOffer = Record<string, unknown>;
export type PartnerPortalLedgerResponse = Record<string, unknown>;
export type PartnerPortalPayoutsResponse = Record<string, unknown>;

export type CoachProfileStatus = "DRAFT" | "PENDING_REVIEW" | "APPROVED" | "REJECTED" | "SUSPENDED";
export type CoachClientFunding = "COACH_PAID" | "CLIENT_PAID";
export type CoachRelationshipStatus = "PENDING" | "ACTIVE" | "PAUSED" | "ENDED";
export type CoachServiceType = "ONGOING_SUPPORT" | "CONSULTATION";
export type CoachServicePaymentModel = "INCLUDED" | "CLIENT_PAID";
export type CoachOfferStatus = "DRAFT" | "PENDING_REVIEW" | "APPROVED" | "REJECTED" | "PAUSED";
export type CoachServiceOrderStatus = "PENDING_PAYMENT" | "AWAITING_BOOKING" | "BOOKED" | "ACTIVE" | "COMPLETED" | "CANCELLED" | "REFUND_PENDING" | "REFUNDED" | "FAILED";

export type CoachPlanSummary = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  includedClients?: number | null;
  customQuote: boolean;
  active: boolean;
  sortOrder: number;
  amount: number;
  currency: string;
  priceVersionId?: string | null;
  stripePriceId?: string | null;
  overridden?: boolean;
};

export type CoachProfileSummary = {
  id: string;
  partnerCorePartnerId?: string;
  slug: string;
  displayName: string;
  headline?: string | null;
  bio?: string | null;
  city?: string | null;
  specializations: string[];
  languages: string[];
  avatarUrl?: string | null;
  coverImageUrl?: string | null;
  status: CoachProfileStatus;
  acceptingOrders: boolean;
  featured: boolean;
  calendlyConnected?: boolean;
  publicSince?: string | null;
};

export type CoachServiceOfferSummary = {
  id: string;
  coachProfileId: string;
  type: CoachServiceType;
  paymentModel: CoachServicePaymentModel;
  title: string;
  description: string;
  amount: number;
  currency: string;
  coachShareBps?: number | null;
  platformShareBps?: number | null;
  calendlyEventTypeUri?: string | null;
  calendlySchedulingUrl?: string | null;
  status: CoachOfferStatus;
  moderationNote?: string | null;
};

export type CoachClientSummary = {
  relationshipId: string;
  userId: string;
  name?: string | null;
  email: string;
  avatarUrl?: string | null;
  funding: CoachClientFunding;
  status: CoachRelationshipStatus;
  metricsConsent: boolean;
  journalConsent: boolean;
  startedAt?: string | null;
  accessEndsAt?: string | null;
  lastCheckinAt?: string | null;
  weeklyAverage?: number | null;
  latestEnergy?: number | null;
  latestClarity?: number | null;
  latestStability?: number | null;
  attentionReason?: string | null;
};

export type CoachMessageSummary = {
  id: string;
  relationshipId: string;
  authorRole: "COACH" | "CLIENT";
  text: string;
  readAt?: string | null;
  createdAt: string;
};

export type CoachAssignmentSummary = {
  id: string;
  relationshipId: string;
  title: string;
  details: string;
  dueAt?: string | null;
  status: "OPEN" | "COMPLETED" | "DISMISSED";
  completedAt?: string | null;
  createdAt: string;
};

export type CoachHabitAssignmentSummary = {
  id: string;
  relationshipId: string;
  habitDefinitionId?: string | null;
  enrollmentId?: string | null;
  title: string;
  focus: string;
  practice: string;
  why: string;
  startsAt: string;
  endsAt?: string | null;
  status: "PROPOSED" | "ACTIVE" | "DECLINED" | "COMPLETED" | "CANCELLED";
};

export type CoachMetricPoint = {
  date: string;
  energy: number;
  clarity: number;
  stability: number;
  wellness: number;
};

export type CoachHabitCorrelation = {
  habitTitle: string;
  metric: "energy" | "clarity" | "stability";
  differencePercent: number;
  completedDays: number;
  comparisonDays: number;
  message: string;
};

export type CoachClientDetail = {
  client: CoachClientSummary;
  metrics: CoachMetricPoint[];
  insights: HabitInsightSummary[];
  messages: CoachMessageSummary[];
  assignments: CoachAssignmentSummary[];
  habitAssignments: CoachHabitAssignmentSummary[];
  correlations: CoachHabitCorrelation[];
};

export type CoachSubscriptionSummary = {
  id: string;
  plan: CoachPlanSummary;
  status: string;
  clientLimit?: number | null;
  coachPaidClients: number;
  clientPaidClients: number;
  availableSlots?: number | null;
  currentPeriodEnd?: string | null;
  graceEndsAt?: string | null;
  cancelAtPeriodEnd: boolean;
};

export type CoachWorkspaceResponse = {
  profile: CoachProfileSummary;
  plans: CoachPlanSummary[];
  subscription?: CoachSubscriptionSummary | null;
  clients: CoachClientSummary[];
  serviceOffers: CoachServiceOfferSummary[];
  counts: { coachPaidClients: number; clientPaidClients: number; attention: number; openAssignments: number };
  integrations: { calendly: { connected: boolean; status: string }; telegramBotUsername?: string | null };
  sites: CoachSiteSummary[];
  sitePlans: Array<{ id: string; code: string; name: string; setupAmount: number; monthlySupportAmount: number; currency: string }>;
  rewards: CoachRewardSummary[];
};

export type CoachSiteSummary = {
  id: string;
  planCode: string;
  planName: string;
  setupAmount: number;
  monthlySupportAmount: number;
  currency: string;
  slug: string;
  customDomain?: string | null;
  customDomainStatus: string;
  status: string;
  supportCurrentPeriodEnd?: string | null;
  graceEndsAt?: string | null;
  content?: Record<string, unknown>;
  theme?: Record<string, unknown>;
};

export type CoachRewardSummary = {
  id: string;
  title: string;
  description: string;
  pointsCost: number;
  entitlementType: string;
  entitlementValue?: string | null;
  status: string;
  moderationNote?: string | null;
};

export type CoachCatalogResponse = {
  coaches: Array<CoachProfileSummary & { services: CoachServiceOfferSummary[]; siteUrl?: string | null }>;
  filters: { cities: string[]; specializations: string[]; languages: string[] };
};

export type CoachPublicContent = {
  heroEyebrow: string;
  heroTitle: string;
  heroLead: string;
  heroPrimaryCta: string;
  heroSecondaryCta: string;
  pricingEyebrow: string;
  pricingTitle: string;
  pricingLead: string;
  applicationEyebrow: string;
  applicationTitle: string;
  applicationLead: string;
  applicationSubmitLabel: string;
};

export const DEFAULT_COACH_PUBLIC_CONTENT: CoachPublicContent = {
  heroEyebrow: "Партнёрская программа ORKEN",
  heroTitle: "Технология, которая продолжает вашу работу между сессиями",
  heroLead: "Добавьте AI-диагностику и трекер состояний в свою практику, показывайте клиенту прогресс и развивайте новые источники дохода.",
  heroPrimaryCta: "Стать партнёром",
  heroSecondaryCta: "Условия сотрудничества",
  pricingEyebrow: "Тарифы платформы",
  pricingTitle: "Пакет под текущую практику",
  pricingLead: "Цена зависит только от числа клиентов, доступ которым оплачивает коуч. Клиенты с собственной подпиской не занимают места.",
  applicationEyebrow: "Заявка на партнёрство",
  applicationTitle: "Хочу стать партнёром ORKEN",
  applicationLead: "После отправки мы пришлём закрытый материал с точной экономикой, правилами видимости и партнёрским процессом.",
  applicationSubmitLabel: "Получить условия сотрудничества"
};

export type PublicCoachPlatformConfig = {
  plans: CoachPlanSummary[];
  sitePlans: Array<{ id: string; code: string; name: string; setupAmount: number; monthlySupportAmount: number; currency: string }>;
  content: CoachPublicContent;
};

export type HabitProgressResponse = {
  period: "days" | "weeks" | "month";
  points: CoachMetricPoint[];
  averages: { energy: number | null; clarity: number | null; stability: number | null; wellness: number | null };
  habitCompletionPercent: number;
  currentStreak: number;
  correlations: CoachHabitCorrelation[];
};

export type HabitCoachingHubResponse = {
  relationships: Array<{
    coach: CoachProfileSummary;
    relationshipId: string;
    status: CoachRelationshipStatus;
    funding: CoachClientFunding;
    metricsConsent: boolean;
    journalConsent: boolean;
    accessEndsAt?: string | null;
    messages: CoachMessageSummary[];
    assignments: CoachAssignmentSummary[];
    habitAssignments: CoachHabitAssignmentSummary[];
    rewards: CoachRewardSummary[];
  }>;
  orders: Array<{
    id: string;
    coachProfileId: string;
    coachName: string;
    serviceTitle: string;
    type: CoachServiceType;
    status: string;
    amount: number;
    currency: string;
    bookingDeadline?: string | null;
    bookedAt?: string | null;
  }>;
};

export type AdminCoachPlatformSnapshot = {
  profiles: CoachProfileSummary[];
  plans: CoachPlanSummary[];
  sitePlans: Array<{ id: string; code: string; name: string; setupAmount: number; monthlySupportAmount: number; currency: string; active: boolean }>;
  subscriptions: Array<{
    id: string;
    coach: string;
    plan: string;
    status: string;
    amount: number;
    currency: string;
    clientLimit?: number | null;
    currentPeriodEnd?: string | null;
  }>;
  orders: Array<{
    id: string;
    coach: string;
    client: string;
    service: string;
    status: string;
    amount: number;
    currency: string;
    createdAt: string;
  }>;
  offers: CoachServiceOfferSummary[];
  rewardsPendingReview: CoachRewardSummary[];
  cancellationPolicy: { hoursBeforeStart: number; refundPercent: number };
  publicContent: CoachPublicContent;
};

export type CoachPartnershipInterest = "wholesale" | "referral" | "marketplace" | "white_label" | "personal";

export type CoachPartnershipApplicationInput = {
  fullName: string;
  email: string;
  telegram?: string;
  city?: string;
  practiceFormat: "individual" | "groups" | "corporate" | "education" | "mixed";
  experienceYears?: number;
  activeClients?: number;
  interests: CoachPartnershipInterest[];
  message?: string;
  consent: true;
  idempotencyKey: string;
  website?: string;
};

export type CoachPartnershipApplicationResponse = {
  applicationId: string;
  status: "received";
  materialDelivery: "sent" | "manual_follow_up";
};

export type CoachPartnershipMaterial = {
  version: string;
  title: string;
  expiresAt: string;
  intro: string;
  wholesale: Array<{ product: string; retail: string; partnerPrice: string }>;
  referral: { rate: string; basis: string; duration: string; payoutRule: string };
  personal: { rate: string; standardSlotLimit: string; workloadRule: string };
  visibilityRules: string[];
  onboardingSteps: string[];
  legalNotes: string[];
  partnerPortalUrl: string;
  supportEmail: string;
};

export type CoachPartnershipLeadStatus = "NEW" | "CONTACTED" | "APPROVED" | "REJECTED";

export type AdminCoachPartnershipLead = {
  id: string;
  fullName: string;
  email: string;
  telegram?: string | null;
  city?: string | null;
  practiceFormat: string;
  experienceYears?: number | null;
  activeClients?: number | null;
  interests: CoachPartnershipInterest[];
  message?: string | null;
  status: CoachPartnershipLeadStatus;
  materialOpenedAt?: string | null;
  materialExpiresAt: string;
  applicantEmailStatus: string;
  teamNotificationStatus: string;
  createdAt: string;
  updatedAt: string;
};

export type PartnerCoreAdminPartner = {
  id: string;
  account_type?: string | null;
  display_name?: string | null;
  legal_name?: string | null;
  email?: string | null;
  account_status?: string | null;
  project_status: string;
  referral_links_count?: number | string | null;
  conversions_count?: number | string | null;
  payable_cents?: number | string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type PartnerCoreAdminSnapshot = {
  configured: boolean;
  error?: string | null;
  project: Record<string, unknown> | null;
  programs: Array<Record<string, unknown>>;
  referralLinks: Array<Record<string, unknown>>;
  placements: Array<Record<string, unknown>>;
  partners: PartnerCoreAdminPartner[];
  redemptions: Array<Record<string, unknown>>;
  walletOperations: Array<Record<string, unknown>>;
  ledgerEntries: Array<Record<string, unknown>>;
  reviewTasks: Array<Record<string, unknown>>;
};

export type AdminUserHabitProgramSummary = {
  id: string;
  title: string;
  status: HabitProgramStatus;
  subscriptionStatus: string;
  trialStartedAt?: string | null;
  trialEndsAt?: string | null;
  trialDaysLeft?: number | null;
  subscriptionCurrentPeriodEnd?: string | null;
  currentCycle: number;
  currentWeek: number;
  xp: number;
  checkinsDone: number;
  insightsCount: number;
  latestMetric?: {
    date: string;
    energy: number;
    clarity: number;
    stability: number;
  } | null;
  telegramEnabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AdminUserSummary = {
  id: string;
  email: string;
  name?: string | null;
  role: UserRole;
  status: "ACTIVE" | "DISABLED";
  locale: string;
  avatarUrl?: string | null;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string | null;
  stats: {
    sessionsCount: number;
    analysesTotal: number;
    analysesDone: number;
    paymentsSucceeded: number;
    revenueSucceeded: number;
    habitProgramsTotal: number;
    habitProgramsActive: number;
    habitXp: number;
    habitCheckins: number;
    habitInsights: number;
    telegramAccounts: number;
    lastEventAt?: string | null;
  };
  habitPrograms: AdminUserHabitProgramSummary[];
  recentAnalyses: Array<{
    id: string;
    status: AnalysisStatus;
    createdAt: string;
    completedAt?: string | null;
  }>;
  recentEvents: Array<{
    id: string;
    name: string;
    createdAt: string;
  }>;
  telegramAccounts: Array<{
    id: string;
    username?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    status: string;
    linkedAt: string;
    lastSeenAt: string;
  }>;
};

export type AdminGiftDaysResponse = {
  ok: true;
  userId: string;
  programId: string;
  days: number;
  subscriptionStatus: string;
  trialEndsAt?: string | null;
  trialDaysLeft?: number | null;
};

export type PaymentIntentResponse = {
  clientSecret: string | null;
  paymentIntentId: string;
  status: PaymentStatus;
  amount: number;
  originalAmount: number;
  discountAmount: number;
  currency: string;
  promoCode?: string | null;
};

export type PaymentConfigResponse = {
  amount: number;
  currency: string;
  priceLabel: string;
};

export type HabitConfigResponse = PaymentConfigResponse & {
  trialDays: number;
  assistantAvatarUrl?: string;
};

export type CheckoutSessionResponse = {
  url: string;
  sessionId: string;
  amount: number;
  originalAmount: number;
  discountAmount: number;
  currency: string;
  promoCode?: string | null;
};

export type ReportContactResponse = {
  ok: true;
  emailSent: boolean;
  emailId?: string;
  error?: string;
};

export type HabitDefinitionSummary = {
  id: string;
  slug?: string;
  cycle?: number;
  week: number;
  title: string;
  focus: string;
  essence: string;
  practice: string;
  why: string;
  book?: string | null;
  zone?: string | null;
};

export type HabitCycleSummary = {
  id: number;
  code: string;
  title: string;
  label: string;
  areas: string[];
  goal: string;
  weeks: number;
};

export type HabitCheckinSummary = {
  id: string;
  date: string;
  completed: boolean;
  note?: string | null;
  energy?: number | null;
  clarity?: number | null;
  stability?: number | null;
  createdAt: string;
};

export type HabitEnrollmentSummary = HabitDefinitionSummary & {
  status: HabitEnrollmentStatus;
  sortOrder: number;
  checkinsDone: number;
  lastCheckinAt?: string | null;
  checkins: HabitCheckinSummary[];
  dailyTasks: HabitDailyTaskSummary[];
  todayTask?: HabitDailyTaskSummary | null;
};

export type HabitInsightSummary = {
  id: string;
  enrollmentId?: string | null;
  habitTitle?: string | null;
  text: string;
  source: string;
  createdAt: string;
};

export type HabitDailyMetricSummary = {
  id: string;
  date: string;
  energy: number;
  clarity: number;
  stability: number;
};

export type HabitRewardSummary = {
  id: string;
  type: string;
  label: string;
  xp: number;
  createdAt: string;
};

export type HabitDailyTaskSummary = {
  id: string;
  enrollmentId: string;
  date?: string | null;
  dayIndex: number;
  title: string;
  taskText: string;
  microAction: string;
  whyToday: string;
  completedAt?: string | null;
  xpAwarded: number;
  createdAt: string;
};

export type HabitCalendarEventSummary = {
  id: string;
  enrollmentId?: string | null;
  dailyTaskId?: string | null;
  title: string;
  description: string;
  startsAt: string;
  durationMinutes: number;
  status: string;
  source: string;
  createdAt: string;
};

export type HabitWeekSummary = {
  id: string;
  enrollmentId: string;
  habitTitle?: string | null;
  cycle: number;
  week: number;
  checkinsDone: number;
  completionMode: "FULL" | "SOFT" | "FROZEN" | string;
  summary: string;
  pingviFeedback: string;
  rewardLabel: string;
  xpAwarded: number;
  createdAt: string;
};

export type HabitRankHistorySummary = {
  id: string;
  year: number;
  month: number;
  rankTitle: string;
  rankLevel: number;
  monthXp: number;
  monthMaxXp: number;
  monthPercent: number;
  guruStreakCount: number;
  legendStatus: boolean;
  createdAt: string;
};

export type HabitProgramSummary = {
  id: string;
  status: HabitProgramStatus;
  source: string;
  title: string;
  weakZone?: string | null;
  archetype?: string | null;
  topRole?: string | null;
  careerAction?: string | null;
  finalInsight?: string | null;
  profile: Record<string, unknown>;
  currentCycle: number;
  currentWeek: number;
  currentSortOrder: number;
  startedAt: string;
  createdAt: string;
  activeEnrollment?: HabitEnrollmentSummary | null;
  enrollments: HabitEnrollmentSummary[];
  cycles: HabitCycleSummary[];
  insights: HabitInsightSummary[];
  metrics: HabitDailyMetricSummary[];
  rewards: HabitRewardSummary[];
  calendarEvents: HabitCalendarEventSummary[];
  weekSummaries: HabitWeekSummary[];
  rankHistory: HabitRankHistorySummary[];
  todayTask?: HabitDailyTaskSummary | null;
  settings: {
    reminderEnabled: boolean;
    reminderTime: string;
    weeklyFreezes: number;
    subscriptionStatus: string;
    trialStartedAt?: string | null;
    trialEndsAt?: string | null;
    trialDaysLeft?: number | null;
    stripeSubscriptionId?: string | null;
    subscriptionCurrentPeriodEnd?: string | null;
    subscriptionCancelAtPeriodEnd?: boolean;
  };
  stats: {
    xp: number;
    daysInProgram: number;
    checkinsDone: number;
    insightsCount: number;
    streakDays: number;
    currentCycle: number;
    currentWeek: number;
    currentSortOrder: number;
    totalWeeks: number;
    completedWeekCheckins: number;
    weekProgress: number;
    wellnessScore?: number | null;
    rank: {
      title: string;
      level: number;
      nextTitle?: string | null;
      nextAtXp?: number | null;
      progress: number;
      currentSortOrder: number;
      monthXp?: number;
      monthMaxXp?: number;
      monthPercent?: number;
      color?: string;
      shape?: string;
      badge?: string;
      guruStreakCount?: number;
      legendStatus?: boolean;
    };
  };
};

export type HabitLatestReport = {
  analysisId: string;
  profession?: string | null;
  summary?: string | null;
  completedAt?: string | null;
};

export type HabitMeResponse = {
  program: HabitProgramSummary | null;
  latestReport: HabitLatestReport | null;
  config: HabitConfigResponse;
  access?: { allowed: boolean; source: "B2C" | "COACH_PACKAGE" | "COACH_SERVICE" | "EXPIRED" | "NONE"; relationshipId?: string | null };
};

export type HabitProgramResponse = {
  program: HabitProgramSummary;
  config: HabitConfigResponse;
};

export type HabitNavigatorResponse = {
  reply: string;
  model: string;
  threadId?: string;
};

export type TelegramAccountSummary = {
  id: string;
  telegramUserId: string;
  chatId: string;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  status: string;
  linkedAt: string;
  lastSeenAt: string;
};

export type HabitNotificationPreferenceSummary = {
  programId: string;
  telegramEnabled: boolean;
  reminderTime: string;
  timezone: string;
  quietHoursStart?: string | null;
  quietHoursEnd?: string | null;
  motivationFrequency: string;
  lastReminderAt?: string | null;
};

export type TelegramStatusResponse = {
  configured: boolean;
  linked: boolean;
  account?: TelegramAccountSummary | null;
  preferences?: HabitNotificationPreferenceSummary | null;
};

export type TelegramLinkTokenResponse = {
  configured: boolean;
  connectUrl: string;
  expiresAt: string;
};

export type TelegramPreferenceResponse = {
  preferences: HabitNotificationPreferenceSummary;
};

export type TelegramWebLoginResponse = {
  sessionId: string;
  guestToken: string;
  userId?: string | null;
  locale: string;
};

export type TelegramCommunityChatStatus = "PENDING" | "ACTIVE" | "PAUSED" | "LEFT";

export type AdminTelegramCommunityChat = {
  id: string;
  telegramChatId: string;
  type: string;
  title?: string | null;
  username?: string | null;
  status: TelegramCommunityChatStatus;
  timezone: string;
  schedulesEnabled: boolean;
  aiRepliesEnabled: boolean;
  smartPingEnabled: boolean;
  morningTime: string;
  middayTime: string;
  eveningTime: string;
  quietHoursStart: string;
  quietHoursEnd: string;
  lastHumanMessageAt?: string | null;
  lastWakeAt?: string | null;
  memberCount: number;
  commitmentCount: number;
  postCount: number;
  createdAt: string;
  updatedAt: string;
};

export type TelegramCommunityAdminSnapshot = {
  configured: boolean;
  username?: string | null;
  chats: AdminTelegramCommunityChat[];
};

export type TelegramCommunityChatUpdate = Partial<Pick<AdminTelegramCommunityChat,
  | "status"
  | "timezone"
  | "schedulesEnabled"
  | "aiRepliesEnabled"
  | "smartPingEnabled"
  | "morningTime"
  | "middayTime"
  | "eveningTime"
  | "quietHoursStart"
  | "quietHoursEnd"
>>;
