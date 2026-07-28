import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../env.js";
import { prisma } from "../lib/prisma.js";
import { validatePhotoBuffer } from "./imageValidation.js";

const client = new S3Client({
  region: env.S3_REGION,
  endpoint: env.S3_ENDPOINT,
  credentials: env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY ? {
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY
  } : undefined
});

const hasS3Config = Boolean(env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY && env.S3_BUCKET);

function assertSafeUploadKey(key: string) {
  if (!key || key.includes("/") || key.includes("..")) {
    throw new Error("Invalid upload key");
  }
}

function resolveLocalUpload(key: string | null | undefined) {
  if (!key || key.includes("/") || key.includes("..")) return null;
  const root = resolve(env.LOCAL_UPLOAD_DIR);
  const filePath = resolve(join(root, key));
  if (!filePath.startsWith(root)) return null;
  return existsSync(filePath) ? filePath : null;
}

async function streamToBuffer(stream: unknown) {
  if (!stream || typeof (stream as AsyncIterable<Uint8Array>)[Symbol.asyncIterator] !== "function") {
    throw new Error("S3 object body is not readable");
  }

  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<Uint8Array>) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function createMediaUploadUrls() {
  const audioKey = `audio-${randomUUID()}.webm`;
  const photoKey = `photo-${randomUUID()}.jpg`;

  if (!hasS3Config && (env.LOCAL_UPLOADS_ENABLED || env.NODE_ENV !== "production")) {
    return {
      audioKey,
      photoKey,
      audioUploadUrl: `${env.PUBLIC_API_URL}/api/uploads/${audioKey}`,
      photoUploadUrl: `${env.PUBLIC_API_URL}/api/uploads/${photoKey}`
    };
  }

  const audioUploadUrl = await getSignedUrl(client, new PutObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: audioKey,
    ContentType: "audio/webm"
  }), { expiresIn: 900 });
  const photoUploadUrl = await getSignedUrl(client, new PutObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: photoKey,
    ContentType: "image/jpeg"
  }), { expiresIn: 900 });
  return { audioKey, photoKey, audioUploadUrl, photoUploadUrl };
}

export async function verifyRequiredMedia(analysisId: string) {
  const assets = await prisma.mediaAsset.findMany({ where: { analysisId } });
  const audio = assets.find((asset) => asset.type === "AUDIO");
  const photo = assets.find((asset) => asset.type === "PHOTO");

  if (!audio || !photo) return { ok: false, reason: "Missing media assets" };

  if (!hasS3Config) {
    const audioUploaded = audio.status === "UPLOADED" || audio.status === "VERIFIED";
    const photoUploaded = photo.status === "UPLOADED" || photo.status === "VERIFIED" || photo.status === "REJECTED";
    if (!audioUploaded || !photoUploaded) return { ok: false, reason: "Media files are not uploaded" };
    return validateUploadedPhoto(photo.id, photo.key);
  }

  for (const asset of [audio, photo]) {
    try {
      const head = await client.send(new HeadObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: asset.key
      }));
      await prisma.mediaAsset.update({
        where: { id: asset.id },
        data: {
          status: asset.type === "AUDIO"
            ? "VERIFIED"
            : asset.status === "CREATED"
              ? "UPLOADED"
              : asset.status,
          size: head.ContentLength ? Number(head.ContentLength) : asset.size,
          mimeType: head.ContentType ?? asset.mimeType,
          uploadedAt: asset.uploadedAt ?? new Date(),
          verifiedAt: asset.type === "AUDIO" ? new Date() : asset.verifiedAt
        }
      });
    } catch {
      return { ok: false, reason: `Missing uploaded ${asset.type.toLowerCase()} file` };
    }
  }

  return validateUploadedPhoto(photo.id, photo.key);
}

export async function readMediaAssetBuffer(key: string) {
  if (!hasS3Config) {
    const filePath = resolveLocalUpload(key);
    return filePath ? readFile(filePath) : null;
  }

  const object = await client.send(new GetObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: key
  }));
  return streamToBuffer(object.Body);
}

export async function getMediaAssetPublicUrl(key: string) {
  if (key.includes("/") || key.includes("..")) return null;

  if (!hasS3Config) {
    return `${env.PUBLIC_API_URL}/api/uploads/${encodeURIComponent(key)}`;
  }

  return getSignedUrl(client, new GetObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: key
  }), { expiresIn: 900 });
}

export function createImageUploadKey(prefix = "image", format: "jpeg" | "png" | "webp" = "jpeg") {
  const ext = format === "jpeg" ? "jpg" : format;
  return `${prefix}-${randomUUID()}.${ext}`;
}

export async function writeUploadBuffer(key: string, buffer: Buffer, contentType: string) {
  assertSafeUploadKey(key);

  if (!hasS3Config) {
    await mkdir(env.LOCAL_UPLOAD_DIR, { recursive: true });
    const uploadRoot = resolve(env.LOCAL_UPLOAD_DIR);
    const uploadPath = resolve(join(uploadRoot, key));
    if (uploadPath !== uploadRoot && !uploadPath.startsWith(`${uploadRoot}${sep}`)) throw new Error("Invalid upload key");
    await writeFile(uploadPath, buffer);
    return;
  }

  await client.send(new PutObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType
  }));
}

export async function validateUploadedPhoto(mediaAssetId: string, key: string) {
  const buffer = await readMediaAssetBuffer(key);
  if (!buffer) return { ok: false, reason: "Missing uploaded photo file" };

  const validation = validatePhotoBuffer(buffer);
  if (!validation.ok) return validation;

  await prisma.mediaAsset.update({
    where: { id: mediaAssetId },
    data: {
      size: buffer.length,
      mimeType: `image/${validation.format === "jpeg" ? "jpeg" : validation.format}`
    }
  });

  return { ok: true };
}
