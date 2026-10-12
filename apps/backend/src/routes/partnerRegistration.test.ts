import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import Fastify from "fastify";
import cookie from "@fastify/cookie";

process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:1/orken_tests";
process.env.PARTNER_CORE_URL = "https://partner-core.example";
process.env.PARTNER_CORE_SERVICE_KEYS_JSON = "";
process.env.PARTNER_CORE_KEY_ID = "test-key";
process.env.PARTNER_CORE_SERVICE_SECRET = "test-service-secret";
process.env.PARTNER_CORE_PROJECT_ID = "orken-life";

const { partnerRoutes } = await import("./partners.js");
const { prisma } = await import("../lib/prisma.js");
const valid = {
  email: "qa@example.invalid", password: "synthetic-test-password", displayName: "QA Coach",
  accountName: "QA Practice", accountType: "individual", idempotencyKey: "qa-register-123456"
};

function stub(t: TestContext, model: any, method: string, implementation: (...args: any[]) => unknown) {
  const original = model[method];
  model[method] = t.mock.fn(implementation);
  t.after(() => { model[method] = original; });
}

async function appFor(t: TestContext) {
  const app = Fastify();
  t.after(() => app.close());
  await app.register(cookie);
  await app.register(partnerRoutes);
  return app;
}

test("registration rejects a one-character account name with 400 before Core or database access", async t => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => { throw new Error("Core must not be called"); });
  stub(t, prisma.partnerPortalSession, "findFirst", async () => { throw new Error("Session read must not run"); });
  stub(t, prisma.partnerPortalSession, "create", async () => { throw new Error("Session write must not run"); });
  const app = await appFor(t);
  for (const accountName of ["A", " A ", " ", "", null, "A".repeat(181)]) {
    const response = await app.inject({ method: "POST", url: "/api/partners/portal/register", payload: { ...valid, accountName } });
    assert.equal(response.statusCode, 400);
    assert.equal(response.json().code, "PARTNER_REGISTRATION_INVALID");
    assert.match(response.json().error, /2.*180/);
    assert.equal(response.headers["set-cookie"], undefined);
    assert.doesNotMatch(response.body, /ZodError|stack|synthetic-test-password|qa@example.invalid/);
  }
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("malformed registration fields return safe validation errors rather than 500", async t => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => { throw new Error("Core must not be called"); });
  const app = await appFor(t);
  for (const payload of [
    { ...valid, displayName: " A " }, { ...valid, displayName: "A".repeat(161) },
    { ...valid, email: "invalid" }, { ...valid, password: "short-pass" },
    { ...valid, password: "A".repeat(257) }, { ...valid, accountType: "admin" },
    { ...valid, idempotencyKey: "short" }, {}, []
  ]) {
    const response = await app.inject({ method: "POST", url: "/api/partners/portal/register", payload });
    assert.equal(response.statusCode, 400);
    assert.equal(response.json().code, "PARTNER_REGISTRATION_INVALID");
    assert.doesNotMatch(response.body, /ZodError|stack|short-pass|synthetic-test-password|qa@example.invalid/);
  }
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("valid registration trims names, preserves the password and stores only a local session", async t => {
  let coreBody: any;
  let stored: any;
  t.mock.method(globalThis, "fetch", async (url: string | URL | Request, init?: RequestInit) => {
    assert.equal(String(url), "https://partner-core.example/api/projects/orken-life/partner/register");
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("idempotency-key"), `partner-register:${valid.idempotencyKey}`);
    assert.ok(headers.get("x-partner-core-signature"));
    coreBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ sessionToken: "core-session-for-testing", expiresIn: 1800, partner: { id: "qa-partner", status: "PENDING_REVIEW" } }), { status: 200 });
  });
  stub(t, prisma.partnerPortalSession, "findFirst", async () => null);
  stub(t, prisma.partnerPortalSession, "create", async (args: any) => { stored = args.data; return { id: "local-session", ...stored }; });
  const app = await appFor(t);
  const response = await app.inject({ method: "POST", url: "/api/partners/portal/register", payload: { ...valid, displayName: " QA ", accountName: " QA ", password: "  synthetic-test-password  " } });
  assert.equal(response.statusCode, 200);
  assert.equal(coreBody.displayName, "QA");
  assert.equal(coreBody.accountName, "QA");
  assert.equal(coreBody.password, "  synthetic-test-password  ");
  assert.equal(stored.partnerCorePartnerId, "qa-partner");
  assert.match(stored.tokenHash, /^[a-f0-9]{64}$/);
  assert.match(stored.coreSessionCiphertext, /^v1\./);
  assert.equal(stored.password, undefined);
  assert.equal(response.json().partner.displayName, "QA");
  assert.ok([response.headers["set-cookie"]].flat().some(value => value?.includes("orken_partner_session=") && value.includes("HttpOnly") && value.includes("SameSite=Lax")));
  assert.doesNotMatch(response.body, /core-session-for-testing|synthetic-test-password|test-service-secret/);
});

test("invalid login fields return 400 without checking account existence", async t => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => { throw new Error("Core must not be called"); });
  const app = await appFor(t);
  for (const payload of [{ email: "invalid", password: "long-password" }, { email: valid.email, password: "" }, {}]) {
    const response = await app.inject({ method: "POST", url: "/api/partners/portal/login", payload });
    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error, "Введите корректный email и пароль.");
    assert.equal(response.headers["set-cookie"], undefined);
  }
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("Core registration failures stay neutral and never expose upstream credentials or account details", async t => {
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ error: `Account ${valid.email} exists`, secret: "test-service-secret" }), { status: 409 }));
  const app = await appFor(t);
  const response = await app.inject({ method: "POST", url: "/api/partners/portal/register", payload: valid });
  assert.equal(response.statusCode, 401);
  assert.doesNotMatch(response.body, /qa@example.invalid|exists|test-service-secret|synthetic-test-password/);
  assert.equal(response.headers["set-cookie"], undefined);
});
