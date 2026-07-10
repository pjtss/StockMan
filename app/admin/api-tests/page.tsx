import { AdminApiTests } from "@/components/admin-api-tests";
import { requireAdminSession } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export default async function AdminApiTestsPage() {
  await requireAdminSession();
  return <AdminApiTests />;
}
