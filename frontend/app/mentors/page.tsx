'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import ThemeToggle from '@/app/components/ThemeToggle';
import HomeBackground from '@/app/home/components/HomeBackground';
import MentorDetailPanel from '@/app/home/components/MentorDetailPanel';
import CreateMentorPanel from '@/app/home/components/CreateMentorPanel';
import type { MentorListItem } from '@/lib/mentors/types';
import { initialsFor, accentTint } from '@/lib/mentors/ui-helpers';

export default function MentorsPage() {
  const router = useRouter();
  const [mentors, setMentors] = useState<MentorListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [detailSlug, setDetailSlug] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  // Auth check + fetch mentors
  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace('/login');
        return;
      }

      try {
        const res = await fetch('/api/mentors', { cache: 'no-store' });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || 'Failed to load mentors');
        setMentors(data as MentorListItem[]);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load mentors');
      } finally {
        setLoading(false);
      }
    }
    void init();
  }, [router]);

  const refreshMentors = async () => {
    try {
      const res = await fetch('/api/mentors', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to load mentors');
      setMentors(data as MentorListItem[]);
    } catch {
      // silent
    }
  };

  return (
    <div className="relative min-h-screen bg-[#faf9f6] text-stone-900 dark:bg-[#0c0c0b] dark:text-stone-100">
      <HomeBackground />

      {/* Grain texture */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.012] dark:opacity-[0.025]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
        }}
      />

      <div className="relative mx-auto max-w-5xl px-4 sm:px-6">
        {/* Header */}
        <header className="flex items-center justify-between py-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.push('/home')}
              aria-label="Back to chat"
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-stone-400 transition hover:text-stone-600 dark:text-stone-500 dark:hover:text-stone-300"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
            </button>
            <h1 className="font-heading text-2xl text-stone-800 dark:text-stone-100">
              Mentors
            </h1>
          </div>
          <ThemeToggle />
        </header>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-32">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-stone-200 border-t-stone-500 dark:border-stone-700 dark:border-t-stone-400" />
          </div>
        ) : error ? (
          <div className="py-16 text-center text-sm text-stone-500 dark:text-stone-400">
            {error}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 pb-12 sm:grid-cols-2 lg:grid-cols-3">
            {mentors.map((mentor) => {
              const accent = mentor.accent_color || '#94a3b8';
              return (
                <button
                  key={mentor.id}
                  type="button"
                  onClick={() => router.push(`/home?mentor=${mentor.slug}`)}
                  className="mentor-card group relative rounded-2xl border border-stone-200/60 bg-white/70 p-5 text-left backdrop-blur-sm transition-all duration-200 hover:border-stone-300/80 hover:bg-white/90 hover:shadow-lg dark:border-stone-800/50 dark:bg-[#161615]/70 dark:hover:border-stone-700/60 dark:hover:bg-[#1a1a19]/90"
                >
                  {/* Accent bar */}
                  <div
                    className="absolute left-5 right-5 top-0 h-px"
                    style={{ backgroundColor: accentTint(accent, 0.3) }}
                  />

                  <div className="flex items-start gap-4">
                    {/* Avatar */}
                    {mentor.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={mentor.avatar_url}
                        alt=""
                        className="h-11 w-11 flex-shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      <div
                        className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-medium"
                        style={{
                          backgroundColor: accentTint(accent, 0.1),
                          color: accent,
                        }}
                      >
                        {initialsFor(mentor.name)}
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-heading text-[15px] text-stone-800 dark:text-stone-100">
                          {mentor.name}
                        </span>
                        {mentor.conversation_id && (
                          <span
                            className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
                            style={{ backgroundColor: accent }}
                          />
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-[12px] text-stone-500 dark:text-stone-400">
                        {mentor.tagline}
                      </p>
                    </div>
                  </div>

                  {mentor.description && (
                    <p className="mt-3 line-clamp-2 text-[12px] leading-relaxed text-stone-400 dark:text-stone-500">
                      {mentor.description}
                    </p>
                  )}

                  {/* Customize button — hover reveal */}
                  <div
                    className="absolute right-3 top-3 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDetailSlug(mentor.slug);
                      setDetailOpen(true);
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.stopPropagation();
                        setDetailSlug(mentor.slug);
                        setDetailOpen(true);
                      }
                    }}
                    aria-label={`Customize ${mentor.name}`}
                  >
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-stone-300 transition-colors hover:bg-stone-100 hover:text-stone-500 dark:text-stone-600 dark:hover:bg-stone-800 dark:hover:text-stone-400">
                      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <circle cx="12" cy="12" r="1" />
                        <circle cx="12" cy="5" r="1" />
                        <circle cx="12" cy="19" r="1" />
                      </svg>
                    </span>
                  </div>
                </button>
              );
            })}

            {/* Create Mentor card */}
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="group flex flex-col items-center justify-center rounded-2xl border border-dashed border-stone-300/60 bg-transparent p-8 text-center transition-all duration-200 hover:border-stone-400/70 hover:bg-white/40 dark:border-stone-700/50 dark:hover:border-stone-600/60 dark:hover:bg-[#161615]/40"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-stone-100 transition-colors group-hover:bg-stone-200 dark:bg-stone-800 dark:group-hover:bg-stone-700">
                <svg
                  className="h-5 w-5 text-stone-400 dark:text-stone-500"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              </div>
              <span className="mt-3 text-[13px] font-medium text-stone-400 transition-colors group-hover:text-stone-600 dark:text-stone-500 dark:group-hover:text-stone-300">
                Create Mentor
              </span>
            </button>
          </div>
        )}
      </div>

      <MentorDetailPanel
        isOpen={detailOpen}
        slug={detailSlug}
        onClose={() => setDetailOpen(false)}
        onUpdated={() => void refreshMentors()}
        onDeleted={() => void refreshMentors()}
      />
      <CreateMentorPanel
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(mentor) => {
          router.push(`/home?mentor=${mentor.slug}`);
        }}
      />

      <style jsx>{`
        .mentor-card {
          box-shadow:
            0 0 0 1px rgba(0, 0, 0, 0.03),
            0 1px 4px rgba(0, 0, 0, 0.02);
        }

        .mentor-card:hover {
          box-shadow:
            0 0 0 1px rgba(0, 0, 0, 0.05),
            0 4px 16px rgba(0, 0, 0, 0.06),
            0 8px 32px rgba(0, 0, 0, 0.03);
        }

        :global(.dark) .mentor-card {
          box-shadow:
            0 0 0 1px rgba(255, 255, 255, 0.04),
            0 1px 4px rgba(0, 0, 0, 0.1);
        }

        :global(.dark) .mentor-card:hover {
          box-shadow:
            0 0 0 1px rgba(255, 255, 255, 0.06),
            0 4px 16px rgba(0, 0, 0, 0.2),
            0 8px 32px rgba(0, 0, 0, 0.15);
        }
      `}</style>
    </div>
  );
}
