'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface MentorDetail {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  description: string | null;
  base_system_prompt: string | null;
  user_instructions: string;
  is_builtin: boolean;
  accent_color: string | null;
  avatar_url: string | null;
}

interface Props {
  isOpen: boolean;
  slug: string | null;
  onClose: () => void;
  onUpdated: () => void;
  onDeleted: (slug: string) => void;
}

const DEFAULT_ACCENT = '#4A90D9';

export default function MentorDetailPanel({
  isOpen,
  slug,
  onClose,
  onUpdated,
  onDeleted,
}: Props) {
  const [currentSlug, setCurrentSlug] = useState<string | null>(slug);
  const [mentor, setMentor] = useState<MentorDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [tagline, setTagline] = useState('');
  const [description, setDescription] = useState('');
  const [basePrompt, setBasePrompt] = useState('');
  const [userInstructions, setUserInstructions] = useState('');
  const [accentColor, setAccentColor] = useState(DEFAULT_ACCENT);
  const [avatarUrl, setAvatarUrl] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setCurrentSlug(slug);
  }, [isOpen, slug]);

  useEffect(() => {
    if (!isOpen || !currentSlug) return;

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/mentors/${currentSlug}`);
        const data = await response.json();

        if (!response.ok || data.error) {
          throw new Error(data.error || 'Failed to load mentor');
        }

        if (cancelled) return;

        const nextMentor = data as MentorDetail;
        setMentor(nextMentor);
        setName(nextMentor.name || '');
        setTagline(nextMentor.tagline || '');
        setDescription(nextMentor.description || '');
        setBasePrompt(nextMentor.base_system_prompt || '');
        setUserInstructions(nextMentor.user_instructions || '');
        setAccentColor(nextMentor.accent_color || DEFAULT_ACCENT);
        setAvatarUrl(nextMentor.avatar_url || '');
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load mentor');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [isOpen, currentSlug]);

  const panelTitle = useMemo(() => {
    if (!mentor) return 'Customize Mentor';
    return mentor.is_builtin ? `Customize ${mentor.name}` : `Edit ${mentor.name}`;
  }, [mentor]);

  const handleUploadAvatar = async (file: File) => {
    if (!mentor) return;

    setUploading(true);
    setError(null);

    try {
      const response = await fetch('/api/mentors/avatar/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_name: file.name,
          content_type: file.type,
          mentor_id: mentor.id,
        }),
      });

      const data = await response.json();
      if (!response.ok || data.error) {
        throw new Error(data.error || 'Failed to create upload URL');
      }

      const { bucket, path, upload_token: uploadToken, public_url: publicUrl } = data as {
        bucket: string;
        path: string;
        upload_token: string;
        public_url: string;
      };

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .uploadToSignedUrl(path, uploadToken, file);

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      setAvatarUrl(publicUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Avatar upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!mentor || !currentSlug) return;

    setSaving(true);
    setError(null);

    try {
      const patchBody = mentor.is_builtin
        ? {
            user_instructions: userInstructions,
            accent_color: accentColor || null,
            avatar_url: avatarUrl || null,
          }
        : {
            name,
            tagline,
            description: description || null,
            base_system_prompt: basePrompt,
            user_instructions: userInstructions,
            accent_color: accentColor || null,
            avatar_url: avatarUrl || null,
          };

      const response = await fetch(`/api/mentors/${currentSlug}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patchBody),
      });

      const data = await response.json();
      if (!response.ok || data.error) {
        throw new Error(data.error || 'Failed to save mentor');
      }

      const updated = data as MentorDetail;
      setMentor(updated);
      setCurrentSlug(updated.slug);
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save mentor');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!mentor || !currentSlug || mentor.is_builtin) return;
    if (!window.confirm(`Delete ${mentor.name}? This will remove its conversation.`)) return;

    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/mentors/${currentSlug}`, {
        method: 'DELETE',
      });

      const data = await response.json();
      if (!response.ok || data.error) {
        throw new Error(data.error || 'Failed to delete mentor');
      }

      onDeleted(currentSlug);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete mentor');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className={`fixed inset-0 z-50 transition-all duration-300 ${
        isOpen ? 'pointer-events-auto' : 'pointer-events-none'
      }`}
    >
      <div
        className={`absolute inset-0 bg-black/10 transition-opacity duration-300 dark:bg-black/40 ${
          isOpen ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={onClose}
      />

      <aside
        className={`absolute right-0 top-0 h-full w-[460px] max-w-[95vw] transform transition-transform duration-300 ease-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex h-full flex-col border-l border-black/[0.06] bg-background shadow-xl dark:border-white/[0.06] dark:bg-[#131312]">
          <div className="flex items-center justify-between border-b border-black/[0.06] px-5 py-4 dark:border-white/[0.06]">
            <div>
              <h2 className="text-sm font-medium text-foreground">
                {panelTitle}
              </h2>
              <p className="mt-0.5 text-xs text-muted">
                {mentor?.is_builtin
                  ? 'Built-in mentor: behavior prompt is locked'
                  : 'Custom mentor: all fields editable'}
              </p>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-muted transition hover:text-foreground"
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

          <div className="flex-1 overflow-y-auto px-5 py-4">
            {loading ? (
              <div className="flex items-center justify-center py-10">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted/20 border-t-muted" />
              </div>
            ) : !mentor ? (
              <p className="text-sm text-muted">
                Select a mentor to customize.
              </p>
            ) : (
              <div className="space-y-4">
                {!mentor.is_builtin && (
                  <>
                    <Field label="Name">
                      <input
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        className="w-full rounded-lg bg-surface px-3 py-2 text-sm text-foreground outline-none ring-1 ring-black/[0.06] focus:ring-black/[0.12] dark:ring-white/[0.06] dark:focus:ring-white/[0.12]"
                      />
                    </Field>

                    <Field label="Tagline">
                      <input
                        value={tagline}
                        onChange={(event) => setTagline(event.target.value)}
                        className="w-full rounded-lg bg-surface px-3 py-2 text-sm text-foreground outline-none ring-1 ring-black/[0.06] focus:ring-black/[0.12] dark:ring-white/[0.06] dark:focus:ring-white/[0.12]"
                      />
                    </Field>

                    <Field label="Description">
                      <textarea
                        value={description}
                        onChange={(event) => setDescription(event.target.value)}
                        rows={4}
                        className="w-full rounded-lg bg-surface px-3 py-2 text-sm text-foreground outline-none ring-1 ring-black/[0.06] focus:ring-black/[0.12] dark:ring-white/[0.06] dark:focus:ring-white/[0.12]"
                      />
                    </Field>
                  </>
                )}

                <Field label="Accent color">
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={accentColor || DEFAULT_ACCENT}
                      onChange={(event) => setAccentColor(event.target.value.toUpperCase())}
                      className="h-10 w-14 cursor-pointer rounded-lg bg-surface p-1 ring-1 ring-black/[0.06] dark:ring-white/[0.06]"
                    />
                    <input
                      value={accentColor}
                      onChange={(event) => setAccentColor(event.target.value.toUpperCase())}
                      className="w-full rounded-lg bg-surface px-3 py-2 text-sm text-foreground outline-none ring-1 ring-black/[0.06] focus:ring-black/[0.12] dark:ring-white/[0.06] dark:focus:ring-white/[0.12]"
                    />
                  </div>
                </Field>

                <Field label="Avatar">
                  <div className="space-y-2">
                    {avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={avatarUrl}
                        alt="Mentor avatar"
                        className="h-20 w-20 rounded-xl object-cover"
                      />
                    ) : (
                      <div className="flex h-20 w-20 items-center justify-center rounded-xl border border-dashed border-muted/30 text-xs text-muted">
                        No avatar
                      </div>
                    )}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) {
                          void handleUploadAvatar(file);
                        }
                        event.currentTarget.value = '';
                      }}
                      disabled={uploading}
                      className="block w-full text-xs text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-foreground file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-background"
                    />
                    {avatarUrl && (
                      <button
                        type="button"
                        onClick={() => setAvatarUrl('')}
                        className="text-xs text-muted underline"
                      >
                        Remove avatar
                      </button>
                    )}
                  </div>
                </Field>

                <Field label="Always know about me">
                  <textarea
                    value={userInstructions}
                    onChange={(event) => setUserInstructions(event.target.value)}
                    rows={5}
                    placeholder="Preferences, boundaries, constraints..."
                    className="w-full rounded-lg bg-surface px-3 py-2 text-sm text-foreground outline-none ring-1 ring-black/[0.06] focus:ring-black/[0.12] dark:ring-white/[0.06] dark:focus:ring-white/[0.12]"
                  />
                </Field>

                {!mentor.is_builtin && (
                  <Field label="Base system prompt">
                    <textarea
                      value={basePrompt}
                      onChange={(event) => setBasePrompt(event.target.value)}
                      rows={12}
                      className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 font-mono text-xs text-stone-900 outline-none focus:border-stone-400 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:focus:border-stone-600"
                    />
                  </Field>
                )}

                {error && (
                  <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">
                    {error}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-black/[0.06] px-5 py-3 dark:border-white/[0.06]">
            <div>
              {mentor && !mentor.is_builtin && (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={saving}
                  className="rounded-lg px-3 py-2 text-xs font-semibold text-rose-600 transition hover:bg-rose-50/50 disabled:opacity-50 dark:text-rose-400 dark:hover:bg-rose-900/20"
                >
                  Delete Mentor
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || loading || !mentor}
              className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background transition hover:opacity-80 disabled:opacity-50"
            >
              {uploading ? 'Uploading...' : saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted">
        {label}
      </span>
      {children}
    </label>
  );
}
