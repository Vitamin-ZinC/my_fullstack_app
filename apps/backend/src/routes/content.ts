import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";

const localeSchema = z.object({
  locale: z.enum(["ru", "en"]).default("ru")
});

export async function contentRoutes(app: FastifyInstance) {
  app.get("/api/content/:locale", async (request) => {
    const { locale } = localeSchema.parse(request.params);
    const setting = await prisma.appSetting.findUnique({
      where: { key: `site_texts_${locale}` }
    });

    return {
      locale,
      value: setting?.value ?? null
    };
  });
}
