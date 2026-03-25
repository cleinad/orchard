import type { FormEventHandler, KeyboardEventHandler, RefObject } from 'react';
import Tooltip from '@/app/components/Tooltip';
import type { MicStatus } from '@/app/home/components/useMicrophone';
import type { TranscriptStatus } from '@/app/home/components/useTranscription';
import type { TemporaryMemoryMode } from '@/lib/chat-session';

interface ChatComposerProps {
  activeName: string;
  input: string;
  isLoading: boolean;
  micActive: boolean;
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
  input,
  isLoading,
  micActive,
  ttsEnabled,
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
  onToggleMic,
  onToggleTts,
  onToggleSearch,
  onTemporaryMemoryModeChange,
  onSubmit,
  onKeyDown,
}: ChatComposerProps) {
  const hasTranscript = finalTranscript.length > 0 || interimTranscript.length > 0;
  const temporaryModeHelperText =
    temporaryMemoryMode === 'use_existing'
      ? 'Keen can use saved memories for context, but nothing from this chat is retained.'
      : 'Keen will not read or save any memory for this chat.';

  return (
    <div className="mx-auto w-full max-w-2xl px-4">
      <div className="shrink-0 pb-2 pt-2">
        {temporaryChatEnabled && showTemporaryIntro && (
          <div className="mb-3 rounded-2xl border border-border-subtle bg-foreground/[0.04] px-4 py-4 text-foreground shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Temporary chat is on.</p>
                <p className="mt-1 text-xs text-muted">
                  This conversation won&apos;t be saved.
                </p>
              </div>
              <span className="inline-flex items-center rounded-full border border-border-subtle bg-surface px-2.5 py-1 text-[11px] font-medium text-foreground">
                Temporary
              </span>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onTemporaryMemoryModeChange('use_existing')}
                className={`inline-flex items-center rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  temporaryMemoryMode === 'use_existing'
                    ? 'bg-surface text-foreground shadow-sm ring-1 ring-border-subtle'
                    : 'bg-foreground/[0.05] text-muted hover:bg-foreground/[0.08] hover:text-foreground'
                }`}
              >
                Use memories
              </button>
              <button
                type="button"
                onClick={() => onTemporaryMemoryModeChange('off')}
                className={`inline-flex items-center rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  temporaryMemoryMode === 'off'
                    ? 'bg-surface text-foreground shadow-sm ring-1 ring-border-subtle'
                    : 'bg-foreground/[0.05] text-muted hover:bg-foreground/[0.08] hover:text-foreground'
                }`}
              >
                No memory
              </button>
            </div>

            <p className="mt-3 text-xs leading-relaxed text-muted">
              {temporaryModeHelperText}
            </p>
          </div>
        )}

        {hasTranscript && !isLoading && (
          <div className="mb-3 rounded-lg bg-surface px-4 py-2 text-sm text-muted shadow-sm">
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
          <div className="flex items-end gap-2 rounded-lg bg-surface px-3 py-1.5 shadow-sm ring-1 ring-border-subtle">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(event) => onInputChange(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder={micActive ? 'Listening...' : `Message ${activeName}...`}
              disabled={isLoading}
              rows={1}
              className="self-center min-h-10 flex-1 min-w-0 resize-none bg-transparent py-1.5 text-sm leading-relaxed text-foreground placeholder-muted/50 outline-none disabled:cursor-not-allowed disabled:opacity-50"
              style={{ maxHeight: '200px' }}
            />

            <div className="flex flex-none items-center gap-2 self-end pb-0.5">
              <button
                type="button"
                onClick={onToggleMic}
                disabled={isLoading}
                aria-label={micActive ? 'Stop microphone' : 'Start microphone'}
                className={`flex h-9 w-9 items-center justify-center rounded-md border p-0 transition-colors ${
                  micActive
                    ? 'border-foreground/[0.10] bg-foreground/[0.05] text-foreground'
                    : 'border-transparent text-muted hover:border-foreground/[0.08] hover:bg-foreground/[0.04] hover:text-foreground/70'
                } disabled:cursor-not-allowed disabled:opacity-50`}
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
                  />
                </svg>
              </button>

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

          <div className="mt-1.5 flex items-center gap-1.5 px-1">
            <Tooltip
              content={
                ttsEnabled
                  ? 'Voice — Text-to-speech for responses'
                  : 'Voice — Currently off'
              }
              side="bottom"
            >
              <button
                type="button"
                aria-pressed={ttsEnabled}
                aria-label={ttsEnabled ? 'Voice on' : 'Voice off'}
                onClick={onToggleTts}
                className={`flex h-7 w-7 items-center justify-center rounded-md border transition-colors ${
                  ttsEnabled
                    ? 'border-foreground/[0.10] bg-foreground/[0.05] text-foreground'
                    : 'border-border-subtle text-muted hover:bg-foreground/[0.04] hover:text-foreground/70'
                }`}
              >
                <svg
                  className="h-3.5 w-3.5"
                  fill={ttsEnabled ? 'currentColor' : 'none'}
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  {ttsEnabled ? (
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M11.25 5.25L6.75 9H4.5v6h2.25l4.5 3.75V5.25zm4.5 4.5a4.5 4.5 0 010 4.5m2.25-6.75a7.5 7.5 0 010 9"
                    />
                  ) : (
                    <>
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M11.25 5.25L6.75 9H4.5v6h2.25l4.5 3.75V5.25z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M15.75 9.75l4.5 4.5m0-4.5l-4.5 4.5"
                      />
                    </>
                  )}
                </svg>
              </button>
            </Tooltip>

            <Tooltip
              content={
                searchEnabled
                  ? 'Live Search — Always grounds replies with live web results'
                  : 'Live Search — Lets the model decide when search is needed'
              }
              side="bottom"
            >
              <button
                type="button"
                aria-pressed={searchEnabled}
                aria-label={searchEnabled ? 'Live search always on' : 'Live search auto'}
                onClick={onToggleSearch}
                disabled={isLoading}
                className={`flex h-7 w-7 items-center justify-center rounded-md border transition-colors ${
                  searchEnabled
                    ? 'border-foreground/[0.10] bg-foreground/[0.05] text-foreground'
                    : 'border-border-subtle text-muted hover:bg-foreground/[0.04] hover:text-foreground/70'
                } disabled:cursor-not-allowed disabled:opacity-50`}
              >
                <svg
                  className="h-3.5 w-3.5"
                  fill={searchEnabled ? 'currentColor' : 'none'}
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

          {searchWarning && (
            <div className="mt-2 rounded-lg border border-amber-300/70 bg-amber-50 px-3 py-2 text-xs text-amber-900 shadow-sm dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
              {searchWarning}
            </div>
          )}
        </form>

        <div className="mt-2 flex items-center justify-between px-4 text-xs text-muted/60">
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
          <p className="mt-2 text-center text-xs text-muted">
            Microphone permission denied. Check browser settings.
          </p>
        )}
        {microphoneStatus === 'error' && microphoneErrorMessage && (
          <p className="mt-2 text-center text-xs text-rose-500">
            {microphoneErrorMessage}
          </p>
        )}
      </div>
    </div>
  );
}
