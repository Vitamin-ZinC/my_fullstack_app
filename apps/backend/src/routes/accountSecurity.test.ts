import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { Resolver } from "node:dns/promises";
import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";
process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:1/test";
process.env.APP_ORIGIN = "https://orken.example";
process.env.RESEND_API_KEY = "synthetic-email-provider-key";
const { prisma } = await import("../lib/prisma.js");
const { authRoutes } = await import("./auth.js");
const { verifyPassword } = await import("../lib/auth.js");
const { deliverWelcomeEmail, hashAccountToken } = await import("../services/accountEmail.js");

async function harness(t: TestContext) {
  const state = { user: null as any, tokens: [] as any[], messages: [] as any[], mailDomainAccepts: true, attachSessionIds: [] as string[], session: { id: "guest", guestToken: "old-guest-token", userId: null as string | null, locale: "ru", expiresAt: new Date(Date.now() + 86400000) }, expiredSessions: false, creates: 0 };
  const stub = (object: any, key: string, fn: any) => { const before = object[key]; object[key] = fn; t.after(() => object[key] = before); };
  const matches = (row: any, where: any) => (!where.id || row.id === where.id) && (!where.email || row.email === where.email) && (!where.purpose || row.purpose === where.purpose) && (!where.tokenHash || row.tokenHash === where.tokenHash) && (where.consumedAt !== null || row.consumedAt === null) && (!where.expiresAt?.gt || row.expiresAt > where.expiresAt.gt) && (!where.createdAt?.gt || row.createdAt > where.createdAt.gt);
  stub(Resolver.prototype, "resolveMx", async () => state.mailDomainAccepts ? [{ priority: 10, exchange: "mx.example.com" }] : [{ priority: 0, exchange: "." }]);
  stub(globalThis, "fetch", async (_url: unknown, init: any) => { state.messages.push({ ...JSON.parse(init.body), key: init.headers["Idempotency-Key"] }); return new Response(JSON.stringify({ id: "email" }), { status: 200 }); });
  stub(prisma, "$transaction", async (fn: any) => fn(prisma));
  stub(prisma.session, "create", async () => ({ ...state.session, id: state.session.userId ? "fresh-session" : state.session.id, userId: null }));
  stub(prisma.session, "findFirst", async () => state.session);
  stub(prisma.session, "update", async ({ where, data }: any) => where.id === state.session.id ? Object.assign(state.session, data) : { id: where.id, ...data });
  stub(prisma.session, "updateMany", async () => { state.expiredSessions = true; return { count: 1 }; });
  stub(prisma.user, "findUnique", async ({ where }: any) => state.user && (where.id === state.user.id || where.email === state.user.email) ? { ...state.user } : null);
  stub(prisma.user, "create", async ({ data }: any) => {
    state.creates++;
    state.user = { id: "user", name: null, role: "USER", status: "ACTIVE", emailVerifiedAt: null, welcomeEmailSentAt: null, createdAt: new Date(), ...data };
    return { ...state.user };
  });
  stub(prisma.user, "update", async ({ data }: any) => { Object.assign(state.user, data); return { ...state.user }; });
  stub(prisma.user, "updateMany", async ({ where, data }: any) => {
    if (where.welcomeEmailSentAt === null && hSent()) return { count: 0 };
    if (where.welcomeEmailPendingAt?.lte && state.user.welcomeEmailPendingAt > where.welcomeEmailPendingAt.lte) return { count: 0 };
    Object.assign(state.user, data); return { count: 1 };
  });
  function hSent() { return Boolean(state.user?.welcomeEmailSentAt); }
  stub(prisma.loginToken, "count", async ({ where }: any) => state.tokens.filter(row => matches(row, where)).length);
  stub(prisma.loginToken, "create", async ({ data }: any) => { const row = { id: `token-${state.tokens.length}`, createdAt: new Date(), consumedAt: null, ...data }; state.tokens.push(row); return row; });
  stub(prisma.loginToken, "findFirst", async ({ where }: any) => state.tokens.find(row => matches(row, where)) ?? null);
  stub(prisma.loginToken, "updateMany", async ({ where, data }: any) => { const rows = state.tokens.filter(row => matches(row, where)); rows.forEach(row => Object.assign(row, data)); return { count: rows.length }; });
  stub(prisma.analysis, "findMany", async ({ where }: any) => { state.attachSessionIds.push(where.sessionId); return []; });
  for (const model of [prisma.analysis, prisma.analyticsEvent, prisma.habitProgram, prisma.habitNavigatorThread]) stub(model, "updateMany", async () => ({ count: 0 }));
  stub(prisma.analyticsEvent, "create", async () => ({}));
  const app = Fastify(); t.after(() => app.close());
  await app.register(rateLimit, { max: 120 }); await app.register(authRoutes); await app.ready();
  const post = (url: string, payload: unknown, headers?: Record<string, string>) => app.inject({ method: "POST", url, payload: payload as any, headers });
  const lastToken = (kind: string) => {
    const email = state.messages.filter(row => row.tags?.some((tag: any) => tag.value === `account_${kind}`)).at(-1);
    const url = new URL(email.text.split("\n").at(-1));
    return new URLSearchParams(url.hash.slice(1)).get("token")!;
  };
  const flush = () => new Promise<void>(resolve => setImmediate(resolve));
  return { state, app, post, lastToken, flush };
}

test("registration is unverified but usable; confirmation is single-use and welcome requires ownership", async t => {
  const h = await harness(t);
  const response = await h.post("/api/auth/register", { email: "Person@Example.com", password: "original-password" });
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.json().user.email, "person@example.com");
  assert.equal(response.json().user.emailVerifiedAt, null);
  assert.notEqual(response.json().guestToken, "old-guest-token");
  await h.flush();
  assert.equal(h.state.messages.filter(row => row.tags.some((tag: any) => tag.value === "account_welcome")).length, 0);
  const token = h.lastToken("verify");
  assert.equal(h.state.tokens[0].tokenHash, hashAccountToken(token));
  assert.doesNotMatch(response.body, new RegExp(token));
  assert.equal((await h.post("/api/auth/email/verification/confirm", { token })).statusCode, 200);
  await h.flush();
  assert.ok(h.state.user.emailVerifiedAt);
  assert.ok(h.state.user.welcomeEmailSentAt);
  assert.equal((await h.post("/api/auth/email/verification/confirm", { token })).statusCode, 400);
  assert.equal(h.state.messages.filter(row => row.tags.some((tag: any) => tag.value === "account_welcome")).length, 1);
  assert.doesNotMatch(JSON.stringify(h.state.messages), /original-password|passwordHash/);
});

test("reset request is neutral, password changes only on valid purpose/expiry and invalidates old sessions", async t => {
  const h = await harness(t);
  const missing = await h.post("/api/auth/password/reset/request", { email: "missing@example.com" });
  h.state.user = { id: "user", email: "person@example.com", locale: "en", status: "ACTIVE", emailVerifiedAt: new Date(), passwordHash: "old", welcomeEmailPendingAt: null };
  const existing = await h.post("/api/auth/password/reset/request", { email: "person@example.com" });
  assert.equal(existing.statusCode, missing.statusCode); assert.equal(existing.body, missing.body);
  assert.equal(h.state.user.passwordHash, "old");
  await h.flush(); const token = h.lastToken("reset");
  assert.equal((await h.post("/api/auth/email/verification/confirm", { token })).statusCode, 400);
  h.state.tokens[0].expiresAt = new Date(0);
  assert.equal((await h.post("/api/auth/password/reset/confirm", { token, password: "replacement-password" })).statusCode, 400);
  h.state.tokens[0].expiresAt = new Date(Date.now() + 60000);
  assert.equal((await h.post("/api/auth/password/reset/confirm", { token, password: "replacement-password" })).statusCode, 200);
  assert.equal(verifyPassword("replacement-password", h.state.user.passwordHash), true);
  assert.equal(h.state.expiredSessions, true);
  assert.equal((await h.post("/api/auth/password/reset/confirm", { token, password: "replacement-password" })).statusCode, 400);
  await h.flush(); assert.doesNotMatch(JSON.stringify(h.state.messages), /replacement-password/);
});

test("registration never overwrites existing passwordless accounts and domain/schema errors are safe", async t => {
  const h = await harness(t);
  h.state.user = { id: "protected", email: "person@example.com", passwordHash: null, status: "ACTIVE" };
  const existing = await h.post("/api/auth/register", { email: "PERSON@example.com", password: "attacker-password" });
  assert.equal(existing.statusCode, 409); assert.equal(h.state.creates, 0); assert.equal(h.state.user.passwordHash, null);
  const invalid = await h.post("/api/auth/register", { email: "bad", password: "raw-secret" });
  assert.equal(invalid.statusCode, 400); assert.doesNotMatch(invalid.body, /raw-secret|ZodError|stack/);
  const crossOrigin = await h.post("/api/auth/login", { email: "person@example.com", password: "attacker-password" }, { origin: "https://evil.example" });
  assert.equal(crossOrigin.statusCode, 403);
  h.state.user = null;
  h.state.mailDomainAccepts = false;
  assert.equal((await h.post("/api/auth/register", { email: "person@example.com", password: "long-enough-password" })).statusCode, 400);
});

test("switching accounts never reassigns another user's session or private report history", async t => {
  const h = await harness(t);
  h.state.session.userId = "previous-user";
  const response = await h.post("/api/auth/register", { email: "new@example.com", password: "new-user-password" }, { "x-session-id": "guest", "x-guest-token": "old-guest-token" });
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.json().sessionId, "fresh-session");
  assert.equal(h.state.session.userId, "previous-user");
  assert.deepEqual(h.state.attachSessionIds, ["fresh-session"]);
});

test("only one concurrent verification wins and welcome retries are claimed without duplicate mail", async t => {
  const h = await harness(t);
  assert.equal((await h.post("/api/auth/register", { email: "person@example.com", password: "long-enough-password" })).statusCode, 200);
  await h.flush(); const token = h.lastToken("verify");
  const replies = await Promise.all([h.post("/api/auth/email/verification/confirm", { token }), h.post("/api/auth/email/verification/confirm", { token })]);
  assert.deepEqual(replies.map(reply => reply.statusCode).sort(), [200, 400]);
  await h.flush();
  assert.equal(h.state.messages.filter(row => row.tags.some((tag: any) => tag.value === "account_welcome")).length, 1);
});

test("legacy verified users are not enrolled in welcome campaigns and public reset is rate limited", async t => {
  const h = await harness(t);
  h.state.user = { id: "legacy", email: "legacy@example.com", locale: "ru", status: "ACTIVE", emailVerifiedAt: new Date(), welcomeEmailPendingAt: null, welcomeEmailSentAt: null };
  await deliverWelcomeEmail("legacy"); assert.equal(h.state.messages.length, 0);
  for (let i = 0; i < 5; i++) assert.equal((await h.post("/api/auth/password/reset/request", { email: "missing@example.com" })).statusCode, 200);
  assert.equal((await h.post("/api/auth/password/reset/request", { email: "missing@example.com" })).statusCode, 429);
});
