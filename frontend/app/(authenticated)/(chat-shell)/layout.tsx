import type { ReactNode } from 'react';
import ChatShell from '@/app/home/components/ChatShell';
import { getHomeBootstrap } from '@/app/home/server-data';

export default async function ChatShellLayout({
  children,
}: {
  children: ReactNode;
}) {
  const initialBootstrap =
    process.env.KEEN_E2E_BYPASS_AUTH === '1'
      ? null
      : await getHomeBootstrap();

  return (
    <ChatShell initialBootstrap={initialBootstrap}>{children}</ChatShell>
  );
}
