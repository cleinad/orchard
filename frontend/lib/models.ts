import { anthropic } from '@ai-sdk/anthropic';
import { google } from '@ai-sdk/google';

// ===========================================
//  Change your models here — one line each
// ===========================================

export const CHAT_MODEL = google('gemini-3-flash-preview');
export const MEMORY_MODEL = anthropic('claude-haiku-4-5-20251001');

// Other options:
// import { openai } from '@ai-sdk/openai';
// import { createOpenAI } from '@ai-sdk/openai';
// const deepseek = createOpenAI({ baseURL: 'https://api.deepseek.com', apiKey: process.env.DEEPSEEK_API_KEY ?? '' });
//
// export const CHAT_MODEL = anthropic('claude-sonnet-4-20250514');
// export const CHAT_MODEL = openai('gpt-4o');
// export const CHAT_MODEL = deepseek('deepseek-chat');
// export const CHAT_MODEL = google('gemini-2.0-flash');
//
// export const MEMORY_MODEL = anthropic('claude-haiku-4-5-20251001');
// export const MEMORY_MODEL = openai('gpt-4o-mini');
// export const MEMORY_MODEL = google('gemini-2.0-flash');

// Env vars expected per provider (set whichever you use):
//   ANTHROPIC_API_KEY
//   GOOGLE_GENERATIVE_AI_API_KEY
//   OPENAI_API_KEY
//   DEEPSEEK_API_KEY
