import { requireAdmin } from '~/lib/server/require-admin';

/**
 * Admin layout — server-side protection.
 * Any page under /home/admin/* passes through this layout,
 * which blocks non-admin users BEFORE rendering any children.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // This will redirect non-admin users to /home
  await requireAdmin();

  return <>{children}</>;
}
