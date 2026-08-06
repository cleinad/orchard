import HomePageClient from './HomePageClient';
import { getHomeConversationInitialData } from '@/app/home/server-data';
import { notFound, redirect } from 'next/navigation';

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
  const initialConversationResult =
    selectedConversationId
    && process.env.KEEN_E2E_BYPASS_AUTH !== '1'
      ? await getHomeConversationInitialData(selectedConversationId)
      : null;

  if (initialConversationResult?.status === 'unauthorized') {
    redirect(
      `/login?redirect=${encodeURIComponent(`/home/${selectedConversationId}`)}`
    );
  }
  if (initialConversationResult?.status === 'not-found') {
    notFound();
  }

  return (
    <HomePageClient
      initialConversationData={
        initialConversationResult?.status === 'ready'
          ? initialConversationResult.data
          : null
      }
      initialConversationFailure={
        initialConversationResult?.status === 'unavailable'
          ? initialConversationResult.reason
          : null
      }
    />
  );
}
