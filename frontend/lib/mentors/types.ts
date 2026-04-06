export interface MentorRecord {
  id: string;
  user_id: string;
  slug: string;
  name: string;
  tagline: string;
  description: string | null;
  base_system_prompt: string;
  user_instructions: string;
  is_builtin: boolean;
  accent_color: string | null;
  avatar_url: string | null;
  voice_id: string | null;
  model_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface MentorListItem {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  description: string | null;
  is_builtin: boolean;
  accent_color: string | null;
  avatar_url: string | null;
}

export interface MentorConversationMeta {
  conversation_id: string;
  updated_at: string;
  preview: string;
}

export interface DefaultMentorDefinition {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  base_system_prompt: string;
  accent_color: string;
}

export interface GeneratedMentorDraft {
  name: string;
  tagline: string;
  description: string;
  base_system_prompt: string;
}

export const MENTOR_AVATARS_BUCKET = 'mentor-avatars';
