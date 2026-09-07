import SettingsClient from '@/app/settings/SettingsClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export default function SettingsPage() {
  return <SettingsClient />;
}
