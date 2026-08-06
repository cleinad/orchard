import type { Metadata } from 'next';
import { unstable_noStore as noStore } from 'next/cache';
import { notFound } from 'next/navigation';
import {
  AdminDashboard,
  AdminDashboardError,
} from '@/app/admin/AdminDashboard';
import { authorizeAdminUser } from '@/lib/admin/authorization';
import { loadAdminUsageDashboard } from '@/lib/admin/usage';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';
export const metadata: Metadata = {
  title: 'Usage telemetry · Orchard',
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AdminPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
} = {}) {
  noStore();
  const authorization = await authorizeAdminUser();
  if (!authorization) notFound();

  let dashboard;
  try {
    dashboard = await loadAdminUsageDashboard(
      authorization,
      await searchParams ?? {},
      new Date()
    );
  } catch {
    return <AdminDashboardError retryHref="/admin" />;
  }
  return <AdminDashboard dashboard={dashboard} refreshedAt={new Date()} />;
}
