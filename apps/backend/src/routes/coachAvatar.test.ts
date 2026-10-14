import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import test, { after, type TestContext } from "node:test";
import Fastify from "fastify";
import cookie from "@fastify/cookie";

const uploadDir = await mkdtemp(join(tmpdir(), "orken-avatar-test-"));
after(() => rm(uploadDir, { recursive: true, force: true }));
process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:1/orken_test";
process.env.LOCAL_UPLOAD_DIR = uploadDir;
process.env.S3_ACCESS_KEY_ID = "";
process.env.S3_SECRET_ACCESS_KEY = "";
const { prisma } = await import("../lib/prisma.js");
const { habitsRoutes } = await import("./habits.js");
const { coachWorkspaceRoutes } = await import("./coachWorkspace.js");
const { createImageUploadKey, writeUploadBuffer } = await import("../services/media.js");
const { createPartnerPortalSession } = await import("../services/partnerPortal.js");

const coachId = "cmr12345678901234567890123";
const profile: any = { id: coachId, partnerCorePartnerId: "synthetic-partner", displayName: "Test Coach", slug: "test-coach", specializations: [], languages: ["en"], status: "APPROVED", avatarUrl: null };

function stub(t: TestContext, model: any, method: string, fn: (...args: any[]) => unknown) {
  const original = model[method];
  model[method] = t.mock.fn(fn);
  t.after(() => { model[method] = original; });
}

async function appFor(t: TestContext) {
  const app = Fastify();
  t.after(() => app.close());
  await app.register(cookie);
  app.addContentTypeParser(["image/jpeg", "image/png", "image/webp"], { parseAs: "buffer" }, (_request, body, done) => done(null, body));
  await app.register(habitsRoutes);
  await app.register(coachWorkspaceRoutes);
  return app;
}

test("existing coach-avatar URLs serve exact bytes but never expose diagnostics or unrelated uploads", async t => {
  const key = createImageUploadKey(`coach-${coachId}`, "jpeg");
  const photo = await readFile(resolve(process.cwd(), "../../assets/ikigai-cones.jpg"));
  await writeUploadBuffer(key, photo, "image/jpeg");
  stub(t, prisma.coachProfile, "findUnique", async ({ where }: any) => where.id === coachId ? { avatarUrl: `https://orken.life/api/habits/avatar/${key}` } : null);
  const app = await appFor(t);
  const response = await app.inject(`/api/habits/avatar/${key}`);
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["content-type"], "image/jpeg");
  assert.equal(response.headers["x-content-type-options"], "nosniff");
  assert.deepEqual(response.rawPayload, photo);
  const unusedKey = createImageUploadKey(`coach-${coachId}`, "jpeg");
  await writeUploadBuffer(unusedKey, photo, "image/jpeg");
  assert.equal((await app.inject(`/api/habits/avatar/${unusedKey}`)).statusCode, 404);
  for (const invalid of ["photo-1234.jpg", "audio-1234.webm", "coach-secret.jpg", "avatar-..jpg", "avatar-%5Csecret.jpg", "avatar-1234.svg", "..%2F.env"]) {
    assert.notEqual((await app.inject(`/api/habits/avatar/${invalid}`)).statusCode, 200, invalid);
  }
  const userKey = createImageUploadKey("avatar", "jpeg");
  await writeUploadBuffer(userKey, photo, "image/jpeg");
  assert.equal((await app.inject(`/api/habits/avatar/${userKey}`)).statusCode, 200);
});

test("authenticated coach upload is readable immediately and still requires moderation and CSRF", async t => {
  let storedSession: any;
  let storedProfile = { ...profile };
  stub(t, prisma.partnerPortalSession, "create", async ({ data }: any) => (storedSession = { id: "session", ...data }));
  stub(t, prisma.partnerPortalSession, "findFirst", async () => storedSession);
  stub(t, prisma.partnerPortalSession, "update", async () => storedSession);
  stub(t, prisma.coachProfile, "findUnique", async ({ where }: any) => where.partnerCorePartnerId || where.id === coachId ? storedProfile : null);
  stub(t, prisma.coachProfile, "update", async ({ data }: any) => (storedProfile = { ...storedProfile, ...data }));
  const session = await createPartnerPortalSession({ sessionToken: "synthetic-core-session", expiresIn: 1800, partner: { id: profile.partnerCorePartnerId, displayName: profile.displayName, status: "APPROVED" } });
  const app = await appFor(t);
  const photo = await readFile(resolve(process.cwd(), "../../assets/ikigai-cones.jpg"));
  const headers = { cookie: `orken_partner_session=${session.rawSessionToken}; orken_partner_csrf=synthetic-csrf`, "x-partner-csrf": "synthetic-csrf", "content-type": "image/jpeg" };
  assert.equal((await app.inject({ method: "POST", url: "/api/coach/profile/avatar", headers: { ...headers, "x-partner-csrf": "" }, payload: photo })).statusCode, 403);
  const upload = await app.inject({ method: "POST", url: "/api/coach/profile/avatar", headers, payload: photo });
  assert.equal(upload.statusCode, 200);
  assert.equal(upload.json().profile.status, "PENDING_REVIEW");
  const image = await app.inject(new URL(upload.json().avatarUrl).pathname);
  assert.equal(image.statusCode, 200);
  assert.deepEqual(image.rawPayload, photo);
  assert.equal(upload.body.includes("synthetic-core-session"), false);
});
