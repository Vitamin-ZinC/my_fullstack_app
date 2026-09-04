import { prisma } from "../lib/prisma.js";
import { synchronizeBundledPrompts } from "../services/promptSync.js";

try {
  const results = await synchronizeBundledPrompts();
  console.log(JSON.stringify({ ok: true, results }));
} finally {
  await prisma.$disconnect();
}
