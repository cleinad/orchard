'use client';

export interface ConversationListItem {
  id: string;
  mentor_id: string | null;
  title: string | null;
  updated_at: string;
  created_at: string;
  preview: string;
  mentor_name: string;
  mentor_accent_color: string | null;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  conversations: ConversationListItem[];
  activeConversationId: string | null;
  onSelectConversation: (conversation: ConversationListItem) => void;
  onNewNovusChat: () => void;
}

function formatDate(input: string): string {
  const date = new Date(input);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default function ConversationsPanel({
  isOpen,
  onClose,
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewNovusChat,
}: Props) {
  return (
    <div
      className={`fixed inset-0 z-40 transition-all duration-300 ${
        isOpen ? 'pointer-events-auto' : 'pointer-events-none'
      }`}
    >
      <div
        className={`absolute inset-0 bg-foreground/[0.06] backdrop-blur-sm transition-opacity duration-300 dark:bg-black/40 ${
          isOpen ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={onClose}
      />

      <aside
        className={`absolute left-0 top-0 h-full w-[420px] max-w-[90vw] transform transition-transform duration-300 ease-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div
          className="flex h-full flex-col backdrop-blur-2xl"
          style={{
            background: 'color-mix(in srgb, var(--surface) 94%, transparent)',
            borderRight: '1px solid var(--border-subtle)',
          }}
        >
          <div className="flex items-center justify-between border-b border-border-subtle px-5 py-4">
            <div>
              <h2 className="text-sm font-medium text-foreground">
                Conversations
              </h2>
              <p className="mt-0.5 text-xs text-muted">
                Unified history across Novus and mentors
              </p>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-muted transition hover:bg-foreground/[0.04] hover:text-foreground"
              aria-label="Close"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="border-b border-border-subtle px-4 py-3">
            <button
              type="button"
              onClick={() => {
                onNewNovusChat();
                onClose();
              }}
              className="w-full rounded-xl border border-border-subtle bg-surface px-3 py-2.5 text-left text-sm font-semibold text-foreground/84 transition hover:border-foreground/[0.12] hover:bg-foreground/[0.03] hover:text-foreground"
            >
              New Novus Chat
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-3">
            {conversations.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border-subtle p-4 text-sm text-muted">
                No conversations yet.
              </div>
            ) : (
              <div className="space-y-2">
                {conversations.map((conversation) => {
                  const isActive = activeConversationId === conversation.id;
                  return (
                    <button
                      key={conversation.id}
                      type="button"
                      onClick={() => {
                        onSelectConversation(conversation);
                        onClose();
                      }}
                      className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                        isActive
                          ? 'border-foreground/[0.16] bg-foreground/[0.05]'
                          : 'border-border-subtle bg-surface hover:border-foreground/[0.10] hover:bg-foreground/[0.03]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                            style={{
                              backgroundColor:
                                conversation.mentor_accent_color || '#94A3B8',
                            }}
                          />
                          <span className="truncate text-sm font-semibold text-foreground">
                            {conversation.mentor_name}
                          </span>
                        </div>
                        <span className="flex-shrink-0 text-xs text-muted">
                          {formatDate(conversation.updated_at)}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted">
                        {conversation.preview || conversation.title || 'No messages yet'}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
