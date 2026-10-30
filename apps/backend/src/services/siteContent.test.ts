import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { safeContentHref, validateSiteContent } from "@levelup/contracts";
process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:1/test";
process.env.ADMIN_API_TOKEN = "synthetic-content-admin";
const { prisma } = await import("../lib/prisma.js");
const { adminRoutes } = await import("../routes/admin.js");
const { contentRoutes } = await import("../routes/content.js");

const content = () => ({ landing: { v2: { faq: { title: "FAQ", enabled: true, items: [{ id: "test", question: "Question", answer: "Price: {reportPrice}" }] }, footer: { supportEmail: "support@example.com", legalDetails: "Company", sections: [{ id: "legal", title: "Legal", enabled: true, links: ["privacy", "offer"].map(id => ({ id, label: id, href: `/${id}`, enabled: true, icon: "none" })) }] } } } });
test("public content only accepts safe links, plain text placeholders and visible legal links", () => {
  for (const value of ["javascript:alert(1)", "data:text/html,x", "//evil.test", "/%2f%2fevil.test", "/%5cevil.test", "https://user:pass@example.com", "mailto:x@test.com?body=secret", "/\nevil"]) assert.equal(safeContentHref(value), false, value);
  for (const value of ["/partners", "/habits?tab=journey", "#privacy-security", "https://t.me/orkenlife", "mailto:support@example.com"]) assert.equal(safeContentHref(value), true, value);
  assert.equal(validateSiteContent(content()), null);
  const missingLegal = content(); missingLegal.landing.v2.footer.sections[0].enabled = false;
  assert.ok(validateSiteContent(missingLegal));
  const placeholder = content(); placeholder.landing.v2.faq.items[0].answer = "{secret}";
  assert.ok(validateSiteContent(placeholder));
  const duplicate = content(); duplicate.landing.v2.faq.items.push(duplicate.landing.v2.faq.items[0]);
  assert.ok(validateSiteContent(duplicate));
});

test("content publication requires admin, isolates locales, retains previous version and rejects stale writes", async t => {
  const rows = new Map<string, any>(); let time = Date.now();
  const stub = (object: any, key: string, fn: any) => { const before = object[key]; object[key] = fn; t.after(() => object[key] = before); };
  stub(prisma.appSetting, "findUnique", async ({ where }: any) => rows.get(where.key) ?? null);
  stub(prisma.appSetting, "upsert", async ({ where, update, create }: any) => { const row = { ...(rows.get(where.key) ?? create), ...(rows.has(where.key) ? update : {}), updatedAt: new Date(++time) }; rows.set(where.key, row); return row; });
  stub(prisma, "$transaction", async (fn: any) => fn(prisma));
  stub(prisma.adminAuditLog, "create", async () => ({}));
  const app = Fastify(); t.after(() => app.close());
  await app.register(adminRoutes); await app.register(contentRoutes); await app.ready();
  const value = content();
  assert.equal((await app.inject({ method: "PUT", url: "/api/admin/settings/site_texts_ru", payload: { value } })).statusCode, 403);
  const headers = { "x-admin-token": process.env.ADMIN_API_TOKEN! };
  const publish = (locale: string, payload: any) => app.inject({ method: "PUT", url: `/api/admin/settings/site_texts_${locale}`, headers, payload });
  const first = await publish("ru", { value, expectedUpdatedAt: null }); assert.equal(first.statusCode, 200, first.body);
  const revision = first.json().updatedAt;
  const next = content(); next.landing.v2.faq.items[0].answer = "Updated";
  assert.equal((await publish("ru", { value: next, expectedUpdatedAt: revision })).statusCode, 200);
  assert.equal(rows.get("site_texts_previous_ru").value.landing.v2.faq.items[0].answer, "Price: {reportPrice}");
  assert.equal((await publish("ru", { value, expectedUpdatedAt: revision })).statusCode, 409);
  assert.equal((await publish("en", { value, expectedUpdatedAt: null })).statusCode, 200);
  assert.equal((await app.inject("/api/content/ru")).json().value.landing.v2.faq.items[0].answer, "Updated");
  assert.equal((await app.inject("/api/content/en")).json().value.landing.v2.faq.items[0].answer, "Price: {reportPrice}");
  const malicious = content(); malicious.landing.v2.footer.sections[0].links[0].href = "javascript:alert(1)";
  assert.equal((await publish("ru", { value: malicious })).statusCode, 400);
});
