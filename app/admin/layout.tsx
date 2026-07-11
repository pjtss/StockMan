import type { ReactNode } from "react";
import { AdminLogin } from "@/components/admin-login";
import { requireAdminSession } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const loggedIn = await requireAdminSession();
  return loggedIn ? children : <AdminLogin />;
}
