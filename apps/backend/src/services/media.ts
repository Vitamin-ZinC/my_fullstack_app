import { randomUUID } from "node:crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../env.js";

const client = new S3Client({
  region: env.S3_REGION,
  endpoint: env.S3_ENDPOINT,
  credentials: env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY ? {
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY
  } : undefined
});

export async function createMediaUploadUrls() {
  const audioKey = `audio/${randomUUID()}.webm`;
  const photoKey = `photo/${randomUUID()}.jpg`;
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
