import initializeFvad from "@echogarden/fvad-wasm";
import { PitchDetector } from "pitchy";
import { setImmediate } from "node:timers/promises";
import type { AudioSignalAnalysis, AudioMeasurementStatus } from "@levelup/contracts";

export const SIGNAL_SAMPLE_RATE = 16000;
export const MAX_SIGNAL_SECONDS = 180;
const HOP = 320;
const PITCH_FRAME = 1024;
const MIN_PAUSE_FRAMES = 10;
const MAX_GAP_FRAMES = 5;
type Frame = { start: number; end: number; db: number; speech: boolean; hz: number | null; clarity: number | null };
let modulePromise: ReturnType<typeof initializeFvad> | undefined;

export function quantile(values: number[], probability: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  return sorted[lower] + (sorted[Math.ceil(position)] - sorted[lower]) * (position - lower);
}

const rounded = (value: number, digits = 2) => Number(value.toFixed(digits));
const nullableRound = (value: number | null, digits = 2) => value === null ? null : rounded(value, digits);
const semitones = (low: number | null, high: number | null) => low && high ? rounded(12 * Math.log2(high / low)) : null;

// The algorithms are supplied by WebRTC and Pitchy. This layer gates and aggregates
// their measurements; detector scores are not probabilities of a personal trait.
export async function analyzeSignalPcm(pcm: Buffer): Promise<AudioSignalAnalysis> {
  const sampleCount = Math.floor(pcm.length / 2);
  if (!sampleCount || sampleCount > MAX_SIGNAL_SECONDS * SIGNAL_SAMPLE_RATE || pcm.length % 2) {
    throw new Error("AUDIO_SIGNAL_LENGTH");
  }
  const started = performance.now();
  const samples = new Int16Array(sampleCount);
  const floats = new Float32Array(sampleCount);
  let clipped = 0;
  let peak = 0;
  for (let i = 0; i < sampleCount; i += 1) {
    samples[i] = pcm.readInt16LE(i * 2);
    floats[i] = samples[i] / 32768;
    peak = Math.max(peak, Math.abs(floats[i]));
    if (Math.abs(samples[i]) >= 32700) clipped += 1;
  }
  const duration = sampleCount / SIGNAL_SAMPLE_RATE;
  const frames: Frame[] = [];
  for (let offset = 0; offset < sampleCount; offset += HOP) {
    const end = Math.min(offset + HOP, sampleCount);
    let squares = 0;
    for (let i = offset; i < end; i += 1) squares += floats[i] ** 2;
    frames.push({ start: offset / SIGNAL_SAMPLE_RATE, end: end / SIGNAL_SAMPLE_RATE,
      db: Math.max(-100, 10 * Math.log10(Math.max(1e-10, squares / (end - offset)))),
      speech: false, hz: null, clarity: null });
  }
  // A conservative floor removes digital silence and VAD hangover, not all
  // low-energy consonants. It is not a calibrated signal-to-noise estimate.
  const floor = quantile(frames.map(frame => frame.db), 0.1) ?? -100;
  const gateDb = Math.max(-65, Math.min(-60, floor + 6));
  const module = await (modulePromise ??= initializeFvad().catch(error => { modulePromise = undefined; throw error; }));
  const instance = module._fvad_new();
  const pointer = module._malloc(HOP * 2);
  // Condition only the VAD copy for very low device gain. Pitch, dBFS and quality
  // always use the original signal; this must not conceal quiet recordings.
  const vadGain = peak > 0 ? Math.max(1, Math.min(20, 0.2 / peak)) : 1;
  if (!instance || !pointer) {
    if (instance) module._fvad_free(instance);
    if (pointer) module._free(pointer);
    throw new Error("AUDIO_VAD_ALLOCATION");
  }
  try {
    if (module._fvad_set_mode(instance, 2) !== 0 || module._fvad_set_sample_rate(instance, SIGNAL_SAMPLE_RATE) !== 0) {
      throw new Error("AUDIO_VAD_CONFIG");
    }
    for (let i = 0; i < frames.length; i += 1) {
      const heap = module.HEAP16.subarray(pointer / 2, pointer / 2 + HOP);
      heap.fill(0);
      heap.set(samples.subarray(i * HOP, Math.min((i + 1) * HOP, samples.length)));
      if (vadGain > 1) for (let j = 0; j < HOP; j += 1) heap[j] = Math.round(heap[j] * vadGain);
      const result = module._fvad_process(instance, pointer, HOP);
      if (result < 0) throw new Error("AUDIO_VAD_PROCESS");
      frames[i].speech = result === 1 && frames[i].db > gateDb;
      if (i % 256 === 0) await setImmediate();
    }
  } finally {
    module._fvad_free(instance);
    module._free(pointer);
  }
  // Close only short internal gaps, never leading/trailing silence.
  for (let i = 1; i < frames.length; i += 1) {
    if (frames[i].speech || !frames[i - 1].speech) continue;
    let end = i;
    while (end < frames.length && !frames[end].speech) end += 1;
    if (end < frames.length && end - i <= MAX_GAP_FRAMES) {
      for (let j = i; j < end; j += 1) frames[j].speech = true;
    }
    i = end;
  }
  const detector = PitchDetector.forFloat32Array(PITCH_FRAME);
  const input = new Float32Array(PITCH_FRAME);
  let rejectedJumps = 0;
  let previous: { index: number; hz: number } | null = null;
  for (let i = 0; i < frames.length; i += 1) {
    if (performance.now() - started > 10000) throw new Error("AUDIO_SIGNAL_TIMEOUT");
    if (i % 128 === 0) await setImmediate();
    if (!frames[i].speech || frames[i].db <= gateDb) continue;
    const offset = i * HOP - Math.floor((PITCH_FRAME - HOP) / 2);
    if (offset < 0 || offset + PITCH_FRAME > sampleCount) continue;
    input.set(floats.subarray(offset, offset + PITCH_FRAME));
    let mean = 0;
    for (const value of input) mean += value / PITCH_FRAME;
    for (let j = 0; j < input.length; j += 1) input[j] -= mean;
    const [hz, clarity] = detector.findPitch(input, SIGNAL_SAMPLE_RATE);
    if (!Number.isFinite(hz) || !Number.isFinite(clarity) || hz < 60 || hz > 600 || clarity < 0.85) continue;
    // Reject isolated octave jumps instead of silently "correcting" the voice.
    if (previous && i - previous.index <= 2 && Math.abs(12 * Math.log2(hz / previous.hz)) > 9) {
      const nextOffset = offset + HOP;
      if (nextOffset + PITCH_FRAME <= sampleCount) {
        const [nextHz, nextClarity] = detector.findPitch(floats.subarray(nextOffset, nextOffset + PITCH_FRAME), SIGNAL_SAMPLE_RATE);
        if (nextClarity < 0.85 || Math.abs(12 * Math.log2(nextHz / hz)) > 3) { rejectedJumps += 1; continue; }
      }
    }
    frames[i].hz = hz;
    frames[i].clarity = clarity;
    previous = { index: i, hz };
  }
  const speech = frames.filter(frame => frame.speech);
  const speechSeconds = speech.reduce((sum, frame) => sum + frame.end - frame.start, 0);
  const pitchFrames = speech.filter(frame => frame.hz !== null);
  const reliableSeconds = pitchFrames.reduce((sum, frame) => sum + frame.end - frame.start, 0);
  const pitchCoverage = speechSeconds ? reliableSeconds / speechSeconds : 0;
  const p10 = quantile(pitchFrames.map(frame => frame.hz!), 0.1);
  const p90 = quantile(pitchFrames.map(frame => frame.hz!), 0.9);
  const clippingRatio = clipped / sampleCount;
  const speechMedianDb = quantile(speech.map(frame => frame.db), 0.5);
  const quiet = (speechMedianDb ?? quantile(frames.map(frame => frame.db), 0.9) ?? -100) < -42;
  const background = frames.filter(frame => !frame.speech);
  const possibleNoise = background.length * 0.02 >= 0.5 && background.length / frames.length > 0.2
    && (quantile(background.map(frame => frame.db), 0.5) ?? -100) > -35;
  const degraded = quiet || clippingRatio > 0.01 || possibleNoise;
  const speechStatus: AudioMeasurementStatus = speechSeconds < 2 ? "unavailable" : speechSeconds < 10 || degraded ? "limited" : "usable";
  const pitchStatus: AudioMeasurementStatus = reliableSeconds < 1 || pitchCoverage < 0.15 || clippingRatio > 0.05 ? "unavailable"
    : reliableSeconds < 3 || pitchCoverage < 0.4 || degraded ? "limited" : "usable";
  const intervals: AudioSignalAnalysis["pauses"]["intervals"] = [];
  const firstSpeech = frames.findIndex(frame => frame.speech);
  let lastSpeech = frames.length - 1;
  while (lastSpeech >= 0 && !frames[lastSpeech].speech) lastSpeech -= 1;
  for (let i = Math.max(0, firstSpeech); i <= lastSpeech; i += 1) {
    if (frames[i].speech) continue;
    const start = i;
    while (i <= lastSpeech && !frames[i].speech) i += 1;
    if (i - start >= MIN_PAUSE_FRAMES) intervals.push({ startSeconds: rounded(frames[start].start), endSeconds: rounded(frames[i - 1].end) });
  }
  const pausesMs = intervals.map(interval => (interval.endSeconds - interval.startSeconds) * 1000);
  const loudP10 = quantile(speech.map(frame => frame.db), 0.1);
  const loudP90 = quantile(speech.map(frame => frame.db), 0.9);
  const timeline: AudioSignalAnalysis["timeline"] = [];
  for (let start = 0; start < duration; start += 5) {
    const end = Math.min(start + 5, duration);
    const local = speech.filter(frame => frame.start >= start && frame.start < end);
    const localPitch = local.filter(frame => frame.hz !== null);
    const localSeconds = local.reduce((sum, frame) => sum + frame.end - frame.start, 0);
    const pitchEnough = localPitch.length >= 25;
    timeline.push({ startSeconds: start, endSeconds: rounded(end), speechSeconds: rounded(localSeconds),
      pitchMedianHz: pitchEnough && pitchStatus !== "unavailable" ? nullableRound(quantile(localPitch.map(frame => frame.hz!), 0.5)) : null,
      pitchRangeSemitones: pitchEnough && pitchStatus !== "unavailable" ? semitones(quantile(localPitch.map(frame => frame.hz!), 0.1), quantile(localPitch.map(frame => frame.hz!), 0.9)) : null,
      loudnessMedianDbfs: localSeconds >= 0.5 ? nullableRound(quantile(local.map(frame => frame.db), 0.5)) : null,
      pauseCount: intervals.filter(interval => interval.startSeconds >= start && interval.startSeconds < end).length,
      status: localSeconds < 0.5 ? "unavailable" : localSeconds < 2 || degraded ? "limited" : "usable" });
  }
  return {
    version: "acoustics-v1", method: { vad: "webrtc-vad", pitch: "mcleod", frameMs: 20, pitchFrameMs: 64 },
    durationSeconds: rounded(duration), speechSeconds: rounded(speechSeconds), speechCoverage: rounded(speechSeconds / duration, 3),
    pauses: { status: speechStatus, count: intervals.length, medianMs: nullableRound(quantile(pausesMs, 0.5), 0),
      p90Ms: nullableRound(quantile(pausesMs, 0.9), 0), longestMs: pausesMs.length ? Math.round(Math.max(...pausesMs)) : null,
      perMinute: lastSpeech > firstSpeech ? rounded(intervals.length * 60 / (frames[lastSpeech].end - frames[firstSpeech].start)) : null,
      leadingSilenceMs: firstSpeech < 0 ? Math.round(duration * 1000) : Math.round(frames[firstSpeech].start * 1000),
      trailingSilenceMs: lastSpeech < 0 ? 0 : Math.round((duration - frames[lastSpeech].end) * 1000), intervals },
    pitch: { status: pitchStatus, medianHz: pitchStatus === "unavailable" ? null : nullableRound(quantile(pitchFrames.map(frame => frame.hz!), 0.5)),
      p10Hz: pitchStatus === "unavailable" ? null : nullableRound(p10), p90Hz: pitchStatus === "unavailable" ? null : nullableRound(p90),
      rangeSemitones: pitchStatus === "unavailable" ? null : semitones(p10, p90), reliableSeconds: rounded(reliableSeconds),
      speechCoverage: rounded(pitchCoverage, 3), medianClarity: nullableRound(quantile(pitchFrames.map(frame => frame.clarity!), 0.5), 3), rejectedJumpFrames: rejectedJumps },
    loudness: { status: speechStatus, medianDbfs: speechStatus === "unavailable" ? null : nullableRound(speechMedianDb),
      p10Dbfs: speechStatus === "unavailable" ? null : nullableRound(loudP10), p90Dbfs: speechStatus === "unavailable" ? null : nullableRound(loudP90),
      rangeDb: speechStatus !== "unavailable" && loudP10 !== null && loudP90 !== null ? rounded(loudP90 - loudP10) : null,
      clippingRatio: rounded(clippingRatio, 4) }, timeline,
    warnings: [...(speechSeconds < 10 ? ["short_speech" as const] : []), ...(quiet ? ["quiet_signal" as const] : []),
      ...(clippingRatio > 0.01 ? ["clipping" as const] : []), ...(pitchCoverage < 0.4 ? ["low_pitch_coverage" as const] : []),
      ...(possibleNoise ? ["possible_background_noise" as const] : [])]
  };
}
