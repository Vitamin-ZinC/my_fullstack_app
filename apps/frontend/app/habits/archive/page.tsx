import { redirect } from "next/navigation";

export default function HabitArchivePage() {
  redirect("/habits?tab=archive");
}
