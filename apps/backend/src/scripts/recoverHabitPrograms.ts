import { prisma } from "../lib/prisma.js";
import { recoverHabitPrograms } from "../services/habitProgramRecovery.js";

const apply = process.argv.includes("--apply");
try {
  const programs = await prisma.habitProgram.findMany({
    where: { status: "ACTIVE" }, select: { userId: true, sessionId: true }
  });
  const owners = new Map<string, { id: string; userId: string | null; count: number }>();
  for (const p of programs) {
    if (!p.userId && !p.sessionId) continue;
    const key = p.userId ? `user:${p.userId}` : `session:${p.sessionId}`;
    const current = owners.get(key);
    owners.set(key, { id: p.sessionId ?? "", userId: p.userId, count: (current?.count ?? 0) + 1 });
  }
  let recovered = 0;
  let skipped = 0;
  for (const owner of owners.values()) {
    if (owner.count < 2) continue;
    try {
      const result = await prisma.$transaction((tx) => recoverHabitPrograms(tx, owner, apply), {
        maxWait: 10000, timeout: 120000
      });
      console.log(JSON.stringify(result));
      recovered += 1;
    } catch (error) {
      skipped += 1;
      console.error(JSON.stringify({ skipped: true, reason: error instanceof Error ? error.message : "Recovery failed" }));
    }
  }
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", groups: recovered, skipped }));
  if (skipped) process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
