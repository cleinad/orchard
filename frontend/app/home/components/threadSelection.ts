/**
 * Thread creation is only available from a settled, non-error assistant reply.
 *
 * A streaming reply is rejected because its rendered content, and therefore the
 * selection offsets measured against it, still move as tokens arrive. Its local
 * run id is also replaced by the persisted message id when the run completes, so
 * a thread captured mid-stream would point at a message that no longer exists.
 */
export interface ThreadSelectionMessage {
  isError: boolean;
  isStreaming: boolean;
  role: string | null;
}

export function isThreadSelectableMessage({
  isError,
  isStreaming,
  role,
}: ThreadSelectionMessage): boolean {
  return role === 'assistant' && !isError && !isStreaming;
}
