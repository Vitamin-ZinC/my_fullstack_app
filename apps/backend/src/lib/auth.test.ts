import assert from "node:assert/strict";
import test from "node:test";
import type { FastifyRequest } from "fastify";

process.env.DATABASE_URL ||= "postgresql://levelup:dev_password@localhost:5432/levelup";

const { hashAdminPassword, verifyAdminPassword, getOptionalSession } = await import("./auth.js");
const { prisma } = await import("./prisma.js");

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

test("changing UI language preserves session identity and never writes to the database", async (context) => {
  const stored = { id: "session", guestToken: "token", userId: "user", locale: "ru" };
  const originalFind = prisma.session.findFirst;
  const originalUpdate = prisma.session.update;
  prisma.session.findFirst = context.mock.fn(async () => stored) as unknown as typeof originalFind;
  prisma.session.update = context.mock.fn(() => { throw new Error("Language negotiation must be read-only"); }) as typeof originalUpdate;
  context.after(() => { prisma.session.findFirst = originalFind; prisma.session.update = originalUpdate; });
  const request = (locale?: string) => ({ headers: { "x-session-id": "session", "x-guest-token": "token", ...(locale ? { "x-locale": locale } : {}) } } as unknown as FastifyRequest);
  assert.deepEqual(await getOptionalSession(request("en-US")), { ...stored, locale: "en" });
  assert.deepEqual(await getOptionalSession(request("../../en")), stored);
  assert.deepEqual(await getOptionalSession(request()), stored);
  assert.equal(stored.locale, "ru");
});
