import { DEFAULT_MENTORS } from './defaults';
import { MENTOR_AVATARS_BUCKET, type DefaultMentorDefinition } from './types';

type SupabaseLike = {
  from: (table: string) => any;
};

interface ExistingBuiltInRow {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  description: string | null;
  base_system_prompt: string;
  accent_color: string | null;
  is_builtin: boolean;
}

const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

export function normalizeAccentColor(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  return HEX_COLOR_REGEX.test(trimmed) ? trimmed.toUpperCase() : null;
}

export function normalizeOptionalText(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  return trimmed.length ? trimmed : null;
}

export function slugifyName(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');

  return base || 'mentor';
}

export async function ensureUniqueSlug(
  supabase: SupabaseLike,
  userId: string,
  preferredName: string,
  excludeMentorId?: string
): Promise<string> {
  const baseSlug = slugifyName(preferredName);
  const { data, error } = await supabase
    .from('mentors')
    .select('id, slug')
    .eq('user_id', userId)
    .like('slug', `${baseSlug}%`);

  if (error) {
    throw new Error(`Failed to validate slug: ${error.message}`);
  }

  const taken = new Set<string>();
  for (const row of (data || []) as Array<{ id: string; slug: string }>) {
    if (excludeMentorId && row.id === excludeMentorId) continue;
    taken.add(row.slug);
  }

  if (!taken.has(baseSlug)) return baseSlug;

  let counter = 2;
  while (taken.has(`${baseSlug}-${counter}`)) {
    counter += 1;
  }

  return `${baseSlug}-${counter}`;
}

export async function syncBuiltInMentors(supabase: SupabaseLike, userId: string): Promise<void> {
  const { data: existingRows, error } = await supabase
    .from('mentors')
    .select(
      'id, slug, name, tagline, description, base_system_prompt, accent_color, is_builtin'
    )
    .eq('user_id', userId);

  if (error) {
    throw new Error(`Failed to load mentors for sync: ${error.message}`);
  }

  const existing = new Map<string, ExistingBuiltInRow>();
  for (const row of (existingRows || []) as ExistingBuiltInRow[]) {
    existing.set(row.slug, row);
  }

  const inserts: Array<Record<string, unknown>> = [];
  const updates: Array<{ id: string; payload: Record<string, unknown> }> = [];

  for (const def of DEFAULT_MENTORS) {
    const current = existing.get(def.slug);

    if (!current) {
      inserts.push({
        user_id: userId,
        slug: def.slug,
        name: def.name,
        tagline: def.tagline,
        description: def.description,
        base_system_prompt: def.base_system_prompt,
        user_instructions: '',
        is_builtin: true,
        accent_color: def.accent_color,
      });
      continue;
    }

    const patch: Record<string, unknown> = {};
    if (current.name !== def.name) patch.name = def.name;
    if (current.tagline !== def.tagline) patch.tagline = def.tagline;
    if (current.description !== def.description) patch.description = def.description;
    if (current.base_system_prompt !== def.base_system_prompt) {
      patch.base_system_prompt = def.base_system_prompt;
    }
    if (current.is_builtin !== true) patch.is_builtin = true;
    if (!current.accent_color) patch.accent_color = def.accent_color;

    if (Object.keys(patch).length > 0) {
      updates.push({ id: current.id, payload: patch });
    }
  }

  if (inserts.length > 0) {
    const { error: insertError } = await supabase.from('mentors').insert(inserts);
    if (insertError && insertError.code !== '23505') {
      throw new Error(`Failed to seed built-in mentors: ${insertError.message}`);
    }
  }

  for (const update of updates) {
    const { error: updateError } = await supabase
      .from('mentors')
      .update(update.payload)
      .eq('id', update.id)
      .eq('user_id', userId);

    if (updateError) {
      throw new Error(`Failed to sync built-in mentor: ${updateError.message}`);
    }
  }
}

export function sanitizeMentorName(input: string): string {
  return input.trim().slice(0, 80);
}

export function sanitizeTagline(input: string): string {
  return input.trim().slice(0, 160);
}

export function sanitizeDescription(input: string): string {
  return input.trim().slice(0, 2000);
}

export function sanitizePrompt(input: string): string {
  return input.trim().slice(0, 12000);
}

export function defaultMentorBySlug(slug: string): DefaultMentorDefinition | undefined {
  return DEFAULT_MENTORS.find((mentor) => mentor.slug === slug);
}

export function buildAvatarObjectPath(
  userId: string,
  mentorId: string,
  fileName: string
): string {
  const normalized = fileName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '') || 'avatar.png';

  return `${userId}/${mentorId}/${Date.now()}-${normalized}`;
}

export function isAvatarUrlOwnedByUser(avatarUrl: string, userId: string): boolean {
  try {
    const parsed = new URL(avatarUrl);
    return parsed.pathname.startsWith(
      `/storage/v1/object/public/${MENTOR_AVATARS_BUCKET}/${userId}/`
    );
  } catch {
    return false;
  }
}
