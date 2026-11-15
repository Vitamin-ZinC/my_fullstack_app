import assert from "node:assert/strict";
import test from "node:test";
import { analyzeSignalPcm, MAX_SIGNAL_SECONDS, quantile, SIGNAL_SAMPLE_RATE } from "./audioSignal.js";
import { audioSignalSchema } from "./audioSignalSchema.js";
import { analyzeAudioMetrics } from "./audioMetrics.js";
import { spawnSync } from "node:child_process";

type Part = { seconds: number; hz?: number; gain?: number; noise?: number; endHz?: number };
function signal(parts: Part[]) {
  const output = Buffer.alloc(Math.round(parts.reduce((sum, part) => sum + part.seconds, 0) * SIGNAL_SAMPLE_RATE) * 2);
  let offset = 0;
  let phase = 0;
  let seed = 17;
  for (const part of parts) {
    const count = Math.round(part.seconds * SIGNAL_SAMPLE_RATE);
    for (let i = 0; i < count; i += 1) {
      const time = i / SIGNAL_SAMPLE_RATE;
      const frequency = (part.hz ?? 0) + ((part.endHz ?? part.hz ?? 0) - (part.hz ?? 0)) * i / count;
      phase += 2 * Math.PI * (frequency + (part.hz ? 2 * Math.sin(2 * Math.PI * 4 * time) : 0)) / SIGNAL_SAMPLE_RATE;
      const envelope = Math.min(1, time / 0.03, (part.seconds - time) / 0.03) * (0.75 + 0.25 * Math.sin(2 * Math.PI * 3.1 * time));
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
      const random = seed / 2147483648;
      const wave = part.hz ? (Math.sin(phase) + 0.4 * Math.sin(2 * phase) + 0.2 * Math.sin(3 * phase)) * envelope * (part.gain ?? 0.2) : 0;
      output.writeInt16LE(Math.round(Math.max(-1, Math.min(0.99997, wave + random * (part.noise ?? 0))) * 32768), offset * 2);
      offset += 1;
    }
  }
  return output;
}

test("silence has no pitch, speech loudness or invented internal pauses", async () => {
  const value = await analyzeSignalPcm(signal([{ seconds: 3 }]));
  assert.equal(value.speechSeconds, 0);
  assert.equal(value.pitch.status, "unavailable");
  assert.equal(value.pitch.medianHz, null);
  assert.equal(value.loudness.medianDbfs, null);
  assert.equal(value.pauses.count, 0);
  assert.equal(value.pauses.leadingSilenceMs, 3000);
  assert.ok(value.timeline.every(window => window.status === "unavailable"));
});

test("measures harmonic F0 and internal pause without counting edge silence", async () => {
  const value = await analyzeSignalPcm(signal([
    { seconds: 1 }, { seconds: 4, hz: 180 }, { seconds: 1 }, { seconds: 4, hz: 180 }, { seconds: 1 }
  ]));
  assert.ok(value.pitch.medianHz !== null && Math.abs(value.pitch.medianHz - 180) < 4, JSON.stringify(value));
  assert.ok(value.pitch.rangeSemitones !== null && value.pitch.rangeSemitones < 1);
  assert.equal(value.pauses.count, 1);
  assert.ok(value.pauses.medianMs! >= 800 && value.pauses.medianMs! <= 1200);
  assert.ok(value.pauses.leadingSilenceMs >= 900);
  assert.ok(value.pauses.trailingSilenceMs >= 900);
  assert.ok(value.speechSeconds >= 7.5 && value.speechSeconds <= 8.5);
});

test("pitch contour tracks a frequency ramp and preserves actual window timestamps", async () => {
  const value = await analyzeSignalPcm(signal([{ seconds: 12, hz: 120, endHz: 240 }]));
  assert.equal(value.timeline.length, 3);
  assert.equal(value.timeline[2].endSeconds, 12);
  assert.ok(value.pitch.rangeSemitones! > 7 && value.pitch.rangeSemitones! < 12);
  assert.ok(value.timeline[1].pitchMedianHz! > value.timeline[0].pitchMedianHz! + 25);
});

test("gain changes affect dBFS but not F0, and quiet speech is qualified", async () => {
  const normal = await analyzeSignalPcm(signal([{ seconds: 5, hz: 220, gain: 0.2 }]));
  const quiet = await analyzeSignalPcm(signal([{ seconds: 5, hz: 220, gain: 0.006 }]));
  assert.ok(quiet.warnings.includes("quiet_signal"));
  assert.notEqual(quiet.pitch.status, "usable");
  assert.ok(Math.abs(normal.pitch.medianHz! - quiet.pitch.medianHz!) < 3);
  assert.ok(normal.loudness.medianDbfs! - quiet.loudness.medianDbfs! > 25);
});

test("clipping gates pitch, short signals never receive usable status", async () => {
  const clipped = await analyzeSignalPcm(signal([{ seconds: 4, hz: 170, gain: 2 }]));
  assert.ok(clipped.warnings.includes("clipping"));
  assert.equal(clipped.pitch.status, "unavailable");
  assert.equal(clipped.pitch.medianHz, null);
  const short = await analyzeSignalPcm(signal([{ seconds: 0.3, hz: 180 }]));
  assert.equal(short.pitch.status, "unavailable");
  assert.notEqual(short.pauses.status, "usable");
});

test("aperiodic noise never receives a reliable F0", async () => {
  const value = await analyzeSignalPcm(signal([{ seconds: 5, noise: 0.15 }]));
  assert.equal(value.pitch.status, "unavailable");
  assert.equal(value.pitch.medianHz, null);
});

test("PCM length is bounded and percentiles are robust against extrema", async () => {
  assert.equal(quantile([100, 110, 120, 130, 10000], 0.5), 120);
  assert.equal(quantile([], 0.5), null);
  await assert.rejects(analyzeSignalPcm(Buffer.alloc(0)), /LENGTH/);
  await assert.rejects(analyzeSignalPcm(Buffer.alloc(3)), /LENGTH/);
  await assert.rejects(analyzeSignalPcm(Buffer.alloc((MAX_SIGNAL_SECONDS * SIGNAL_SAMPLE_RATE + 1) * 2)), /LENGTH/);
});

test("measured data survives report storage normalization without changing legacy reports", async () => {
  process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:1/orken_tests";
  const { normalizeFullReportValue } = await import("./aiReport.js");
  const measured = await analyzeSignalPcm(signal([{ seconds: 5, hz: 190 }]));
  assert.ok(audioSignalSchema.safeParse(measured).success);
  const legacy = { profession: "Researcher", summary: "A practical research direction based on your own story." };
  const stored = JSON.parse(JSON.stringify({ ...legacy, audio_analysis: measured }));
  assert.deepEqual(normalizeFullReportValue(stored, "en").audio_analysis, measured);
  assert.equal(normalizeFullReportValue(legacy, "en").audio_analysis, undefined);
  assert.equal(normalizeFullReportValue({ ...legacy, audio_analysis: { ...measured, durationSeconds: Infinity } }, "en").audio_analysis, undefined);
  assert.equal(JSON.stringify(stored.audio_analysis), JSON.stringify(measured));
});

test("concurrent analyses have independent VAD state", async () => {
  const [first, second] = await Promise.all([
    analyzeSignalPcm(signal([{ seconds: 4, hz: 150 }])),
    analyzeSignalPcm(signal([{ seconds: 4, hz: 300 }]))
  ]);
  assert.ok(Math.abs(first.pitch.medianHz! - 150) < 4);
  assert.ok(Math.abs(second.pitch.medianHz! - 300) < 4);
});

const ffmpegAvailable = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;
test("production decoder uses PCM duration and VAD instead of client or ASR pause claims", { skip: !ffmpegAvailable }, async () => {
  const pcm = signal([{ seconds: 3, hz: 180 }, { seconds: 1 }, { seconds: 3, hz: 180 }]);
  const wav = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "s16le", "-ar", "16000", "-ac", "1", "-i", "pipe:0", "-f", "wav", "pipe:1"], { input: pcm, maxBuffer: 1024 * 1024 });
  assert.equal(wav.status, 0);
  const value = await analyzeAudioMetrics(wav.stdout, { text: "one two three four five six", durationSeconds: 999, segments: [{ start: 0, end: 999 }] }, 999);
  assert.equal(value.durationSeconds, 7);
  assert.equal(value.pauseSource, "webrtc-vad");
  assert.equal(value.pauseCount, 1);
  assert.ok(value.activeSpeechSeconds! < 6.5);
  assert.equal(value.speechRateLabel, null);
  assert.ok(value.acoustics?.pitch.medianHz);
  const invalid = await analyzeAudioMetrics(Buffer.from("not an audio file"), null);
  assert.equal(invalid.acoustics, null);
  assert.equal(invalid.pauseCount, null);
});
