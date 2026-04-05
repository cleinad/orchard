interface ResolvedChatModelResponse {
  resolvedModelId?: string;
  resolvedProvider?: string;
}

export function logResolvedChatModel(
  response: ResolvedChatModelResponse,
  source: 'composer' | 'thread' | 'selection'
) {
  if (process.env.NODE_ENV === 'production') {
    return;
  }

  if (!response.resolvedModelId || !response.resolvedProvider) {
    return;
  }

  console.debug(`[chat:${source}]`, {
    resolvedModelId: response.resolvedModelId,
    resolvedProvider: response.resolvedProvider,
  });
}
