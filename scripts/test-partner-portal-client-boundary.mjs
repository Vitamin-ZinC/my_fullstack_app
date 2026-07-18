import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const staticRoot = join(process.cwd(), "apps", "frontend", ".next", "static");
const productionComposePath = join(process.cwd(), "docker-compose.prod.yml");

if (!existsSync(staticRoot)) {
  throw new Error("Frontend build output is missing. Run npm --workspace @levelup/frontend run build first.");
}

function readJavaScriptFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return readJavaScriptFiles(path);
    return entry.name.endsWith(".js") ? [path] : [];
  });
}

const bundle = readJavaScriptFiles(staticRoot)
  .map((path) => readFileSync(path, "utf8"))
  .join("\n");

const forbiddenValues = [
  process.env.PARTNER_CORE_URL,
  process.env.PARTNER_CORE_SERVICE_KEYS_JSON,
  process.env.PARTNER_CORE_KEY_SECRET,
  process.env.PARTNER_PORTAL_SESSION_ENCRYPTION_SECRET
].filter((value) => typeof value === "string" && value.length >= 8);

for (const value of forbiddenValues) {
  if (bundle.includes(value)) {
    throw new Error("A server-only Partner Core value was found in the frontend bundle.");
  }
}

for (const identifier of [
  "PARTNER_CORE_SERVICE_KEYS_JSON",
  "PARTNER_CORE_KEY_SECRET",
  "PARTNER_PORTAL_SESSION_ENCRYPTION_SECRET"
]) {
  if (bundle.includes(identifier)) {
    throw new Error(`Server-only configuration identifier leaked into the frontend bundle: ${identifier}`);
  }
}

const productionCompose = readFileSync(productionComposePath, "utf8");
const requiredProductionEnvOccurrences = new Map([
  ["PARTNER_CORE_SERVICE_KEYS_JSON", 2],
  ["PARTNER_CORE_DEFAULT_PROGRAM_ID", 2],
  ["PARTNER_CORE_PRIVACY_SECRET", 2],
  ["PARTNER_PORTAL_ORIGIN", 1],
  ["PARTNER_PORTAL_SESSION_ENCRYPTION_SECRET", 1],
  ["PARTNER_PORTAL_COOKIE_DOMAIN", 1]
]);

for (const [identifier, minimumOccurrences] of requiredProductionEnvOccurrences) {
  const occurrences = productionCompose.split(identifier).length - 1;
  if (occurrences < minimumOccurrences) {
    throw new Error(`Production Compose does not pass ${identifier} to every required service.`);
  }
}

if (/NEXT_PUBLIC_.*(?:PARTNER_CORE|PARTNER_PORTAL)/.test(productionCompose)) {
  throw new Error("Partner Core server configuration must not use NEXT_PUBLIC_* variables.");
}

console.log("Partner portal frontend and production deployment boundary checks passed.");
