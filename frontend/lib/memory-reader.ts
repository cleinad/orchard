import { SupabaseClient } from '@supabase/supabase-js';
import { MEMORY_CATEGORIES, CATEGORY_HEADINGS } from './memory-types';

export async function loadMemoryContext(
  supabase: SupabaseClient,
  userId: string
): Promise<string> {
  // Load all long-term memory files
  const { data: longTermFiles } = await supabase
    .from('memory_files')
    .select('file_path, category, content')
    .eq('user_id', userId)
    .neq('category', 'daily')
    .neq('content', '');

  // Load last 3 days of daily files
  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
  const cutoffPath = `daily/${threeDaysAgo.toISOString().split('T')[0]}.md`;

  const { data: dailyFiles } = await supabase
    .from('memory_files')
    .select('file_path, content')
    .eq('user_id', userId)
    .eq('category', 'daily')
    .gte('file_path', cutoffPath)
    .neq('content', '')
    .order('file_path', { ascending: false });

  const sections: string[] = [];

  // Format long-term memory by category
  if (longTermFiles && longTermFiles.length > 0) {
    for (const category of MEMORY_CATEGORIES) {
      const file = longTermFiles.find((f) => f.category === category);
      if (file?.content) {
        const heading = CATEGORY_HEADINGS[category];
        sections.push(`## ${heading}\n${file.content}`);
      }
    }
  }

  // Format daily files
  if (dailyFiles && dailyFiles.length > 0) {
    const dailySection = dailyFiles
      .map((f) => {
        const date = f.file_path.replace('daily/', '').replace('.md', '');
        return `### ${date}\n${f.content}`;
      })
      .join('\n\n');
    sections.push(`## Recent Context (Daily Notes)\n${dailySection}`);
  }

  return sections.join('\n\n');
}
