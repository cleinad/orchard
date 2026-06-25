import type { FormEventHandler, KeyboardEventHandler, RefObject } from 'react';
import Tooltip from '@/app/components/Tooltip';
import ChatModelPicker from '@/app/home/components/ChatModelPicker';
import ResponseStylePicker from '@/app/home/components/ResponseStylePicker';
import type { MicStatus } from '@/app/home/components/useMicrophone';
import type { TranscriptStatus } from '@/app/home/components/useTranscription';
import type { TemporaryMemoryMode } from '@/lib/chat-session';
import {
  type ChatModelId,
  type ChatModelListItem,
} from '@/lib/chat-models';
import type { ResponseStyle } from '@/lib/response-style';

interface ChatComposerProps {
  activeName: string;
  chatModels: ChatModelListItem[];
  input: string;
  isLoading: boolean;
  micActive: boolean;
  responseStyle: ResponseStyle;
  selectedModelId: ChatModelId;
  ttsEnabled: boolean;
  searchEnabled: boolean;
  temporaryChatEnabled: boolean;
  showTemporaryIntro: boolean;
  temporaryMemoryMode: TemporaryMemoryMode;
  finalTranscript: string;
  interimTranscript: string;
  transcriptionStatus: TranscriptStatus;
  microphoneStatus: MicStatus;
  microphoneErrorMessage: string | null;
  searchWarning: string | null;
  isTtsLoading: boolean;
  isTtsPlaying: boolean;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  waveformRef: RefObject<SVGPolylineElement | null>;
  waveformGlowRef: RefObject<SVGPolylineElement | null>;
  waveformContainerRef: RefObject<HTMLDivElement | null>;
  onInputChange: (value: string) => void;
  onModelChange: (modelId: ChatModelId) => void;
  onResponseStyleChange: (value: ResponseStyle) => void;
  // Voice controls are hidden for now, but the wiring stays in place for later cleanup or restoration.
  onToggleMic: () => void;
  onToggleTts: () => void;
  onToggleSearch: () => void;
  onTemporaryMemoryModeChange: (mode: TemporaryMemoryMode) => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
  onKeyDown: KeyboardEventHandler<HTMLTextAreaElement>;
}

function getTranscriptStatusLabel(status: TranscriptStatus) {
  switch (status) {
    case 'connected':
      return 'Listening';
    case 'connecting':
      return 'Connecting...';
    default:
      return 'Ready';
  }
}

export default function ChatComposer({
  activeName,
  chatModels,
  input,
  isLoading,
  micActive,
  responseStyle,
  selectedModelId,
  searchEnabled,
  temporaryChatEnabled,
  showTemporaryIntro,
  temporaryMemoryMode,
  finalTranscript,
  interimTranscript,
  transcriptionStatus,
  microphoneStatus,
  microphoneErrorMessage,
  searchWarning,
  isTtsLoading,
  isTtsPlaying,
  textareaRef,
  waveformRef,
  waveformGlowRef,
  waveformContainerRef,
  onInputChange,
  onModelChange,
  onResponseStyleChange,
  onToggleSearch,
  onTemporaryMemoryModeChange,
  onSubmit,
  onKeyDown,
}: ChatComposerProps) {
  const hasTranscript = finalTranscript.length > 0 || interimTranscript.length > 0;
  const hasAvailableChatModels = chatModels.some((model) => model.available);

  return (
    <div className="mx-auto w-full max-w-2xl px-4">
      <div className="shrink-0 pb-2 pt-2">
        {temporaryChatEnabled && showTemporaryIntro && (
          <div
            className="mb-2 rounded-lg border border-border-subtle bg-foreground/[0.02] px-3 py-2 font-sans text-foreground"
            role="region"
            aria-label="Temporary chat settings"
          >
            {/* Segmented control: left off (default), right opt-in */}
            <div
              className="flex min-h-9 w-full rounded-lg bg-foreground/[0.06] p-0.5 sm:min-w-[14rem]"
              role="group"
              aria-label="Memory for this chat"
            >
              <button
                type="button"
                onClick={() => onTemporaryMemoryModeChange('off')}
                className={`flex flex-1 cursor-pointer items-center justify-center rounded-md px-2 py-1.5 text-xs font-medium transition-colors duration-200 ${
                  temporaryMemoryMode === 'off'
                    ? 'bg-surface text-foreground shadow-sm'
                    : 'text-muted hover:text-foreground'
                }`}
              >
                No memory
              </button>
              <button
                type="button"
                onClick={() => onTemporaryMemoryModeChange('use_existing')}
                className={`flex flex-1 cursor-pointer items-center justify-center rounded-md px-2 py-1.5 text-xs font-medium transition-colors duration-200 ${
                  temporaryMemoryMode === 'use_existing'
                    ? 'bg-surface text-foreground shadow-sm'
                    : 'text-muted hover:text-foreground'
                }`}
              >
                Use memories
              </button>
            </div>
            {/* Both modes explained; selected row reads stronger (fixed layout — no height jump) */}
            <div className="mt-1.5 space-y-0.5 text-[11px] leading-snug">
              <p
                className={
                  temporaryMemoryMode === 'off'
                    ? 'text-foreground'
                    : 'text-muted'
                }
              >
                <span className="font-medium">No memory</span>
                {' — '}
                Keen won&apos;t read or write memory for this session.
              </p>
              <p
                className={
                  temporaryMemoryMode === 'use_existing'
                    ? 'text-foreground'
                    : 'text-muted'
                }
              >
                <span className="font-medium">Use memories</span>
                {' — '}
                Saved memories may inform replies; this chat isn&apos;t stored.
              </p>
            </div>
          </div>
        )}

        {hasTranscript && !isLoading && (
          <div className="mb-3 rounded-lg bg-surface px-4 py-2 font-sans text-sm text-muted shadow-sm">
            <span className="text-xs font-medium tracking-wider text-muted/60">
              Listening
            </span>
            <p className="mt-1">
              {finalTranscript}
              {interimTranscript && (
                <span className="text-muted/50"> {interimTranscript}</span>
              )}
              <span className="ml-1 inline-block h-4 w-0.5 animate-pulse bg-muted/50" />
            </p>
          </div>
        )}

        <div
          ref={waveformContainerRef}
          className={`relative mx-auto mb-1 h-0.5 max-w-[90%] overflow-hidden rounded-full transition-[opacity,max-height] duration-300 ${
            micActive ? 'max-h-4 opacity-100' : 'max-h-0 opacity-0'
          }`}
        >
          <svg
            viewBox="0 0 240 4"
            className="absolute inset-0 h-full w-full"
            preserveAspectRatio="none"
          >
            <polyline
              ref={waveformRef}
              fill="none"
              stroke="currentColor"
              strokeWidth="4"
              points="0,2 240,2"
              className="text-muted transition-colors duration-300"
            />
            <polyline
              ref={waveformGlowRef}
              fill="none"
              stroke="currentColor"
              strokeWidth="4"
              points="0,2 240,2"
              className="text-muted/40 opacity-50 transition-opacity duration-300"
              style={{ filter: 'blur(2px)' }}
            />
          </svg>
        </div>

        <form onSubmit={onSubmit} className="relative">
          <div className="relative rounded-lg bg-surface shadow-sm ring-1 ring-border-subtle">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(event) => onInputChange(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder={micActive ? 'Listening...' : `Message ${activeName}...`}
              rows={1}
              className="composer-scrollbar w-full min-h-10 min-w-0 resize-none bg-transparent pl-3 pr-12 py-2.5 font-sans text-sm leading-relaxed text-foreground placeholder-muted/50 outline-none disabled:cursor-not-allowed disabled:opacity-50 overflow-y-auto"
              style={{ maxHeight: '200px' }}
            />

            <div className="absolute bottom-1.5 right-2 flex flex-none items-center">
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="flex h-7 w-7 items-center justify-center rounded-md bg-foreground p-0 text-background transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-20"
              >
                <svg
                  className="h-3 w-3"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 10l7-7m0 0l7 7m-7-7v18"
                  />
                </svg>
              </button>
            </div>
          </div>

          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 px-1">
            <div className="flex items-center gap-1.5">
              <Tooltip
                content={
                  searchEnabled
                    ? 'Search mode on: Keen will ground this reply with live sources'
                    : 'Search mode off: Keen will answer without live retrieval'
                }
                side="bottom"
              >
                <button
                  type="button"
                  aria-pressed={searchEnabled}
                  aria-label={searchEnabled ? 'Search mode on' : 'Search mode off'}
                  onClick={onToggleSearch}
                  className={`flex h-7 w-7 items-center justify-center rounded-md border transition-colors ${
                    searchEnabled
                      ? 'border-foreground/[0.10] bg-foreground/[0.05] text-foreground'
                      : 'border-border-subtle text-muted hover:bg-foreground/[0.04] hover:text-foreground/70'
                  } disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  <svg
                    className="h-3.5 w-3.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M21 21l-4.35-4.35m1.85-5.15a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                </button>
              </Tooltip>
            </div>

            <div className="ml-auto flex min-w-0 items-center gap-1.5">
              <ResponseStylePicker
                value={responseStyle}
                onChange={onResponseStyleChange}
              />
              <ChatModelPicker
                chatModels={chatModels}
                selectedModelId={selectedModelId}
                disabled={!hasAvailableChatModels}
                onChange={onModelChange}
              />
            </div>
          </div>

          {searchWarning && (
            <div className="mt-2 rounded-lg border border-amber-300/70 bg-amber-50 px-3 py-2 font-sans text-xs text-amber-900 shadow-sm dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
              {searchWarning}
            </div>
          )}
        </form>

        <div className="mt-2 flex items-center justify-between px-4 font-sans text-xs text-muted/60">
          <div className="flex items-center gap-3">
            {micActive && (
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                <span>{getTranscriptStatusLabel(transcriptionStatus)}</span>
              </span>
            )}
            {isTtsLoading && <span>Generating voice...</span>}
            {isTtsPlaying && <span>Speaking...</span>}
          </div>
        </div>

        {microphoneStatus === 'blocked' && (
          <p className="mt-2 text-center font-sans text-xs text-muted">
            Microphone permission denied. Check browser settings.
          </p>
        )}
        {microphoneStatus === 'error' && microphoneErrorMessage && (
          <p className="mt-2 text-center font-sans text-xs text-rose-500">
            {microphoneErrorMessage}
          </p>
        )}
      </div>
    </div>
  );
}
