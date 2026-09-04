import { prisma } from "../lib/prisma.js";
import { defaultReportPromptTemplates } from "./reportPrompts.js";

export type PromptSyncResult = {
  key: string;
  locale: string;
  version: number;
  action: "created" | "activated" | "skipped-newer" | "skipped-custom";
};

export async function synchronizeBundledPrompts(): Promise<PromptSyncResult[]> {
  const results: PromptSyncResult[] = [];

  for (const prompt of defaultReportPromptTemplates) {
    const active = await prisma.promptTemplate.findFirst({
      where: { key: prompt.key, locale: prompt.locale, status: "ACTIVE" },
      orderBy: { version: "desc" }
    });
    if (active && active.version >= prompt.version) {
      results.push({ key: prompt.key, locale: prompt.locale, version: active.version, action: "skipped-newer" });
      continue;
    }

    const existing = await prisma.promptTemplate.findUnique({
      where: { key_locale_version: { key: prompt.key, locale: prompt.locale, version: prompt.version } }
    });
    if (existing && existing.content !== prompt.content) {
      results.push({ key: prompt.key, locale: prompt.locale, version: prompt.version, action: "skipped-custom" });
      continue;
    }

    await prisma.$transaction(async (tx) => {
      await tx.promptTemplate.updateMany({
        where: {
          key: prompt.key,
          locale: prompt.locale,
          status: "ACTIVE",
          version: { lt: prompt.version }
        },
        data: { status: "ARCHIVED" }
      });
      await tx.promptTemplate.upsert({
        where: { key_locale_version: { key: prompt.key, locale: prompt.locale, version: prompt.version } },
        update: {
          status: "ACTIVE",
          title: prompt.title,
          content: prompt.content,
          publishedAt: new Date()
        },
        create: {
          ...prompt,
          publishedAt: new Date()
        }
      });
    });

    results.push({
      key: prompt.key,
      locale: prompt.locale,
      version: prompt.version,
      action: existing ? "activated" : "created"
    });
  }

  return results;
}
