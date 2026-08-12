import { notFound } from "next/navigation";
import { AdminConsole, type AdminSection } from "../page";

const validSections: AdminSection[] = ["reports", "users", "commercial", "ai", "content", "integrations", "partners", "system"];

export default async function AdminSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!validSections.includes(section as AdminSection)) notFound();
  return <AdminConsole section={section as AdminSection} />;
}
