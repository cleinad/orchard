-- Memory Files Table
-- Stores markdown-based memory files (daily journals + long-term categorized memory)
CREATE TABLE IF NOT EXISTS public.memory_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,           -- e.g. 'daily/2026-02-12.md' or 'long-term/interests.md'
  category TEXT NOT NULL,            -- 'daily', 'meta', 'interests', 'projects', 'work', 'beliefs', 'dislikes', 'people'
  content TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(user_id, file_path)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_memory_files_user_id ON public.memory_files(user_id);
CREATE INDEX IF NOT EXISTS idx_memory_files_category ON public.memory_files(user_id, category);
CREATE INDEX IF NOT EXISTS idx_memory_files_user_path ON public.memory_files(user_id, file_path);

-- Enable Row Level Security
ALTER TABLE public.memory_files ENABLE ROW LEVEL SECURITY;

-- Policies for memory_files
CREATE POLICY "Users can view own memory files"
  ON public.memory_files
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own memory files"
  ON public.memory_files
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own memory files"
  ON public.memory_files
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own memory files"
  ON public.memory_files
  FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger to auto-update updated_at timestamp
CREATE OR REPLACE TRIGGER on_memory_file_updated
  BEFORE UPDATE ON public.memory_files
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
