import { z } from "zod";

const booleanEnv = z.preprocess((value) => {
  if (typeof value === "string") return value === "true";
  return value;
}, z.boolean());

const schema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().default(3001),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  APP_ORIGIN: z.string().default("http://localhost:3000"),
  PUBLIC_API_URL: z.string().default("http://localhost:3001"),
  ADMIN_API_TOKEN: z.string().optional(),
  ADMIN_PASSWORD_HASH: z.string().optional(),
  ADMIN_SESSION_SECRET: z.string().optional(),
  DEV_TOOLS_ENABLED: booleanEnv.default(false),
  LOCAL_UPLOADS_ENABLED: booleanEnv.default(false),
  LOCAL_UPLOAD_DIR: z.string().default(".runtime/uploads"),
  JWT_ACCESS_SECRET: z.string().default("dev_access_secret"),
  JWT_REFRESH_SECRET: z.string().default("dev_refresh_secret"),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default("auto"),
  S3_BUCKET: z.string().default("levelup-media"),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  PRICE_AMOUNT: z.coerce.number().default(300),
  PRICE_CURRENCY: z.string().default("usd"),
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().default("ORKEN.LIFE <reports@orken.life>"),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),
  OPENAI_TRANSCRIPTION_MODEL: z.string().default("whisper-1"),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default("claude-opus-4-6")
});

export const env = schema.parse(process.env);
