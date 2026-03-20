'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { MentorListItem } from '@/lib/mentors/types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (mentor: MentorListItem) => void;
}

const DEFAULT_ACCENT = '#4A90D9';

export default function CreateMentorPanel({ isOpen, onClose, onCreated }: Props) {
  const [ideaPrompt, setIdeaPrompt] = useState('');
  const [name, setName] = useState('');
  const [tagline, setTagline] = useState('');
  const [description, setDescription] = useState('');
  const [basePrompt, setBasePrompt] = useState('');
  const [accentColor, setAccentColor] = useState(DEFAULT_ACCENT);
  const [avatarUrl, setAvatarUrl] = useState('');

  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) return;
    setIdeaPrompt('');
    setName('');
    setTagline('');
    setDescription('');
    setBasePrompt('');
    setAccentColor(DEFAULT_ACCENT);
    setAvatarUrl('');
    setGenerating(false);
    setSaving(false);
    setUploading(false);
    setError(null);
  }, [isOpen]);

  const handleGenerate = async () => {
    if (!ideaPrompt.trim()) return;
    setGenerating(true);
    setError(null);
    try {
      const response = await fetch('/api/mentors/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: ideaPrompt }),
      });

      const data = await response.json();
      if (!response.ok || data.error) {
        throw new Error(data.error || 'Failed to generate mentor');
      }

      setName(data.name || '');
      setTagline(data.tagline || '');
      setDescription(data.description || '');
      setBasePrompt(data.base_system_prompt || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate mentor');
    } finally {
      setGenerating(false);
    }
  };

  const handleUploadAvatar = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const response = await fetch('/api/mentors/avatar/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_name: file.name,
          content_type: file.type,
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

  const handleCreate = async () => {
    if (!name.trim() || !tagline.trim() || !basePrompt.trim()) return;

    setSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/mentors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          tagline,
          description,
          base_system_prompt: basePrompt,
          accent_color: accentColor,
          avatar_url: avatarUrl || null,
        }),
      });

      const data = await response.json();
      if (!response.ok || data.error) {
        throw new Error(data.error || 'Failed to create mentor');
      }

      onCreated({
        id: data.id,
        slug: data.slug,
        name: data.name,
        tagline: data.tagline,
        description: data.description ?? null,
        is_builtin: data.is_builtin,
        accent_color: data.accent_color,
        avatar_url: data.avatar_url,
        conversation_id: null,
        conversation_updated_at: null,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create mentor');
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
        className={`absolute inset-0 bg-foreground/[0.06] transition-opacity duration-300 dark:bg-black/40 ${
          isOpen ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={onClose}
      />

      <aside
        className={`absolute right-0 top-0 h-full w-[500px] max-w-[95vw] transform transition-transform duration-300 ease-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div
          className="flex h-full flex-col bg-background shadow-xl"
          style={{ borderLeft: '1px solid var(--border-subtle)' }}
        >
          <div className="flex items-center justify-between border-b border-border-subtle px-5 py-4">
            <div>
              <h2 className="text-sm font-medium text-foreground">
                Create Mentor
              </h2>
              <p className="mt-0.5 text-xs text-muted">
                AI-assisted generation with manual editing before save
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
            <div className="space-y-4">
              <Field label="Describe the mentor you want">
                <textarea
                  rows={4}
                  value={ideaPrompt}
                  onChange={(event) => setIdeaPrompt(event.target.value)}
                  placeholder="I want a mentor who helps me prep for product management interviews..."
                  className="w-full rounded-lg bg-surface px-3 py-2 text-sm text-foreground outline-none ring-1 ring-border-subtle focus:ring-foreground/[0.12]"
                />
              </Field>

              <button
                type="button"
                onClick={handleGenerate}
                disabled={generating || !ideaPrompt.trim()}
                className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background transition hover:opacity-80 disabled:opacity-50"
              >
                {generating ? 'Generating...' : 'Generate Draft'}
              </button>

              <Field label="Name">
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="w-full rounded-lg bg-surface px-3 py-2 text-sm text-foreground outline-none ring-1 ring-border-subtle focus:ring-foreground/[0.12]"
                />
              </Field>

              <Field label="Tagline">
                <input
                  value={tagline}
                  onChange={(event) => setTagline(event.target.value)}
                  className="w-full rounded-lg bg-surface px-3 py-2 text-sm text-foreground outline-none ring-1 ring-border-subtle focus:ring-foreground/[0.12]"
                />
              </Field>

              <Field label="Description">
                <textarea
                  rows={4}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  className="w-full rounded-lg bg-surface px-3 py-2 text-sm text-foreground outline-none ring-1 ring-border-subtle focus:ring-foreground/[0.12]"
                />
              </Field>

              <Field label="Accent color">
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={accentColor || DEFAULT_ACCENT}
                    onChange={(event) => setAccentColor(event.target.value.toUpperCase())}
                    className="h-10 w-14 cursor-pointer rounded-lg bg-surface p-1 ring-1 ring-border-subtle"
                  />
                  <input
                    value={accentColor}
                    onChange={(event) => setAccentColor(event.target.value.toUpperCase())}
                    className="w-full rounded-lg bg-surface px-3 py-2 text-sm text-foreground outline-none ring-1 ring-border-subtle focus:ring-foreground/[0.12]"
                  />
                </div>
              </Field>

              <Field label="Avatar upload">
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
                </div>
              </Field>

              <Field label="System prompt / persona instructions">
                <textarea
                  rows={14}
                  value={basePrompt}
                  onChange={(event) => setBasePrompt(event.target.value)}
                  className="w-full rounded-xl border border-border-subtle bg-surface px-3 py-2 font-mono text-xs text-foreground outline-none focus:border-foreground/[0.14]"
                />
              </Field>

              {error && (
                <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">
                  {error}
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-border-subtle px-5 py-3">
            <button
              type="button"
              onClick={handleCreate}
              disabled={
                saving ||
                generating ||
                uploading ||
                !name.trim() ||
                !tagline.trim() ||
                !basePrompt.trim()
              }
              className="w-full rounded-lg bg-foreground px-4 py-2.5 text-sm font-semibold text-background transition hover:opacity-80 disabled:opacity-50"
            >
              {uploading ? 'Uploading avatar...' : saving ? 'Creating...' : 'Create Mentor'}
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
