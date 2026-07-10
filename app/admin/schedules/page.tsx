import { AdminScannerSchedules } from "@/components/admin-scanner-schedules";
import { AdminDashboard } from "@/components/admin-dashboard";
import { requireAdminSession } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export default async function AdminSchedulesPage() {
  const loggedIn = await requireAdminSession().catch(() => false);
  return loggedIn ? <AdminScannerSchedules /> : <AdminDashboard loggedIn={false} />;
}
