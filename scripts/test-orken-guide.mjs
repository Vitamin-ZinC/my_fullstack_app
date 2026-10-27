import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const store = () => {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
};
const localStorage = store();
const sessionStorage = store();
const window = { localStorage, sessionStorage, dispatchEvent: () => {} };
const exports = {};
const source = fs.readFileSync("apps/frontend/lib/orkenGuide.ts", "utf8");
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
  { exports, window, CustomEvent: class {}, Date });
const { guideIsDue, guidePreferenceKey, readGuidePreference, saveGuidePreference, localGuideDay } = exports;
const morning = new Date(2026, 9, 27, 9, 0);
const afternoon = new Date(2026, 9, 27, 15, 0);
const yesterday = new Date(2026, 9, 26, 9, 0).getTime();
const fresh = { disabled: false, lastShownAt: 0 };
const seen = { disabled: false, lastShownAt: yesterday };

for (const context of ["landing", "user", "coach", "partner"]) {
  assert.equal(guideIsDue(context, fresh, afternoon), true, `${context}: first visit works at any time`);
  assert.equal(guideIsDue(context, { ...fresh, disabled: true }, morning), false);
  assert.equal(guideIsDue(context, { ...seen, lastShownAt: morning.getTime() }, afternoon), false, `${context}: no repeat today`);
}
assert.equal(guideIsDue("landing", seen, morning), false, "landing repeats only in a new browser session");
assert.equal(guideIsDue("user", seen, morning), true);
assert.equal(guideIsDue("user", seen, afternoon), false, "daily user tip only in the morning");
assert.equal(guideIsDue("coach", seen, afternoon), true);
assert.equal(guideIsDue("partner", seen, afternoon), true);
assert.equal(localGuideDay(new Date(2026, 9, 27, 0, 1)), "2026-10-27", "local day, not UTC");

const userKey = guidePreferenceKey("user", "synthetic-program");
const otherUserKey = guidePreferenceKey("user", "another-program");
const coachKey = guidePreferenceKey("coach", "synthetic-program");
saveGuidePreference("user", userKey, seen);
assert.equal(readGuidePreference("user", userKey).lastShownAt, yesterday);
assert.equal(readGuidePreference("user", otherUserKey).lastShownAt, 0, "no preference leaks across accounts");
assert.equal(readGuidePreference("coach", coachKey).lastShownAt, 0, "no preference leaks across roles");
assert.equal(sessionStorage.getItem(userKey), null);
const landingKey = guidePreferenceKey("landing", "public");
saveGuidePreference("landing", landingKey, seen);
assert.ok(sessionStorage.getItem(landingKey));
assert.equal(localStorage.getItem(landingKey), null);

for (const raw of ["{", "null", "42", '{"lastShownAt":"invalid"}', '{"lastShownAt":-1}']) {
  localStorage.setItem(otherUserKey, raw);
  assert.equal(readGuidePreference("user", otherUserKey).lastShownAt, 0, `invalid preference: ${raw}`);
}
const unavailable = { getItem() { throw new Error("Storage blocked"); }, setItem() { throw new Error("Storage full"); } };
window.localStorage = unavailable;
window.sessionStorage = unavailable;
for (const context of ["landing", "user", "coach", "partner"]) {
  const key = guidePreferenceKey(context, "blocked-storage");
  assert.equal(readGuidePreference(context, key).disabled, false);
  saveGuidePreference(context, key, { disabled: true, lastShownAt: morning.getTime() });
  assert.equal(readGuidePreference(context, key).disabled, true);
}
console.log("ORKEN Guide passed: scheduling, morning/local day, scope isolation, session preferences, corrupt and blocked storage");
