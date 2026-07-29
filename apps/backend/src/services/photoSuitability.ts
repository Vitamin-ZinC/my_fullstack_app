import { createHash } from "node:crypto";
import { z } from "zod";
import { env } from "../env.js";
import { prisma } from "../lib/prisma.js";
import { parseCompletionJson } from "./completionJson.js";
import { validatePhotoBuffer } from "./imageValidation.js";
import { getMediaAssetPublicUrl, readMediaAssetBuffer } from "./media.js";
import { getOpenAiClient } from "./openaiClient.js";

export type PhotoSuitabilityCode =
  | "PHOTO_INVALID"
  | "PHOTO_PERSON_REQUIRED"
  | "PHOTO_SINGLE_PERSON_REQUIRED"
  | "PHOTO_FACE_NOT_CLEAR"
  | "PHOTO_VALIDATION_UNAVAILABLE";

export type PhotoSuitabilityResult =
  | {
      ok: true;
      cached: boolean;
      confidence: number;
      model: string;
    }
  | {
      ok: false;
      cached: boolean;
      code: PhotoSuitabilityCode;
      message: string;
      retryable: boolean;
      confidence?: number;
      model?: string;
    };

const decisionSchema = z.object({
  hasHuman: z.boolean(),
  isPhotographicHuman: z.boolean(),
  visibleFaceCount: z.coerce.number().int().min(0).max(20),
  primaryFaceClear: z.boolean(),
  confidence: z.coerce.number().min(0).max(1),
  reason: z.string().max(160).optional()
});

type VisionDecision = z.infer<typeof decisionSchema>;

const MIN_ACCEPTED_CONFIDENCE = 0.65;
const VISION_TIMEOUT_MS = 30_000;

export function interpretPhotoSuitabilityDecision(decision: VisionDecision): PhotoSuitabilityResult {
  if (!decision.hasHuman || !decision.isPhotographicHuman || decision.visibleFaceCount === 0) {
    return {
      ok: false,
      cached: false,
      code: "PHOTO_PERSON_REQUIRED",
      message: photoSuitabilityMessage("ru", "PHOTO_PERSON_REQUIRED"),
      retryable: false,
      confidence: decision.confidence,
      model: env.OPENAI_MODEL
    };
  }

  if (decision.visibleFaceCount > 1) {
    return {
      ok: false,
      cached: false,
      code: "PHOTO_SINGLE_PERSON_REQUIRED",
      message: photoSuitabilityMessage("ru", "PHOTO_SINGLE_PERSON_REQUIRED"),
      retryable: false,
      confidence: decision.confidence,
      model: env.OPENAI_MODEL
    };
  }

  if (decision.visibleFaceCount !== 1 || !decision.primaryFaceClear || decision.confidence < MIN_ACCEPTED_CONFIDENCE) {
    return {
      ok: false,
      cached: false,
      code: "PHOTO_FACE_NOT_CLEAR",
      message: photoSuitabilityMessage("ru", "PHOTO_FACE_NOT_CLEAR"),
      retryable: false,
      confidence: decision.confidence,
      model: env.OPENAI_MODEL
    };
  }

  return {
    ok: true,
    cached: false,
    confidence: decision.confidence,
    model: env.OPENAI_MODEL
  };
}

export function parsePhotoSuitabilityDecision(content: string) {
  return decisionSchema.parse(parseCompletionJson(content));
}

export async function validateAnalysisPhotoSuitability(
  analysisId: string,
  locale = "ru"
): Promise<PhotoSuitabilityResult> {
  const photo = await prisma.mediaAsset.findFirst({
    where: { analysisId, type: "PHOTO" }
  });
  if (!photo) {
    return failure(locale, "PHOTO_INVALID", false);
  }

  let buffer: Buffer | null = null;
  try {
    buffer = await readMediaAssetBuffer(photo.key);
  } catch {
    buffer = null;
  }
  if (!buffer) {
    return failure(locale, "PHOTO_INVALID", false);
  }

  const checksum = createHash("sha256").update(buffer).digest("hex");
  const technical = validatePhotoBuffer(buffer);
  if (!technical.ok) {
    await prisma.mediaAsset.update({
      where: { id: photo.id },
      data: {
        checksum,
        size: buffer.length,
        status: "REJECTED",
        verifiedAt: new Date()
      }
    });
    return failure(locale, "PHOTO_INVALID", false);
  }

  if (photo.checksum === checksum && photo.status === "VERIFIED") {
    return {
      ok: true,
      cached: true,
      confidence: 1,
      model: env.OPENAI_MODEL
    };
  }
  if (photo.checksum === checksum && photo.status === "REJECTED") {
    return failure(locale, "PHOTO_PERSON_REQUIRED", true);
  }

  await prisma.mediaAsset.update({
    where: { id: photo.id },
    data: {
      checksum,
      size: buffer.length,
      mimeType: `image/${technical.format === "jpeg" ? "jpeg" : technical.format}`,
      status: "UPLOADED",
      verifiedAt: null
    }
  });

  const client = getOpenAiClient();
  const photoUrl = await getMediaAssetPublicUrl(photo.key);
  if (!client || !photoUrl) {
    return failure(locale, "PHOTO_VALIDATION_UNAVAILABLE", false);
  }

  let decision: VisionDecision;
  try {
    const completion = await client.chat.completions.create({
      model: env.OPENAI_MODEL,
      temperature: 0,
      max_tokens: 300,
      messages: [
        {
          role: "system",
          content: [
            "You are a strict photo-suitability gate for a personal communication analysis.",
            "Check only whether the image is a photographic image of one real human with one clearly visible face.",
            "Do not identify the person and do not infer age, ethnicity, health, emotions, attractiveness, personality, or any other sensitive trait.",
            "Reject objects, animals, landscapes, documents, screenshots without a usable photographic human portrait, cartoons, avatars, statues, mannequins, heavily obscured faces, and group photos.",
            "Return only one raw JSON object with exactly these fields:",
            "{\"hasHuman\":boolean,\"isPhotographicHuman\":boolean,\"visibleFaceCount\":number,\"primaryFaceClear\":boolean,\"confidence\":number,\"reason\":string}",
            "confidence must be between 0 and 1."
          ].join("\n")
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Is this image suitable for a one-person face presentation analysis? Return only the required JSON."
            },
            {
              type: "image_url",
              image_url: { url: photoUrl }
            }
          ]
        }
      ]
    }, {
      timeout: Math.min(env.OPENAI_REQUEST_TIMEOUT_MS, VISION_TIMEOUT_MS)
    });
    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error("Photo suitability completion is empty");
    decision = parsePhotoSuitabilityDecision(content);
  } catch {
    return failure(locale, "PHOTO_VALIDATION_UNAVAILABLE", false);
  }

  const interpreted = interpretPhotoSuitabilityDecision(decision);
  if (interpreted.ok) {
    await prisma.mediaAsset.update({
      where: { id: photo.id },
      data: {
        checksum,
        status: "VERIFIED",
        verifiedAt: new Date()
      }
    });
    return interpreted;
  }

  await prisma.mediaAsset.update({
    where: { id: photo.id },
    data: {
      checksum,
      status: "REJECTED",
      verifiedAt: new Date()
    }
  });
  return {
    ...interpreted,
    message: photoSuitabilityMessage(locale, interpreted.code)
  };
}

export function photoSuitabilityHttpStatus(result: Exclude<PhotoSuitabilityResult, { ok: true }>) {
  return result.retryable ? 503 : 422;
}

export function photoSuitabilityMessage(locale: string, code: PhotoSuitabilityCode) {
  const isEnglish = locale.toLowerCase().startsWith("en");
  const messages = isEnglish ? {
    PHOTO_INVALID: "The photo is empty, damaged, or too small. Please upload or take another photo.",
    PHOTO_PERSON_REQUIRED: "No face was detected in the photo. Please upload another photo.",
    PHOTO_SINGLE_PERSON_REQUIRED: "The photo must show only one person. Please upload an individual portrait or selfie.",
    PHOTO_FACE_NOT_CLEAR: "We could not clearly see one face. Use a front-facing photo with good light and no strong blur or obstruction.",
    PHOTO_VALIDATION_UNAVAILABLE: "We could not verify the photo right now. Please try again in a minute."
  } : {
    PHOTO_INVALID: "Фото пустое, повреждено или слишком маленькое. Загрузите другое фото или сделайте новое.",
    PHOTO_PERSON_REQUIRED: "На фото не обнаружено лицо. Пожалуйста, загрузите другое фото",
    PHOTO_SINGLE_PERSON_REQUIRED: "На фото должен быть только один человек. Загрузите индивидуальный портрет или селфи.",
    PHOTO_FACE_NOT_CLEAR: "Не удалось уверенно увидеть одно лицо. Используйте фото анфас при хорошем свете, без сильного смаза и перекрытий.",
    PHOTO_VALIDATION_UNAVAILABLE: "Сейчас не удалось проверить фото. Повторите попытку через минуту."
  };
  return messages[code];
}

function failure(
  locale: string,
  code: PhotoSuitabilityCode,
  cached: boolean
): Exclude<PhotoSuitabilityResult, { ok: true }> {
  return {
    ok: false,
    cached,
    code,
    message: photoSuitabilityMessage(locale, code),
    retryable: code === "PHOTO_VALIDATION_UNAVAILABLE"
  };
}
