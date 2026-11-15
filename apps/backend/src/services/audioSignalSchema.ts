import { z } from "zod";
import type { AudioSignalAnalysis } from "@levelup/contracts";

const nonnegative = z.number().finite().min(0);
const ratio = nonnegative.max(1);
const seconds = nonnegative.max(180);
const hz = z.number().finite().min(60).max(600).nullable();
const dbfs = z.number().finite().min(-100).max(0).nullable();
const status = z.enum(["usable", "limited", "unavailable"]);

// Stored server measurements are validated separately from the LLM JSON schema.
export const audioSignalSchema: z.ZodType<AudioSignalAnalysis> = z.object({
  version: z.literal("acoustics-v1"),
  method: z.object({ vad: z.literal("webrtc-vad"), pitch: z.literal("mcleod"), frameMs: z.literal(20), pitchFrameMs: z.literal(64) }),
  durationSeconds: seconds, speechSeconds: seconds, speechCoverage: ratio,
  pauses: z.object({ status, count: nonnegative.int().max(900), medianMs: nonnegative.max(180000).nullable(),
    p90Ms: nonnegative.max(180000).nullable(), longestMs: nonnegative.max(180000).nullable(), perMinute: nonnegative.max(300).nullable(),
    leadingSilenceMs: nonnegative.max(180000), trailingSilenceMs: nonnegative.max(180000),
    intervals: z.array(z.object({ startSeconds: seconds, endSeconds: seconds })).max(900) }),
  pitch: z.object({ status, medianHz: hz, p10Hz: hz, p90Hz: hz, rangeSemitones: nonnegative.max(40).nullable(),
    reliableSeconds: seconds, speechCoverage: ratio, medianClarity: ratio.nullable(), rejectedJumpFrames: nonnegative.int().max(9000) }),
  loudness: z.object({ status, medianDbfs: dbfs, p10Dbfs: dbfs, p90Dbfs: dbfs, rangeDb: nonnegative.max(100).nullable(), clippingRatio: ratio }),
  timeline: z.array(z.object({ startSeconds: seconds, endSeconds: seconds, speechSeconds: seconds, pitchMedianHz: hz,
    pitchRangeSemitones: nonnegative.max(40).nullable(), loudnessMedianDbfs: dbfs, pauseCount: nonnegative.int().max(25), status })).max(36),
  warnings: z.array(z.enum(["short_speech", "quiet_signal", "clipping", "low_pitch_coverage", "possible_background_noise"])).max(5)
});
