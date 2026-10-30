import { createHash, randomBytes } from "node:crypto";
import { env } from "../env.js";
import { prisma } from "../lib/prisma.js";
import { sendAccountEmail } from "./email.js";

export const hashAccountToken = (token: string) => createHash("sha256").update(token).digest("hex");
export async function issueAccountEmail(user: { id: string; email: string; locale: string }, purpose: "EMAIL_VERIFY" | "PASSWORD_RESET") {
  const recent = await prisma.loginToken.count({ where: { email: user.email, purpose, createdAt: { gt: new Date(Date.now() - 60 * 1000) } } });
  if (recent) return;
  const token = randomBytes(32).toString("base64url");
  const minutes = purpose === "EMAIL_VERIFY" ? 1440 : 30;
  const stored = await prisma.$transaction(async tx => {
    await tx.loginToken.updateMany({ where: { email: user.email, purpose, consumedAt: null }, data: { consumedAt: new Date() } });
    return tx.loginToken.create({ data: { email: user.email, purpose, tokenHash: hashAccountToken(token), expiresAt: new Date(Date.now() + minutes * 60000) } });
  });
  const url = new URL("/login", env.APP_ORIGIN);
  url.hash = new URLSearchParams({ action: purpose === "EMAIL_VERIFY" ? "verify" : "reset", token }).toString();
  // Keep SMTP latency and delivery status out of public account-enumeration responses.
  void sendAccountEmail({ ...user, kind: purpose === "EMAIL_VERIFY" ? "verify" : "reset", id: stored.id, url: url.toString() }).catch(() => undefined);
}

export async function deliverWelcomeEmail(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.status !== "ACTIVE" || !user.emailVerifiedAt || !user.welcomeEmailPendingAt || user.welcomeEmailSentAt) return;
  const claimed = await prisma.user.updateMany({ where: { id: user.id, status: "ACTIVE", emailVerifiedAt: { not: null }, welcomeEmailSentAt: null, welcomeEmailPendingAt: { lte: new Date() } }, data: { welcomeEmailPendingAt: new Date(Date.now() + 15 * 60000) } });
  if (claimed.count !== 1) return;
  const result = await sendAccountEmail({ ...user, kind: "welcome", id: user.id });
  await prisma.user.updateMany({ where: { id: user.id, welcomeEmailSentAt: null, welcomeEmailPendingAt: { not: null } }, data: result.emailSent
    ? { welcomeEmailSentAt: new Date(), welcomeEmailPendingAt: null }
    : { welcomeEmailPendingAt: new Date(Date.now() + 15 * 60000) } });
}
export async function sendPendingWelcomeEmails() {
  const users = await prisma.user.findMany({ where: { status: "ACTIVE", emailVerifiedAt: { not: null }, welcomeEmailSentAt: null, welcomeEmailPendingAt: { lte: new Date() } }, select: { id: true }, take: 20 });
  for (const user of users) await deliverWelcomeEmail(user.id);
}
