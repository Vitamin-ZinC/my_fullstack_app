import { NextRequest, NextResponse } from "next/server";

const baseDomain = process.env.COACH_SITE_BASE_DOMAIN || "orken.life";
const reserved = new Set(["www", "partners", "api", "admin"]);
const primaryHosts = new Set((process.env.COACH_SITE_PRIMARY_HOSTS || "orken.life,www.orken.life,orkenlife.edgeone.dev,localhost,127.0.0.1,frontend")
  .split(",")
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean));

export function proxy(request: NextRequest) {
  const host = (request.headers.get("host") || "").toLowerCase().split(":")[0];
  const subdomain = host.endsWith(`.${baseDomain}`) ? host.slice(0, -(`.${baseDomain}`.length)) : "";
  const isCoachSubdomain = Boolean(subdomain) && !reserved.has(subdomain) && !subdomain.includes(".");
  const isCustomCoachDomain = process.env.COACH_CUSTOM_DOMAIN_ROUTING_ENABLED === "true"
    && Boolean(host)
    && !primaryHosts.has(host)
    && !host.endsWith(`.${baseDomain}`);
  if ((isCoachSubdomain || isCustomCoachDomain) && !request.nextUrl.pathname.startsWith("/api") && !request.nextUrl.pathname.startsWith("/_next") && !request.nextUrl.pathname.includes(".")) {
    const url = request.nextUrl.clone();
    url.pathname = "/coach-site";
    return NextResponse.rewrite(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|assets/).*)"] };
