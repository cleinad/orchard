import { generateText, tool, stepCountIs } from 'ai';
import { z } from 'zod';
import { createSupabaseServiceClient } from './supabase-service';
import { MEMORY_CATEGORIES, dailyFilePath } from './memory-types';
import { MEMORY_MODEL } from './models';

const MEMORY_AGENT_SYSTEM_PROMPT = `You are a memory management agent for Novus, a voice AI assistant. Your job is to analyze conversation exchanges and update the user's memory files when noteworthy information is revealed.

## Memory Structure

There are two types of memory files:

### Daily files (daily/YYYY-MM-DD.md)
Append-only journal capturing key points from each conversation. Use bullet points:
\`\`\`
- discussed X with Y context
- decided to Z
- mentioned feeling frustrated about W
\`\`\`

### Long-term files (long-term/<category>.md)
Curated facts about the user. Use pipe-delimited format:
\`\`\`
- topic | details and context | YYYY-MM-DD
\`\`\`

Available categories: ${MEMORY_CATEGORIES.join(', ')}

Category descriptions:
- meta: name, age, location, basic biographical facts
- interests: hobbies, passions, things they enjoy or are curious about
- projects: ongoing projects, side projects, what they're building
- work: job, role, company, colleagues, work-related context
- beliefs: values, opinions, worldviews, principles they hold
- dislikes: things they dislike, avoid, or are frustrated by
- people: family members, friends, colleagues, relationships

## Rules

1. Only update memory when genuinely NEW, noteworthy information is revealed. Not every exchange needs a memory update.
2. Do NOT store conversation mechanics, pleasantries, or meta-discussion about the AI itself.
3. Store facts, preferences, decisions, commitments, and emotional states.
4. Always READ a file before WRITING to it — never clobber existing content.
5. For long-term files: merge new entries with existing ones. Update entries if information changed, add new ones if new topics arise.
6. For daily files: append new bullet points to the existing content.
7. Be concise. Each entry should be a single line.
8. If nothing noteworthy was said, do nothing — just respond that no updates are needed.`;

function categoryFromPath(filePath: string): string {
  if (filePath.startsWith('daily/')) return 'daily';
  return filePath.replace('long-term/', '').replace('.md', '');
}

function createMemoryTools(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  userId: string
) {
  return {
    read_memory_file: tool({
      description:
        'Read the current content of a memory file. Always read before writing to avoid losing data.',
      inputSchema: z.object({
        file_path: z
          .string()
          .describe('Path like "daily/2026-02-12.md" or "long-term/interests.md"'),
      }),
      execute: async ({ file_path }) => {
        const { data } = await supabase
          .from('memory_files')
          .select('content')
          .eq('user_id', userId)
          .eq('file_path', file_path)
          .single();
        return data?.content || '(file does not exist yet — it will be created on first write)';
      },
    }),

    write_memory_file: tool({
      description:
        'Overwrite a memory file with new content. Use for long-term files when updating/merging entries. Always read first.',
      inputSchema: z.object({
        file_path: z.string().describe('Path like "long-term/interests.md"'),
        content: z.string().describe('The full new content for the file'),
      }),
      execute: async ({ file_path, content }) => {
        const category = categoryFromPath(file_path);
        const { error } = await supabase.from('memory_files').upsert(
          {
            user_id: userId,
            file_path,
            category,
            content,
          },
          { onConflict: 'user_id,file_path' }
        );
        if (error) return `Error writing file: ${error.message}`;
        return 'File written successfully.';
      },
    }),

    append_to_memory_file: tool({
      description:
        'Append content to the end of a memory file. Use for daily journal files.',
      inputSchema: z.object({
        file_path: z.string().describe('Path like "daily/2026-02-12.md"'),
        content: z.string().describe('Content to append (will be added on a new line)'),
      }),
      execute: async ({ file_path, content }) => {
        const { data: existing } = await supabase
          .from('memory_files')
          .select('content')
          .eq('user_id', userId)
          .eq('file_path', file_path)
          .single();

        const newContent = existing?.content
          ? `${existing.content}\n${content}`
          : content;

        const category = categoryFromPath(file_path);
        const { error } = await supabase.from('memory_files').upsert(
          {
            user_id: userId,
            file_path,
            category,
            content: newContent,
          },
          { onConflict: 'user_id,file_path' }
        );
        if (error) return `Error appending to file: ${error.message}`;
        return 'Content appended successfully.';
      },
    }),
  };
}

export async function processMemory(
  userId: string,
  conversationMessages: { role: string; content: string }[],
  latestResponse: string
): Promise<void> {
  const supabase = createSupabaseServiceClient();
  const today = dailyFilePath(new Date());

  // Build context: last few exchanges + the latest response
  const fullExchange = [
    ...conversationMessages.slice(-5),
    { role: 'assistant', content: latestResponse },
  ];
  const conversationSummary = fullExchange
    .map((m) => `${m.role}: ${m.content}`)
    .join('\n\n');

  const memoryTools = createMemoryTools(supabase, userId);

  const result = await generateText({
    model: MEMORY_MODEL,
    system: MEMORY_AGENT_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Analyze this conversation exchange and update memory files as needed. Today's date is ${new Date().toISOString().split('T')[0]}. Today's daily file path is "${today}".\n\n---\n\n${conversationSummary}`,
      },
    ],
    tools: memoryTools,
    stopWhen: stepCountIs(10),
    onStepFinish({ toolResults }) {
      for (const tr of toolResults) {
        console.log(`[Memory Agent] Tool: ${tr.toolName}(${JSON.stringify(tr.input)})`);
      }
    },
  });

  console.log('[Memory Agent] Done:', result.text || 'no message');
}
