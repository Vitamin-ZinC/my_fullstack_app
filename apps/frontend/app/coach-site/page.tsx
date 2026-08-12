import { headers } from "next/headers";
import { notFound } from "next/navigation";
import CoachSiteClient from "./site-client";

export const dynamic = "force-dynamic";

export default async function CoachSitePage() {
  const host = (await headers()).get("host") || "";
  const api = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
  const response = await fetch(`${api}/api/coach-sites/by-host?host=${encodeURIComponent(host)}`, { cache: "no-store" });
  if (!response.ok) notFound();
  const data = await response.json();
  return <CoachSiteClient host={host} data={data} botUsername={data.botUsername || ""} />;
}
