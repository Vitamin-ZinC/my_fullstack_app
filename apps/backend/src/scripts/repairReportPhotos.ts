import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { Prisma } from "@prisma/client";
import type { IkigaiAnswers } from "@levelup/contracts";
import { prisma } from "../lib/prisma.js";
import { generateOpenAiReport, type GeneratedReport } from "../services/aiReport.js";
import { assertPhotoEvidence, hasMissingPhotoClaim, inlineReportPhoto } from "../services/reportPhoto.js";
import { readMediaAssetBuffer } from "../services/media.js";
import { env } from "../env.js";

export function photoRepairAnalysisData(generated: GeneratedReport) {
  if (!generated.mediaSignals.photoInput) throw new Error("PHOTO_REPAIR_REQUIRES_IMAGE");
  assertPhotoEvidence(generated.report, true);
  return {
    reportFree: JSON.parse(JSON.stringify(generated.reportFree)) as Prisma.InputJsonValue,
    reportFull: JSON.parse(JSON.stringify(generated.report)) as Prisma.InputJsonValue,
    reportVersion: generated.promptVersion
  };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const argument = (name: string) => process.argv[process.argv.indexOf(name) + 1];
  const backupDirectory = process.argv.includes("--backup-dir") ? resolve(argument("--backup-dir")) : null;
  const limit = process.argv.includes("--limit") ? Number(argument("--limit")) : 10;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Invalid repair limit");
  if (apply && !backupDirectory) throw new Error("--backup-dir is required for --apply");
  const uploads = resolve(env.LOCAL_UPLOAD_DIR);
  if (backupDirectory && (backupDirectory === uploads || backupDirectory.startsWith(`${uploads}${sep}`))) throw new Error("Backup directory must not be served as uploads");
  if (backupDirectory) await mkdir(backupDirectory, { recursive: true, mode: 0o700 });
  const stats = { scanned: 0, matching: 0, eligible: 0, noConsent: 0, missingMedia: 0, repaired: 0, failed: 0, conflicts: 0, rateLimited: 0, photoConflicts: 0, limitReached: false };
  let cursor: string | undefined;
  let processed = 0;
  for (;;) {
    const batch = await prisma.analysis.findMany({
      where: { status: "DONE", ...(cursor ? { id: { gt: cursor } } : {}) },
      orderBy: { id: "asc" }, take: 100, include: { mediaAssets: true, reports: true }
    });
    if (!batch.length) break;
    for (const analysis of batch) {
      stats.scanned += 1;
      if (!hasMissingPhotoClaim(analysis.reportFull)) continue;
      stats.matching += 1;
      if (!analysis.faceConsentAt) { stats.noConsent += 1; continue; }
      const photo = analysis.mediaAssets.find(asset => asset.type === "PHOTO" && asset.status === "VERIFIED");
      try {
        if (!photo) throw new Error("PHOTO_INPUT_UNAVAILABLE");
        inlineReportPhoto(await readMediaAssetBuffer(photo.key));
      } catch {
        stats.missingMedia += 1;
        continue;
      }
      stats.eligible += 1;
      if (!apply) continue;
      if (processed >= limit) { stats.limitReached = true; continue; }
      processed += 1;
      try {
        if (!/^[a-z0-9_-]+$/i.test(analysis.id)) throw new Error("Invalid analysis id");
        await writeFile(join(backupDirectory!, `${analysis.id}.json`), JSON.stringify({
          analysisId: analysis.id, updatedAt: analysis.updatedAt, completedAt: analysis.completedAt,
          reportVersion: analysis.reportVersion, reportFree: analysis.reportFree, reportFull: analysis.reportFull, reports: analysis.reports
        }), { flag: "wx", mode: 0o600 });
        // Do not enqueue the normal worker: a failed regeneration must leave the
        // existing DONE report available. Only commit a complete verified result.
        const generated = await generateOpenAiReport({
          analysisId: analysis.id, locale: analysis.locale,
          answers: (analysis.ikigaiAnswers ?? { love: [], good_at: [], world_needs: [], paid_for: [] }) as IkigaiAnswers,
          mediaAssets: analysis.mediaAssets,
          serialCompletions: { spacingMs: 60000, retryDelayMs: 60000 }
        });
        if (!generated) throw new Error("AI generation unavailable");
        const data = photoRepairAnalysisData(generated);
        await prisma.$transaction(async transaction => {
          const updated = await transaction.analysis.updateMany({
            where: { id: analysis.id, status: "DONE", updatedAt: analysis.updatedAt }, data
          });
          if (updated.count !== 1) throw new Error("PHOTO_REPAIR_CONCURRENT_CHANGE");
          for (const tier of ["FREE", "FULL"] as const) {
            const output = tier === "FREE" ? data.reportFree : data.reportFull;
            const promptVersion = tier === "FREE" ? generated.promptVersions.free : generated.promptVersions.full;
            await transaction.report.upsert({
              where: { analysisId_tier_language: { analysisId: analysis.id, tier, language: analysis.locale } },
              update: { output, promptVersion, model: generated.model },
              create: { analysisId: analysis.id, tier, language: analysis.locale, output, promptVersion, model: generated.model }
            });
          }
        });
        stats.repaired += 1;
      } catch (error) {
        if (error instanceof Error && /\b429\b|rate.?limit/i.test(error.message)) stats.rateLimited += 1;
        if (error instanceof Error && /PHOTO_EVIDENCE_CONFLICT/.test(error.message)) stats.photoConflicts += 1;
        if (error instanceof Error && error.message === "PHOTO_REPAIR_CONCURRENT_CHANGE") stats.conflicts += 1;
        else stats.failed += 1;
      }
      // Counts only: never log identities, media, transcript, prompts or reports.
      console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", ...stats }));
    }
    cursor = batch[batch.length - 1].id;
    if (batch.length < 100) break;
  }
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", ...stats }));
  if (stats.failed || stats.conflicts) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => { console.error("Photo report repair stopped; existing reports remain unchanged"); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
}
