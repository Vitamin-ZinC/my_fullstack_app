export type AnalysisStatus = "PENDING" | "QUEUED" | "PROCESSING" | "DONE" | "FAILED";
export type PaymentStatus = "PENDING" | "SUCCEEDED" | "FAILED" | "REFUNDED";
export type PromoDiscountType = "PERCENT" | "FIXED_AMOUNT";
export type UserRole = "USER" | "ADMIN";
export type MediaAssetType = "AUDIO" | "PHOTO";
export type MediaAssetStatus = "CREATED" | "UPLOADED" | "VERIFIED" | "REJECTED";
export type ReportTier = "FREE" | "FULL";
export type PromptStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";
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
  career_action: string;
  final_insight: string;
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

export type AdminStats = {
  analysesTotal: number;
  analysesByStatus: Array<{ status: AnalysisStatus; count: number }>;
  paymentsSucceeded: number;
  revenueSucceeded: number;
  eventsLast24h: number;
  failedAnalyses: number;
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

export type CheckoutSessionResponse = {
  url: string;
  sessionId: string;
  amount: number;
  originalAmount: number;
  discountAmount: number;
  currency: string;
  promoCode?: string | null;
};
