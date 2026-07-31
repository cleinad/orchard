import { notFound } from 'next/navigation';
import { authorizeAdminUser } from '@/lib/admin/authorization';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AdminPage() {
  const authorization = await authorizeAdminUser();
  if (!authorization) notFound();

  return (
    <main>
      <h1>Usage administration</h1>
    </main>
  );
}
