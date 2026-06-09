import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../env.js";
import { prisma } from "../lib/prisma.js";

const client = new S3Client({
  region: env.S3_REGION,
  endpoint: env.S3_ENDPOINT,
  credentials: env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY ? {
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY
  } : undefined
});

const hasS3Config = Boolean(env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY && env.S3_BUCKET);

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
    const bothUploaded = [audio, photo].every((asset) => asset.status === "UPLOADED" || asset.status === "VERIFIED");
    return bothUploaded ? { ok: true } : { ok: false, reason: "Media files are not uploaded" };
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
          status: "VERIFIED",
          size: head.ContentLength ? Number(head.ContentLength) : asset.size,
          mimeType: head.ContentType ?? asset.mimeType,
          verifiedAt: new Date()
        }
      });
    } catch {
      return { ok: false, reason: `Missing uploaded ${asset.type.toLowerCase()} file` };
    }
  }

  return { ok: true };
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
