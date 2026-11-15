# Audio Signal Analysis

## Scope and data flow

Backend-only DSP runs after transcription alongside photo preparation. No new
external processor, account, endpoint, analytics SDK or database table is added.
`audioMetrics.ts` decodes the unprocessed source to mono 16 kHz PCM. Decoded
duration overrides untrusted client/ASR duration. WebRTC VAD (BSD-3-Clause,
`@echogarden/fvad-wasm` 0.2.0) supplies speech decisions; Pitchy 4.1.0 (MIT)
supplies McLeod pitch estimates. Dependency licenses remain in the packages.

`audioSignal.ts` aggregates measurements, not psychological diagnoses. A quiet
recording is not low personal energy. No voice identity, emotion classifier,
health, deception or aptitude scoring is introduced.

## Measurement definitions

- VAD: 20 ms frames at 16 kHz, mode 2. A bounded gain adjustment is applied only
  to the VAD copy for low device gain; all levels, clipping and F0 use original PCM.
- Internal gaps of at most 100 ms are joined. Count pauses from 200 ms, excluding
  leading/trailing silence. Boundaries are VAD estimates, not sample-accurate
  linguistic annotations. These thresholds are versioned product parameters.
- F0: 64 ms centered frames, 20 ms hop, DC removed. Keep 60-600 Hz and clarity
  at least 0.85; reject isolated octave-like jumps. Report median, P10, P90 and
  `12 * log2(P90 / P10)` semitones. Do not classify voice by sex or personality.
- Clarity measures periodicity; speech coverage measures eligible frame duration.
  Neither is a calibrated probability of correctness or a personal trait.
- Loudness: original speech-frame RMS in dBFS, robust percentiles, P10-P90 span,
  and clipping ratio. Not calibrated dB SPL. Gain, distance, compression and browser
  AGC/noise suppression can alter these measurements.
- Timeline: non-overlapping five-second aggregates with exact start/end labels;
  final partial interval retained. Missing F0 is null, never connected across gaps.
  No word/topic alignment or inference of emotional cause is claimed.

## Eligibility and limits

Speech-dependent summaries need at least two seconds of speech; under ten seconds
is limited. F0 needs at least one second of reliable frames and 15% speech coverage;
under three seconds or 40% coverage is limited. Quiet speech below -42 dBFS,
clipping above 1%, or a conservative background-level warning downgrade eligibility.
Clipping above 5% disables F0 summaries. Timeline pitch needs 0.5 seconds of valid
frames per interval. Status names are technical eligibility, not validated accuracy.

Decode is bounded to 180 seconds, about 5.8 MB PCM, and 15 seconds wall time;
overflow or longer audio is rejected for metrics rather than silently truncated.
DSP has a ten-second deadline and yields between batches. Each concurrent call
has its own VAD state and frees its WASM allocations. Failure preserves report
generation, but suppresses detailed acoustics and ASR-derived pause claims.

## Reports and compatibility

`VoiceSignalMetrics.acoustics` is sent to report prompts. FREE templates v7 and
FULL v12, plus the always-appended runtime policy, distinguish measured delivery
from self-report and enforce null/status handling even for older admin overrides.

Only backend DSP output is attached to optional `ReportFull.audio_analysis` after
LLM JSON parsing. It is stored in the existing private report JSON and validated
on read. The model schema cannot author this field. The paid-report access gate
is unchanged. The RU/EN measurement panel displays actual metrics and timeline;
old reports without measurements remain unchanged and gain no synthetic charts.
No automatic regeneration, migration, XP or subscription change is required.

## Verification and release

Synthetic tests cover known harmonic F0, frequency ramp, internal/edge silence,
gain, clipping, noise, concurrent state, duration bounds and report round trips.
The production image additionally exercises actual ffmpeg encode/decode and checks
that bogus client/ASR duration and pause claims do not override PCM/VAD.
These tests are not a clinical validation or a multilingual human-speech benchmark.
Before claiming measurement accuracy, evaluate a consented, manually annotated
RU/EN/KZ sample across devices, noise and browser processing.

Run backend lint/build/tests, frontend lint/build, browser RU/EN regression tests,
and dependency audit. Verify WASM on the actual production CPU (no SIMD required).
Back up DB/uploads, retain rollback images, deploy pinned SHA with migrations and
global Docker pruning disabled, then smoke health, new prompt versions and public
routes. Existing report JSON is additive and remains readable after rollback.
