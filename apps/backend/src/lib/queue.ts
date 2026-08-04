import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { env } from "../env.js";

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null
});

export const analysisQueue = new Queue("analysis", {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 500
  }
});

export const telegramCommunityQueue = new Queue("telegram-community", {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 3000 },
    removeOnComplete: 500,
    removeOnFail: 500
  }
});
