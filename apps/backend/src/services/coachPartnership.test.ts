import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

process.env.DATABASE_URL ??= "postgresql://levelup:dev_password@localhost:5432/levelup";

test("coach material tokens are opaque and only hashes are persisted", async () => {
  const { createCoachMaterialToken, hashCoachMaterialToken } = await import("./coachPartnership.js");
  const token = createCoachMaterialToken();
  assert.match(token, /^[A-Za-z0-9_-]{40,80}$/);
  assert.equal(hashCoachMaterialToken(token).length, 64);
  assert.notEqual(hashCoachMaterialToken(token), token);
  assert.notEqual(createCoachMaterialToken(), token);
});

test("closed coach material contains the agreed economics and marketplace rules", async () => {
  const { buildCoachPartnershipMaterial } = await import("./coachPartnership.js");
  const material = buildCoachPartnershipMaterial({
    expiresAt: new Date("2026-08-18T00:00:00.000Z"),
    referralRateBps: 1000,
    termsVersion: "coach-v1"
  });
  assert.equal(material.referral.rate, "10%");
  assert.equal(material.personal.rate, "50%");
  assert.match(material.personal.standardSlotLimit, /10/);
  assert.equal(material.visibilityRules.length, 4);
  assert.equal(material.wholesale.length, 5);
});

test("public coaches frontend does not contain closed rates or receipt amounts", () => {
  const source = readFileSync(new URL("../../../frontend/app/coaches/CoachesLandingClient.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\b10\s*%|\b50\s*%/);
  assert.doesNotMatch(source, /\$\s*\d/);
  assert.match(source, /Точные ставки.*отправляются только/);
});
