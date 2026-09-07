import { notFound } from 'next/navigation';
import WorkspaceClient from '@/app/workspaces/[workspaceId]/WorkspaceClient';
import { getWorkspaceDetail } from '@/app/workspaces/[workspaceId]/data';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export default async function WorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<{ e2e?: string | string[] }>;
}) {
  const [{ workspaceId }, query] = await Promise.all([params, searchParams]);
  const e2eQuery = typeof query.e2e === 'string' ? query.e2e : null;

  if (process.env.KEEN_E2E_BYPASS_AUTH === '1' && e2eQuery) {
    return (
      <WorkspaceClient
        workspaceId={workspaceId}
        initialWorkspace={null}
        loadWorkspaceInBrowser
      />
    );
  }

  const workspace = await getWorkspaceDetail(workspaceId);
  if (!workspace) {
    notFound();
  }

  return (
    <WorkspaceClient
      workspaceId={workspaceId}
      initialWorkspace={workspace}
    />
  );
}
