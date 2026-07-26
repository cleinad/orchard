CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS public.memory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  owner_type TEXT NOT NULL CHECK (owner_type IN ('global', 'mentor')),
  owner_id UUID REFERENCES public.mentors(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  text TEXT NOT NULL,
  normalized_text TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0.7 CHECK (confidence >= 0 AND confidence <= 1),
  salience INT NOT NULL DEFAULT 50 CHECK (salience >= 0 AND salience <= 100),
  stability TEXT NOT NULL CHECK (stability IN ('stable', 'episodic')),
  sensitivity TEXT NOT NULL CHECK (sensitivity IN ('normal', 'private', 'sensitive')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'superseded', 'deleted')),
  source_conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  source_message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  source_role TEXT CHECK (source_role IN ('user', 'assistant')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT memory_items_owner_scope_check CHECK (
    (owner_type = 'global' AND owner_id IS NULL)
    OR (owner_type = 'mentor' AND owner_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_memory_items_user_status_updated
  ON public.memory_items(user_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_memory_items_user_owner_status
  ON public.memory_items(user_id, owner_type, owner_id, status);

CREATE INDEX IF NOT EXISTS idx_memory_items_user_type_status
  ON public.memory_items(user_id, type, status);

CREATE INDEX IF NOT EXISTS idx_memory_items_user_stability_status
  ON public.memory_items(user_id, stability, status);

CREATE INDEX IF NOT EXISTS idx_memory_items_normalized_text_trgm
  ON public.memory_items USING gin (normalized_text gin_trgm_ops);

DROP TRIGGER IF EXISTS on_memory_item_updated ON public.memory_items;
CREATE TRIGGER on_memory_item_updated
  BEFORE UPDATE ON public.memory_items
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.memory_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own memory items" ON public.memory_items;
CREATE POLICY "Users can view own memory items"
  ON public.memory_items
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own memory items" ON public.memory_items;
CREATE POLICY "Users can insert own memory items"
  ON public.memory_items
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own memory items" ON public.memory_items;
CREATE POLICY "Users can update own memory items"
  ON public.memory_items
  FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own memory items" ON public.memory_items;
CREATE POLICY "Users can delete own memory items"
  ON public.memory_items
  FOR DELETE
  USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.memory_item_embeddings (
  memory_item_id UUID PRIMARY KEY REFERENCES public.memory_items(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  embedding VECTOR(1536) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_memory_item_embeddings_vector
  ON public.memory_item_embeddings
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_memory_item_embeddings_user_item
  ON public.memory_item_embeddings(user_id, memory_item_id);

ALTER TABLE public.memory_item_embeddings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own memory item embeddings" ON public.memory_item_embeddings;
CREATE POLICY "Users can view own memory item embeddings"
  ON public.memory_item_embeddings
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own memory item embeddings" ON public.memory_item_embeddings;
CREATE POLICY "Users can insert own memory item embeddings"
  ON public.memory_item_embeddings
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own memory item embeddings" ON public.memory_item_embeddings;
CREATE POLICY "Users can update own memory item embeddings"
  ON public.memory_item_embeddings
  FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own memory item embeddings" ON public.memory_item_embeddings;
CREATE POLICY "Users can delete own memory item embeddings"
  ON public.memory_item_embeddings
  FOR DELETE
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.match_memory_items(
  p_user_id UUID,
  p_query_embedding VECTOR(1536),
  p_match_count INT DEFAULT 24,
  p_owner_type TEXT DEFAULT NULL,
  p_owner_id UUID DEFAULT NULL
)
RETURNS TABLE(memory_item_id UUID, similarity REAL)
LANGUAGE SQL
STABLE
AS $$
  SELECT
    mie.memory_item_id,
    (1 - (mie.embedding <=> p_query_embedding))::REAL AS similarity
  FROM public.memory_item_embeddings mie
  INNER JOIN public.memory_items mi
    ON mi.id = mie.memory_item_id
   AND mi.user_id = p_user_id
   AND mi.status = 'active'
  WHERE
    mie.user_id = p_user_id
    AND (p_owner_type IS NULL OR mi.owner_type = p_owner_type)
    AND (p_owner_id IS NULL OR mi.owner_id = p_owner_id)
  ORDER BY mie.embedding <=> p_query_embedding
  LIMIT GREATEST(1, LEAST(p_match_count, 100));
$$;
