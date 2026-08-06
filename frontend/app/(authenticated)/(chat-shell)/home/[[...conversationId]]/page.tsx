import HomePageClient from './HomePageClient';
import { getHomeConversationInitialData } from '@/app/home/server-data';
import { notFound } from 'next/navigation';

export default async function HomePage({
  params,
}: {
  params: Promise<{ conversationId?: string[] }>;
}) {
  const { conversationId } = await params;
  const selectedConversationId =
    Array.isArray(conversationId) && conversationId.length > 0
      ? conversationId[0]
      : null;
  const initialConversationData =
    selectedConversationId
    && process.env.KEEN_E2E_BYPASS_AUTH !== '1'
      ? await getHomeConversationInitialData(selectedConversationId)
      : null;

  if (
    selectedConversationId
    && process.env.KEEN_E2E_BYPASS_AUTH !== '1'
    && !initialConversationData
  ) {
    notFound();
  }

  return (
    <HomePageClient initialConversationData={initialConversationData} />
  );
}
