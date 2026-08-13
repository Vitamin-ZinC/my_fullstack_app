import assert from "node:assert/strict";
import test from "node:test";
import { buildDemoWorkspace, hashDemoValue, normalizeDemoAccessCode } from "./demoAccess.js";

test("demo access code normalization is stable and case-insensitive", () => {
  assert.equal(normalizeDemoAccessCode("  orken-demo-abcd-1234  "), "ORKEN-DEMO-ABCD-1234");
  assert.equal(
    hashDemoValue("code", normalizeDemoAccessCode("orken-demo-abcd-1234")),
    hashDemoValue("code", normalizeDemoAccessCode(" ORKEN-DEMO-ABCD-1234 "))
  );
});

test("demo workspace contains only marked synthetic coach and client fixtures", () => {
  const workspace = buildDemoWorkspace();
  assert.equal(workspace.synthetic, true);
  assert.ok(workspace.coach.clients.length >= 5);
  assert.ok(workspace.coach.selectedClient.metrics.length >= 14);
  assert.ok(workspace.client.feedback.length >= 1);
  assert.ok(workspace.client.habits.some((habit) => habit.assignedByCoach));
});
