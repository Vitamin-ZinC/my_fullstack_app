export type AudioMeasurementStatus = "usable" | "limited" | "unavailable";

export type AudioSignalAnalysis = {
  version: "acoustics-v1";
  method: { vad: "webrtc-vad"; pitch: "mcleod"; frameMs: 20; pitchFrameMs: 64 };
  durationSeconds: number;
  speechSeconds: number;
  speechCoverage: number;
  pauses: {
    status: AudioMeasurementStatus;
    count: number;
    medianMs: number | null;
    p90Ms: number | null;
    longestMs: number | null;
    perMinute: number | null;
    leadingSilenceMs: number;
    trailingSilenceMs: number;
    intervals: { startSeconds: number; endSeconds: number }[];
  };
  pitch: {
    status: AudioMeasurementStatus;
    medianHz: number | null;
    p10Hz: number | null;
    p90Hz: number | null;
    rangeSemitones: number | null;
    reliableSeconds: number;
    speechCoverage: number;
    medianClarity: number | null;
    rejectedJumpFrames: number;
  };
  loudness: {
    status: AudioMeasurementStatus;
    medianDbfs: number | null;
    p10Dbfs: number | null;
    p90Dbfs: number | null;
    rangeDb: number | null;
    clippingRatio: number;
  };
  timeline: {
    startSeconds: number;
    endSeconds: number;
    speechSeconds: number;
    pitchMedianHz: number | null;
    pitchRangeSemitones: number | null;
    loudnessMedianDbfs: number | null;
    pauseCount: number;
    status: AudioMeasurementStatus;
  }[];
  warnings: ("short_speech" | "quiet_signal" | "clipping" | "low_pitch_coverage" | "possible_background_noise")[];
};
