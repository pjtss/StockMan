import { AdminApiConfig } from "@/components/admin-api-config";
import { requireAdminSession } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export default async function AdminApiConfigPage() {
  await requireAdminSession();
  return <AdminApiConfig />;
}
