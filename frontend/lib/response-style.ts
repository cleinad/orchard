export const RESPONSE_STYLE_LENGTH_OPTIONS = [
  'adaptive',
  'concise',
  'brief',
  'detailed',
  'deep',
] as const;

export const RESPONSE_STYLE_LEVEL_OPTIONS = [
  'adaptive',
  'new',
  'familiar',
  'advanced',
  'fluent',
] as const;

export type ResponseStyleLength = (typeof RESPONSE_STYLE_LENGTH_OPTIONS)[number];
export type ResponseStyleLevel = (typeof RESPONSE_STYLE_LEVEL_OPTIONS)[number];

export interface ResponseStyle {
  length: ResponseStyleLength;
  level: ResponseStyleLevel;
  sessionNote: string;
}

export const DEFAULT_RESPONSE_STYLE: ResponseStyle = {
  length: 'adaptive',
  level: 'adaptive',
  sessionNote: '',
};

export const RESPONSE_STYLE_LENGTH_LABELS: Record<ResponseStyleLength, string> = {
  adaptive: 'Adaptive',
  concise: 'Concise',
  brief: 'Brief',
  detailed: 'Detailed',
  deep: 'Deep',
};

export const RESPONSE_STYLE_LEVEL_LABELS: Record<ResponseStyleLevel, string> = {
  adaptive: 'Adaptive',
  new: 'New',
  familiar: 'Familiar',
  advanced: 'Advanced',
  fluent: 'Fluent',
};

const LENGTH_GUIDANCE: Record<ResponseStyleLength, string> = {
  adaptive:
    'Choose the length and structure that best serve the current request. Be brief for a simple answer and expand when explanation, evidence, or nuance would make the answer more useful.',
  concise:
    'Give the shortest answer that fully addresses the request. Include an essential qualification, example, or step when omitting it would mislead or leave the answer unusable.',
  brief:
    'Answer directly with concise, skimmable prose. Use short paragraphs or only minimal structure when it helps clarity.',
  detailed:
    'Use a focused teaching style with structure, examples, caveats, or steps when they materially improve understanding.',
  deep:
    'Explore the reasoning and implications in depth when relevant. Include useful context, examples, tradeoffs, or edge cases selectively; depth is not a requirement to cover every possible angle.',
};

const LEVEL_GUIDANCE: Record<ResponseStyleLevel, string> = {
  adaptive:
    'Infer the useful level of explanation from the current request and what the user has shown they know. Explain unfamiliar essentials without talking down to the user; use technical detail when it helps.',
  new:
    'Assume the user has little or no background. Define key terms, build from fundamentals, and avoid unexplained jargon.',
  familiar:
    'Assume the user knows the basics. Skip obvious definitions, but explain important concepts or nontrivial terms.',
  advanced:
    'Assume strong working knowledge. Use precise language, skip basics, and focus on nuance, edge cases, and deeper reasoning.',
  fluent:
    'Assume the user is comfortable operating in the domain. Use precise domain language without explaining familiar basics; remain readable and clarify genuinely subtle points.',
};

export const RESPONSE_STYLE_LENGTH_DESCRIPTIONS: Record<ResponseStyleLength, string> = {
  adaptive: 'Match the question',
  concise: 'Shortest complete answer',
  brief: 'Concise and skimmable',
  detailed: 'Structured explanation',
  deep: 'In-depth but focused',
};

export const RESPONSE_STYLE_LEVEL_DESCRIPTIONS: Record<ResponseStyleLevel, string> = {
  adaptive: 'Match your familiarity',
  new: 'Start from fundamentals',
  familiar: 'Assume the basics',
  advanced: 'Skip basics, add nuance',
  fluent: 'Domain-native and precise',
};

function isResponseStyleLength(value: unknown): value is ResponseStyleLength {
  return (
    typeof value === 'string'
    && RESPONSE_STYLE_LENGTH_OPTIONS.includes(value as ResponseStyleLength)
  );
}

function isResponseStyleLevel(value: unknown): value is ResponseStyleLevel {
  return (
    typeof value === 'string'
    && RESPONSE_STYLE_LEVEL_OPTIONS.includes(value as ResponseStyleLevel)
  );
}

export function isDefaultResponseStyle(style: ResponseStyle) {
  return (
    style.length === DEFAULT_RESPONSE_STYLE.length
    && style.level === DEFAULT_RESPONSE_STYLE.level
    && style.sessionNote.trim().length === 0
  );
}

export function sanitizeResponseStyle(input: unknown): ResponseStyle {
  if (!input || typeof input !== 'object') {
    return DEFAULT_RESPONSE_STYLE;
  }

  const value = input as Record<string, unknown>;
  const rawSessionNote = typeof value.sessionNote === 'string' ? value.sessionNote : '';

  return {
    length: isResponseStyleLength(value.length)
      ? value.length
      : DEFAULT_RESPONSE_STYLE.length,
    level: isResponseStyleLevel(value.level)
      ? value.level
      : DEFAULT_RESPONSE_STYLE.level,
    sessionNote: rawSessionNote.replace(/\s+/g, ' ').trim().slice(0, 1_000),
  };
}

export function getResponseStyleSummary(style: ResponseStyle) {
  if (isDefaultResponseStyle(style)) {
    return 'Response style';
  }

  return `${RESPONSE_STYLE_LENGTH_LABELS[style.length]} · ${RESPONSE_STYLE_LEVEL_LABELS[style.level]}`;
}

export function buildResponseStylePrompt(style: ResponseStyle) {
  const normalized = sanitizeResponseStyle(style);
  const lines = [
    'For this chat, adapt your response style to these settings.',
    '',
    `Length: ${RESPONSE_STYLE_LENGTH_LABELS[normalized.length]}`,
    LENGTH_GUIDANCE[normalized.length],
    '',
    `Level: ${RESPONSE_STYLE_LEVEL_LABELS[normalized.level]}`,
    LEVEL_GUIDANCE[normalized.level],
  ];

  if (normalized.sessionNote) {
    lines.push(
      '',
      'The user also set this instruction for the current chat. Follow it when it conflicts with the Length or Level guidance:',
      '<session_response_style_note>',
      normalized.sessionNote,
      '</session_response_style_note>'
    );
  }

  return lines.join('\n');
}
