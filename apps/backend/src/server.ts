import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import sensible from "@fastify/sensible";
import rawBody from "fastify-raw-body";
import { env } from "./env.js";
import { adminRoutes } from "./routes/admin.js";
import { authRoutes } from "./routes/auth.js";
import { analysisRoutes } from "./routes/analyses.js";
import { contentRoutes } from "./routes/content.js";
import { eventRoutes } from "./routes/events.js";
import { paymentRoutes } from "./routes/payments.js";

const app = Fastify({
  logger: true,
  bodyLimit: 10 * 1024 * 1024,
});

await app.register(cors, {
  origin: env.APP_ORIGIN,
  credentials: true
});
await app.register(helmet);
await app.register(cookie);
await app.register(rawBody, {
  field: "rawBody",
  global: false,
  encoding: false,
  runFirst: true
});
await app.register(sensible);
await app.register(rateLimit, { max: 120, timeWindow: "1 minute" });

app.addContentTypeParser([
  "audio/webm",
  "audio/mp4",
  "audio/ogg",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/octet-stream"
], {
  parseAs: "buffer",
  bodyLimit: 10 * 1024 * 1024
}, (_request, body, done) => {
  done(null, body);
});

await app.register(authRoutes);
await app.register(contentRoutes);
await app.register(analysisRoutes);
await app.register(paymentRoutes);
await app.register(eventRoutes);
await app.register(adminRoutes);

app.get("/health", async () => ({ ok: true }));

await app.listen({ port: env.PORT, host: "0.0.0.0" });
