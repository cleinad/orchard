import type { ReactNode } from 'react';
import { ChatRunCoordinator } from '@/app/components/ChatRunCoordinator';
import { ViewerProvider } from '@/app/components/ViewerContext';
import { getSettingsViewer } from '@/app/settings/data';

export default async function AuthenticatedLayout({
  children,
}: {
  children: ReactNode;
}) {
  const viewerResult = await getSettingsViewer();

  return (
    <ViewerProvider initialViewerResult={viewerResult}>
      <ChatRunCoordinator>{children}</ChatRunCoordinator>
    </ViewerProvider>
  );
}
