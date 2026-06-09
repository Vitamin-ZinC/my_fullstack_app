import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL ||= "postgresql://levelup:dev_password@localhost:5432/levelup";

const { hashAdminPassword, verifyAdminPassword } = await import("./auth.js");

test("admin password hash verifies the original password", () => {
  const storedHash = hashAdminPassword("correct horse battery staple", "0123456789abcdef");

  assert.equal(verifyAdminPassword("correct horse battery staple", storedHash), true);
});

test("admin password hash rejects an incorrect password", () => {
  const storedHash = hashAdminPassword("correct horse battery staple", "0123456789abcdef");

  assert.equal(verifyAdminPassword("wrong password", storedHash), false);
});

test("admin password verifier rejects malformed hashes", () => {
  assert.equal(verifyAdminPassword("password", "not-a-valid-hash"), false);
});
