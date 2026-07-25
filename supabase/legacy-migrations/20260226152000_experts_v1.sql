-- Experts table
CREATE TABLE IF NOT EXISTS public.experts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  tagline TEXT NOT NULL,
  description TEXT,
  base_system_prompt TEXT NOT NULL,
  user_instructions TEXT NOT NULL DEFAULT '',
  is_builtin BOOLEAN NOT NULL DEFAULT false,
  accent_color TEXT,
  avatar_url TEXT,
  voice_id TEXT,
  model_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_experts_user_id ON public.experts(user_id);
CREATE INDEX IF NOT EXISTS idx_experts_user_builtin ON public.experts(user_id, is_builtin);

-- Conversation -> expert linkage (Novus remains expert_id = NULL)
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS expert_id UUID REFERENCES public.experts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_user_expert
  ON public.conversations(user_id, expert_id);

-- v1 invariant: exactly one conversation per expert per user
CREATE UNIQUE INDEX IF NOT EXISTS conversations_user_expert_unique_idx
  ON public.conversations(user_id, expert_id)
  WHERE expert_id IS NOT NULL;

-- Keep updated_at in sync
DROP TRIGGER IF EXISTS on_expert_updated ON public.experts;
CREATE TRIGGER on_expert_updated
  BEFORE UPDATE ON public.experts
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Row level security for experts
ALTER TABLE public.experts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own experts" ON public.experts;
CREATE POLICY "Users can view own experts"
  ON public.experts
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create own experts" ON public.experts;
CREATE POLICY "Users can create own experts"
  ON public.experts
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own experts" ON public.experts;
CREATE POLICY "Users can update own experts"
  ON public.experts
  FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own custom experts" ON public.experts;
CREATE POLICY "Users can delete own custom experts"
  ON public.experts
  FOR DELETE
  USING (auth.uid() = user_id AND is_builtin = false);

-- Expert avatars bucket and policies
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'expert-avatars',
  'expert-avatars',
  true,
  5242880,
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Users can upload own expert avatars" ON storage.objects;
CREATE POLICY "Users can upload own expert avatars"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'expert-avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users can update own expert avatars" ON storage.objects;
CREATE POLICY "Users can update own expert avatars"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'expert-avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'expert-avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users can delete own expert avatars" ON storage.objects;
CREATE POLICY "Users can delete own expert avatars"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'expert-avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Public can view expert avatars" ON storage.objects;
CREATE POLICY "Public can view expert avatars"
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'expert-avatars');
