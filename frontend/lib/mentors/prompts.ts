import type { MentorRecord } from './types';

type PromptMentor = Pick<MentorRecord, 'base_system_prompt' | 'user_instructions'>;

export function buildMentorPrompt(mentor: PromptMentor): string {
  let prompt = mentor.base_system_prompt.trim();

  if (mentor.user_instructions?.trim()) {
    prompt += `\n\nAdditional context from the user:\n${mentor.user_instructions.trim()}`;
  }

  return prompt;
}
