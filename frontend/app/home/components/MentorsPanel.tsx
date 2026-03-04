'use client';

import { useMemo } from 'react';

export interface MentorListItem {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  is_builtin: boolean;
  accent_color: string | null;
  avatar_url: string | null;
  conversation_id: string | null;
  conversation_updated_at?: string | null;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  mentors: MentorListItem[];
  activeMentorId: string | null;
  onSelectMentor: (mentor: MentorListItem) => void;
  onSelectNovus: () => void;
  onOpenMentorDetail: (slug: string) => void;
  onCreateMentor: () => void;
}

function initialsFor(name: string): string {
  const words = name
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

function accentTint(hex: string, opacity: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

export default function MentorsPanel({
  isOpen,
  onClose,
  mentors,
  activeMentorId,
  onSelectMentor,
  onSelectNovus,
  onOpenMentorDetail,
  onCreateMentor,
}: Props) {
  const activeCount = useMemo(
    () => mentors.filter((m) => !!m.conversation_id).length,
    [mentors]
  );

  return (
    <div
      className={`fixed inset-0 z-40 transition-all duration-300 ${
        isOpen ? 'pointer-events-auto' : 'pointer-events-none'
      }`}
    >
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-stone-500/8 backdrop-blur-sm transition-opacity duration-300 dark:bg-black/40 ${
          isOpen ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={onClose}
      />

      {/* Panel */}
      <aside
        className={`absolute left-0 top-0 h-full w-[380px] max-w-[85vw] transform transition-transform duration-300 ease-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="mentors-panel flex h-full flex-col bg-[#faf9f6]/97 backdrop-blur-2xl dark:bg-[#111110]/97">
          {/* Header */}
          <div className="px-6 pb-3 pt-6">
            <div className="flex items-center justify-between">
              <h2 className="font-heading text-lg text-stone-800 dark:text-stone-100">
                Mentors
              </h2>
              <button
                onClick={onClose}
                className="rounded-full p-1.5 text-stone-300 transition-colors hover:text-stone-500 dark:text-stone-600 dark:hover:text-stone-400"
                aria-label="Close"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
            <p className="mt-1 text-[11px] text-stone-400 dark:text-stone-500">
              {mentors.length} available · {activeCount} active
            </p>
          </div>

          {/* Novus — home base */}
          <div className="px-3 pb-2">
            <button
              type="button"
              onClick={() => {
                onSelectNovus();
                onClose();
              }}
              className={`group w-full rounded-xl px-3 py-2.5 text-left transition-colors duration-150 ${
                activeMentorId === null
                  ? 'bg-stone-200/50 dark:bg-stone-800/40'
                  : 'hover:bg-stone-100/60 dark:hover:bg-stone-800/25'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-stone-300/40 dark:bg-stone-700/50">
                  <span className="text-[11px] font-medium text-stone-500 dark:text-stone-400">
                    N
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <span className="font-heading text-[13px] text-stone-800 dark:text-stone-100">
                    Novus
                  </span>
                  <p className="text-[11px] leading-tight text-stone-400 dark:text-stone-500">
                    Your personal assistant
                  </p>
                </div>
                {activeMentorId === null && (
                  <span className="h-1.5 w-1.5 rounded-full bg-stone-400 dark:bg-stone-500" />
                )}
              </div>
            </button>
          </div>

          {/* Divider */}
          <div className="mx-6 h-px bg-stone-200/50 dark:bg-stone-800/50" />

          {/* Scrollable mentor list */}
          <div className="mentors-scroll-area relative min-h-0 flex-1">
            <div className="mentors-scroll h-full overflow-y-auto px-3 py-2">
              {mentors.length === 0 ? (
                <div className="px-3 py-10 text-center text-sm text-stone-400 dark:text-stone-500">
                  No mentors yet.
                </div>
              ) : (
                <div>
                  {mentors.map((mentor) => {
                    const isActive = activeMentorId === mentor.id;
                    const accent = mentor.accent_color || '#94a3b8';
                    return (
                      <div
                        key={mentor.id}
                        className={`group rounded-xl transition-colors duration-150 ${
                          isActive
                            ? 'bg-stone-200/50 dark:bg-stone-800/40'
                            : 'hover:bg-stone-100/60 dark:hover:bg-stone-800/25'
                        }`}
                      >
                        <div className="flex items-center gap-3 px-3 py-2.5">
                          {/* Avatar */}
                          {mentor.avatar_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={mentor.avatar_url}
                              alt=""
                              className="h-8 w-8 flex-shrink-0 rounded-full object-cover"
                            />
                          ) : (
                            <div
                              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-medium"
                              style={{
                                backgroundColor: accentTint(accent, 0.1),
                                color: accent,
                              }}
                            >
                              {initialsFor(mentor.name)}
                            </div>
                          )}

                          {/* Name + tagline */}
                          <button
                            type="button"
                            onClick={() => {
                              onSelectMentor(mentor);
                              onClose();
                            }}
                            className="min-w-0 flex-1 text-left"
                          >
                            <div className="flex items-center gap-1.5">
                              <span className="truncate font-heading text-[13px] text-stone-800 dark:text-stone-100">
                                {mentor.name}
                              </span>
                              {mentor.conversation_id && (
                                <span
                                  className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
                                  style={{ backgroundColor: accent }}
                                />
                              )}
                            </div>
                            <p className="mt-0.5 truncate text-[11px] leading-snug text-stone-400 dark:text-stone-500">
                              {mentor.tagline}
                            </p>
                          </button>

                          {/* Customize — appears on hover */}
                          <button
                            type="button"
                            onClick={() => onOpenMentorDetail(mentor.slug)}
                            className="flex-shrink-0 rounded-full p-1.5 text-stone-300 opacity-0 transition-all duration-150 hover:text-stone-500 group-hover:opacity-100 dark:text-stone-600 dark:hover:text-stone-400"
                            aria-label={`Customize ${mentor.name}`}
                          >
                            <svg
                              className="h-3.5 w-3.5"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.5"
                            >
                              <circle cx="12" cy="12" r="1" />
                              <circle cx="12" cy="5" r="1" />
                              <circle cx="12" cy="19" r="1" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Top fade mask */}
            <div className="pointer-events-none absolute inset-x-0 top-0 h-3 bg-gradient-to-b from-[#faf9f6]/97 to-transparent dark:from-[#111110]/97" />
            {/* Bottom fade mask */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-3 bg-gradient-to-t from-[#faf9f6]/97 to-transparent dark:from-[#111110]/97" />
          </div>

          {/* Create button */}
          <div className="px-4 pb-5 pt-2">
            <button
              type="button"
              onClick={onCreateMentor}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-stone-200/60 px-4 py-2.5 text-[12px] font-medium text-stone-400 transition-colors duration-150 hover:border-stone-300/70 hover:text-stone-600 dark:border-stone-800/50 dark:text-stone-500 dark:hover:border-stone-700/60 dark:hover:text-stone-300"
            >
              <svg
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 4.5v15m7.5-7.5h-15"
                />
              </svg>
              Create Mentor
            </button>
          </div>
        </div>
      </aside>

      <style jsx>{`
        .mentors-panel {
          box-shadow:
            6px 0 32px rgba(0, 0, 0, 0.04),
            1px 0 8px rgba(0, 0, 0, 0.02);
        }

        :global(.dark) .mentors-panel {
          box-shadow:
            6px 0 32px rgba(0, 0, 0, 0.3),
            1px 0 8px rgba(0, 0, 0, 0.15);
        }

        .mentors-scroll {
          scrollbar-width: none;
        }

        .mentors-scroll::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  );
}
