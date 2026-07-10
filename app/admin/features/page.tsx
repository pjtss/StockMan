import { AdminFeatureFlags } from "@/components/admin-feature-flags";
import { requireAdminSession } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export default async function AdminFeaturesPage() {
  const loggedIn = await requireAdminSession();
  return <AdminFeatureFlags loggedIn={loggedIn} />;
}
