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
  weekSummaries: HabitWeekSummary[];
  todayTask?: HabitDailyTaskSummary | null;
  settings: {
    reminderEnabled: boolean;
    reminderTime: string;
    weeklyFreezes: number;
    subscriptionStatus: string;
    trialStartedAt?: string | null;
    trialEndsAt?: string | null;
    trialDaysLeft?: number | null;
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
