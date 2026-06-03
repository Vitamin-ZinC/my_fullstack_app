export type AnalysisStatus = "PENDING" | "QUEUED" | "PROCESSING" | "DONE" | "FAILED";
export type PaymentStatus = "PENDING" | "SUCCEEDED" | "FAILED" | "REFUNDED";

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

export type ReportFree = {
  profession: string;
  summary: string;
  ikigai_scores: {
    love: number;
    good_at: number;
    paid_for: number;
    world_needs: number;
  };
};

export type ReportFull = ReportFree & {
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
