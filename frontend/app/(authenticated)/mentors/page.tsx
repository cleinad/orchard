'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import ThemePicker from '@/app/components/ThemePicker';
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

  useEffect(() => {
    async function init() {
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
  }, []);

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
    <div className="relative min-h-screen bg-background text-foreground">
      <HomeBackground />

      <div className="relative mx-auto max-w-5xl px-4 sm:px-6">
        {/* Header */}
        <header className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.push('/home')}
              aria-label="Back to chat"
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-muted transition hover:text-foreground"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
            </button>
            <h1 className="font-heading text-2xl text-foreground">
              Mentors
            </h1>
          </div>
          <ThemePicker />
        </header>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-32">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted/20 border-t-muted" />
          </div>
        ) : error ? (
          <div className="py-16 text-center text-sm text-muted">
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
                  className="group relative rounded-xl bg-surface p-5 text-left shadow-sm ring-1 ring-black/[0.04] transition-all duration-200 hover:shadow-md hover:ring-black/[0.06] dark:ring-white/[0.06] dark:hover:ring-white/[0.08]"
                >
                  {/* Accent bar */}
                  <div
                    className="absolute left-5 right-5 top-0 h-0.5"
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
                        className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-xs font-medium"
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
                        <span className="truncate font-heading text-base text-foreground">
                          {mentor.name}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted">
                        {mentor.tagline}
                      </p>
                    </div>
                  </div>

                  {mentor.description && (
                    <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-muted/70">
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
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted/40 transition-colors hover:bg-foreground/[0.04] hover:text-muted dark:hover:bg-foreground/[0.06]">
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
              className="group flex flex-col items-center justify-center rounded-xl border border-dashed border-muted/30 p-8 text-center transition-colors hover:border-muted/50 hover:bg-surface/50"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-foreground/[0.04] transition-colors group-hover:bg-foreground/[0.08]">
                <svg
                  className="h-5 w-5 text-muted"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              </div>
              <span className="mt-3 text-sm font-medium text-muted transition-colors group-hover:text-foreground">
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

    </div>
  );
}
