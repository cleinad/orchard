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
        className={`absolute inset-0 bg-black/20 backdrop-blur-sm transition-opacity duration-300 dark:bg-black/40 ${
          isOpen ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={onClose}
      />

      <aside
        className={`absolute left-0 top-0 h-full w-[420px] max-w-[90vw] transform transition-transform duration-300 ease-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-full flex-col border-r border-stone-200/50 bg-white/90 backdrop-blur-2xl dark:border-stone-800/50 dark:bg-[#111111]/95">
          <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4 dark:border-stone-800/50">
            <div>
              <h2 className="text-sm font-medium text-stone-800 dark:text-stone-100">
                Conversations
              </h2>
              <p className="mt-0.5 text-xs text-stone-400 dark:text-stone-500">
                Unified history across Novus and mentors
              </p>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-stone-400 transition hover:bg-stone-100 hover:text-stone-600 dark:text-stone-500 dark:hover:bg-stone-800 dark:hover:text-stone-300"
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

          <div className="border-b border-stone-100 px-4 py-3 dark:border-stone-800/50">
            <button
              type="button"
              onClick={() => {
                onNewNovusChat();
                onClose();
              }}
              className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-left text-sm font-semibold text-stone-700 transition hover:border-stone-300 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:border-stone-600"
            >
              New Novus Chat
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-3">
            {conversations.length === 0 ? (
              <div className="rounded-xl border border-dashed border-stone-300 p-4 text-sm text-stone-500 dark:border-stone-700 dark:text-stone-400">
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
                          ? 'border-stone-900 bg-stone-50 dark:border-stone-300 dark:bg-stone-900/70'
                          : 'border-stone-200 bg-white hover:border-stone-300 dark:border-stone-800 dark:bg-stone-900/40 dark:hover:border-stone-700'
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
                          <span className="truncate text-sm font-semibold text-stone-800 dark:text-stone-100">
                            {conversation.mentor_name}
                          </span>
                        </div>
                        <span className="flex-shrink-0 text-[11px] text-stone-400 dark:text-stone-500">
                          {formatDate(conversation.updated_at)}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-stone-500 dark:text-stone-400">
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
