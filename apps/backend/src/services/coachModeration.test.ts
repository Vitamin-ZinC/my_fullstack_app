import assert from "node:assert/strict";
import test from "node:test";
import { coachOfferModerationSchema, coachProfileModerationSchema } from "./coachModeration.js";

test("negative moderation decisions require a non-empty reason for the coach", () => {
  for (const schema of [coachProfileModerationSchema, coachOfferModerationSchema]) {
    for (const status of ["DRAFT", "REJECTED"]) {
      for (const moderationNote of [undefined, null, "", "   "]) assert.equal(schema.safeParse({ status, moderationNote }).success, false);
      assert.equal(schema.parse({ status, moderationNote: "  Correct the description  " }).moderationNote, "Correct the description");
    }
    assert.equal(schema.safeParse({ status: "REJECTED", moderationNote: "x".repeat(1001) }).success, false);
  }
  assert.equal(coachProfileModerationSchema.safeParse({ status: "SUSPENDED" }).success, false);
  assert.equal(coachOfferModerationSchema.safeParse({ status: "PAUSED" }).success, false);
});

test("approval clears old moderation comments and rejects unknown statuses or invalid shares", () => {
  assert.equal(coachProfileModerationSchema.parse({ status: "APPROVED", moderationNote: "Old reason" }).moderationNote, null);
  assert.equal(coachOfferModerationSchema.parse({ status: "APPROVED" }).moderationNote, null);
  assert.equal(coachOfferModerationSchema.safeParse({ status: "APPROVED", coachShareBps: 10001 }).success, false);
  assert.equal(coachProfileModerationSchema.safeParse({ status: "PAUSED", moderationNote: "Reason" }).success, false);
});
