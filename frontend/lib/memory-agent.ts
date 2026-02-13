import { createSupabaseServiceClient } from './supabase-service';
import { MEMORY_CATEGORIES, dailyFilePath } from './memory-types';

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

const MEMORY_TOOLS = [
  {
    name: 'read_memory_file',
    description:
      'Read the current content of a memory file. Always read before writing to avoid losing data.',
    input_schema: {
      type: 'object' as const,
      properties: {
        file_path: {
          type: 'string',
          description:
            'Path like "daily/2026-02-12.md" or "long-term/interests.md"',
        },
      },
      required: ['file_path'],
    },
  },
  {
    name: 'write_memory_file',
    description:
      'Overwrite a memory file with new content. Use for long-term files when updating/merging entries. Always read first.',
    input_schema: {
      type: 'object' as const,
      properties: {
        file_path: {
          type: 'string',
          description:
            'Path like "long-term/interests.md"',
        },
        content: {
          type: 'string',
          description: 'The full new content for the file',
        },
      },
      required: ['file_path', 'content'],
    },
  },
  {
    name: 'append_to_memory_file',
    description:
      'Append content to the end of a memory file. Use for daily journal files.',
    input_schema: {
      type: 'object' as const,
      properties: {
        file_path: {
          type: 'string',
          description: 'Path like "daily/2026-02-12.md"',
        },
        content: {
          type: 'string',
          description: 'Content to append (will be added on a new line)',
        },
      },
      required: ['file_path', 'content'],
    },
  },
];

function categoryFromPath(filePath: string): string {
  if (filePath.startsWith('daily/')) return 'daily';
  return filePath.replace('long-term/', '').replace('.md', '');
}

async function executeMemoryTool(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  userId: string,
  toolName: string,
  input: Record<string, string>
): Promise<string> {
  switch (toolName) {
    case 'read_memory_file': {
      const { data } = await supabase
        .from('memory_files')
        .select('content')
        .eq('user_id', userId)
        .eq('file_path', input.file_path)
        .single();
      return data?.content || '(file does not exist yet — it will be created on first write)';
    }

    case 'write_memory_file': {
      const category = categoryFromPath(input.file_path);
      const { error } = await supabase.from('memory_files').upsert(
        {
          user_id: userId,
          file_path: input.file_path,
          category,
          content: input.content,
        },
        { onConflict: 'user_id,file_path' }
      );
      if (error) return `Error writing file: ${error.message}`;
      return 'File written successfully.';
    }

    case 'append_to_memory_file': {
      const { data: existing } = await supabase
        .from('memory_files')
        .select('content')
        .eq('user_id', userId)
        .eq('file_path', input.file_path)
        .single();

      const newContent = existing?.content
        ? `${existing.content}\n${input.content}`
        : input.content;

      const category = categoryFromPath(input.file_path);
      const { error } = await supabase.from('memory_files').upsert(
        {
          user_id: userId,
          file_path: input.file_path,
          category,
          content: newContent,
        },
        { onConflict: 'user_id,file_path' }
      );
      if (error) return `Error appending to file: ${error.message}`;
      return 'Content appended successfully.';
    }

    default:
      return `Unknown tool: ${toolName}`;
  }
}

async function callAnthropicWithTools(
  systemPrompt: string,
  messages: Array<{ role: string; content: unknown }>,
  tools: typeof MEMORY_TOOLS
) {
  const apiKey =
    process.env.MEMORY_AGENT_API_KEY || process.env.LLM_API_KEY || '';
  const model =
    process.env.MEMORY_AGENT_MODEL || 'claude-haiku-4-5-20251001';

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      system: systemPrompt,
      messages,
      tools,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Memory agent API error: ${error}`);
  }

  return response.json();
}

export async function processMemory(
  userId: string,
  conversationMessages: { role: string; content: string }[],
  latestResponse: string
): Promise<void> {
  const supabase = createSupabaseServiceClient();
  const today = dailyFilePath(new Date());

  // Build context: last few exchanges + the latest response for the memory agent
  const fullExchange = [
    ...conversationMessages.slice(-5),
    { role: 'assistant', content: latestResponse },
  ];
  const conversationSummary = fullExchange
    .map((m) => `${m.role}: ${m.content}`)
    .join('\n\n');

  const messages: Array<{ role: string; content: unknown }> = [
    {
      role: 'user',
      content: `Analyze this conversation exchange and update memory files as needed. Today's date is ${new Date().toISOString().split('T')[0]}. Today's daily file path is "${today}".\n\n---\n\n${conversationSummary}`,
    },
  ];

  // Tool use loop — max 10 iterations to allow read-then-write patterns
  for (let i = 0; i < 10; i++) {
    const response = await callAnthropicWithTools(
      MEMORY_AGENT_SYSTEM_PROMPT,
      messages,
      MEMORY_TOOLS
    );

    // If the model is done (text response, no more tool calls), exit
    if (response.stop_reason === 'end_turn') {
      console.log('[Memory Agent] Done:', response.content?.[0]?.text || 'no message');
      break;
    }

    // Process tool calls
    if (response.stop_reason === 'tool_use') {
      // Add the assistant's response (with tool_use blocks) to messages
      messages.push({ role: 'assistant', content: response.content });

      // Execute each tool and collect results
      const toolResults: Array<{
        type: 'tool_result';
        tool_use_id: string;
        content: string;
      }> = [];

      for (const block of response.content) {
        if (block.type === 'tool_use') {
          console.log(`[Memory Agent] Tool: ${block.name}(${JSON.stringify(block.input)})`);
          const result = await executeMemoryTool(
            supabase,
            userId,
            block.name,
            block.input as Record<string, string>
          );
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: result,
          });
        }
      }

      // Send tool results back to the model
      messages.push({ role: 'user', content: toolResults });
    }
  }
}
