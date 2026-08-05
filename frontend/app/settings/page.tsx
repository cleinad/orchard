import SettingsClient from '@/app/settings/SettingsClient';
import { getSettingsViewer } from '@/app/settings/data';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export default async function SettingsPage() {
  const viewerResult = await getSettingsViewer();
  return <SettingsClient viewerResult={viewerResult} />;
}
