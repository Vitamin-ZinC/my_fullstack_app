import type { FastifyInstance } from "fastify";
import { saveTrafficView, trafficEnabled, trafficOriginAllowed, trafficViewSchema, TRAFFIC_RETENTION_DAYS } from "../services/webTraffic.js";

export async function webTrafficRoutes(app: FastifyInstance) {
  app.get("/api/traffic/config", async (_request, reply) => {
    reply.header("Cache-Control", "no-store");
    return { enabled: await trafficEnabled(), retentionDays: TRAFFIC_RETENTION_DAYS };
  });
  app.post("/api/traffic/views", { bodyLimit: 2048, config: { rateLimit: { max: 90, timeWindow: "1 minute" } } }, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    if (!trafficOriginAllowed(request)) return reply.code(403).send({ error: "Origin not allowed" });
    if (request.headers["sec-gpc"] === "1" || request.headers.dnt === "1") return { ok: true, ignored: true };
    const parsed = trafficViewSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid traffic event" });
    if (!await trafficEnabled()) return { ok: true, ignored: true };
    if (/bot|crawler|spider|headless|preview|facebookexternalhit/i.test(String(request.headers["user-agent"] ?? ""))) return { ok: true, ignored: true };
    return saveTrafficView(parsed.data);
  });
}
