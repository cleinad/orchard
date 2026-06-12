"use client";

import { useEffect, type MutableRefObject } from 'react';

const INCOMPLETE_FINAL_WORDS = new Set([
  'and',
  'but',
  'or',
  'so',
  'because',
  'since',
  'although',
  'however',
  'with',
  'to',
  'for',
  'the',
  'a',
  'an',
  'that',
  'which',
  'who',
  'if',
  'then',
  'like',
  'of',
  'in',
  'on',
  'about',
  'is',
  'are',
  'was',
  'were',
]);

interface UseVoiceAutoSendParams {
  autoSendTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  finalTranscript: string;
  interimTranscript: string;
  isLoading: boolean;
  micActive: boolean;
  sendMessage: (content: string) => void;
}

function getAutoSendDelay(text: string) {
  const lastChar = text[text.length - 1];
  const lastWord =
    text
      .split(/\s+/)
      .pop()
      ?.toLowerCase()
      .replace(/[.,!?;:]$/, '') ?? '';
  const wordCount = text.split(/\s+/).length;

  if (INCOMPLETE_FINAL_WORDS.has(lastWord) || lastChar === ',' || lastChar === ';' || lastChar === ':') {
    return 4000;
  }

  if (lastChar === '.' || lastChar === '?' || lastChar === '!') {
    return wordCount <= 4 ? 1500 : 2000;
  }

  return 3000;
}

export function useVoiceAutoSend({
  autoSendTimerRef,
  finalTranscript,
  interimTranscript,
  isLoading,
  micActive,
  sendMessage,
}: UseVoiceAutoSendParams) {
  useEffect(() => {
    const text = finalTranscript.trim();
    const hasFinal = text.length > 0;
    const hasInterim = interimTranscript.length > 0;

    if (hasFinal && !hasInterim && micActive && !isLoading) {
      autoSendTimerRef.current = setTimeout(() => {
        sendMessage(finalTranscript.trim());
        autoSendTimerRef.current = null;
      }, getAutoSendDelay(text));
    }

    return () => {
      if (autoSendTimerRef.current) {
        clearTimeout(autoSendTimerRef.current);
        autoSendTimerRef.current = null;
      }
    };
  }, [
    autoSendTimerRef,
    finalTranscript,
    interimTranscript,
    isLoading,
    micActive,
    sendMessage,
  ]);
}
