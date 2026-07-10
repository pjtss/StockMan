import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function AdminKisTestPage() {
  redirect("/admin/api-tests");
}
