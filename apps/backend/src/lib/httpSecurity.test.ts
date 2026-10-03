import assert from "node:assert/strict";
import test from "node:test";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import rawBody from "fastify-raw-body";
import Stripe from "stripe";

test("malformed public URLs cannot reach a protected sibling fallback", async (t) => {
  const app = Fastify();
  t.after(() => app.close());
  let privateReads = 0;
  await app.register(async (publicApp) => {
    publicApp.get("/health", async () => ({ ok: true }));
  }, { prefix: "/public" });
  await app.register(async (privateApp) => {
    privateApp.setNotFoundHandler({
      preHandler: async (_request: FastifyRequest, reply: FastifyReply) => {
        return reply.code(401).send({ error: "Unauthorized" });
      }
    }, async () => {
      privateReads += 1;
      return { privateData: true };
    });
  }, { prefix: "/private" });

  assert.equal((await app.inject("/private/missing")).statusCode, 401);
  for (const method of ["GET", "POST", "PATCH"] as const) {
    const response = await app.inject({ method, url: "/public/%zz" });
    assert.equal(response.statusCode, 400);
    assert.equal(response.body.includes("privateData"), false);
  }
  assert.equal(privateReads, 0);
});

test("request body validation rejects invalid root values before the handler", async (t) => {
  const app = Fastify();
  t.after(() => app.close());
  let writes = 0;
  app.post("/write", {
    schema: { body: { type: "object", required: ["name"], properties: { name: { type: "string" } } } }
  }, async () => {
    writes += 1;
    return { ok: true };
  });
  for (const payload of ["null", "true", "42", '"value"', "[]", "{}"]) {
    const response = await app.inject({
      method: "POST", url: "/write", headers: { "content-type": "application/json" }, payload
    });
    assert.equal(response.statusCode, 400, payload);
  }
  assert.equal(writes, 0);
  assert.equal((await app.inject({ method: "POST", url: "/write", payload: { name: "Valid" } })).statusCode, 200);
});

test("security plugins preserve the origin allowlist, cookie flags and response headers", async (t) => {
  const app = Fastify();
  t.after(() => app.close());
  await app.register(cors, { origin: ["https://orken.life"], credentials: true });
  await app.register(helmet);
  await app.register(cookie);
  app.get("/session", async (_request, reply) => {
    reply.setCookie("session", "synthetic-test-session", { httpOnly: true, secure: true, sameSite: "lax", path: "/" });
    return { ok: true };
  });
  const allowed = await app.inject({ url: "/session", headers: { origin: "https://orken.life" } });
  assert.equal(allowed.headers["access-control-allow-origin"], "https://orken.life");
  assert.equal(allowed.headers["access-control-allow-credentials"], "true");
  assert.equal(allowed.headers["x-content-type-options"], "nosniff");
  assert.ok(allowed.headers["content-security-policy"]);
  const sessionCookie = String(allowed.headers["set-cookie"]);
  assert.match(sessionCookie, /HttpOnly/);
  assert.match(sessionCookie, /Secure/);
  assert.match(sessionCookie, /SameSite=Lax/);
  const foreign = await app.inject({ url: "/session", headers: { origin: "https://untrusted.example" } });
  assert.equal(foreign.headers["access-control-allow-origin"], undefined);
});

test("Stripe signatures use the exact raw request bytes and reject tampering", async (t) => {
  const app = Fastify();
  t.after(() => app.close());
  await app.register(rawBody, { field: "rawBody", global: false, encoding: false, runFirst: true });
  const stripe = new Stripe("sk_test_synthetic_security_fixture");
  const secret = "whsec_synthetic_security_fixture";
  app.post("/webhook", { config: { rawBody: true } }, async (request, reply) => {
    try {
      assert.ok(Buffer.isBuffer(request.rawBody));
      stripe.webhooks.constructEvent(request.rawBody!, String(request.headers["stripe-signature"]), secret);
      return { received: true };
    } catch {
      return reply.code(400).send({ error: "Invalid signature" });
    }
  });
  const payload = '{ "id": "evt_security_fixture", "object": "event", "type": "test.event", "data": { "object": {} } }';
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret });
  const headers = { "content-type": "application/json", "stripe-signature": signature };
  assert.equal((await app.inject({ method: "POST", url: "/webhook", payload, headers })).statusCode, 200);
  assert.equal((await app.inject({ method: "POST", url: "/webhook", payload: JSON.stringify(JSON.parse(payload)), headers })).statusCode, 400);
});

test("rate limiting still rejects repeated requests after the framework upgrade", async (t) => {
  const app = Fastify();
  t.after(() => app.close());
  await app.register(rateLimit, { max: 2, timeWindow: "1 minute" });
  app.get("/limited", async () => ({ ok: true }));
  assert.equal((await app.inject("/limited")).statusCode, 200);
  assert.equal((await app.inject("/limited")).statusCode, 200);
  assert.equal((await app.inject("/limited")).statusCode, 429);
});
