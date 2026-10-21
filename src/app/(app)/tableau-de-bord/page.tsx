import { redirect } from "next/navigation";

// L'ancien tableau de bord est remplacé par les rapports.
export default function DashboardPage() {
  redirect("/rapports");
}
