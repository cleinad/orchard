import {
  useEffect,
  useRef,
  useState,
  type FormEventHandler,
  type KeyboardEventHandler,
  type RefObject,
} from 'react';
import Tooltip from '@/app/components/Tooltip';
import ChatModelPicker from '@/app/home/components/ChatModelPicker';
import type { MicStatus } from '@/app/home/components/useMicrophone';
import type { TranscriptStatus } from '@/app/home/components/useTranscription';
import type { TemporaryMemoryMode } from '@/lib/chat-session';
import type { SearchMode } from '@/lib/chat-search';
import {
  type ChatModelId,
  type ChatModelListItem,
} from '@/lib/chat-models';

interface ChatComposerProps {
  activeName: string;
  chatModels: ChatModelListItem[];
  input: string;
  isLoading: boolean;
  micActive: boolean;
  selectedModelId: ChatModelId;
  ttsEnabled: boolean;
  searchMode: SearchMode;
  learningMode: boolean;
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
  onToggleMic: () => void;
  onToggleTts: () => void;
  onSearchModeChange: (mode: SearchMode) => void;
  onToggleLearningMode: () => void;
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
  selectedModelId,
  ttsEnabled,
  searchMode,
  learningMode,
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
  onToggleMic,
  onToggleTts,
  onSearchModeChange,
  onToggleLearningMode,
  onTemporaryMemoryModeChange,
  onSubmit,
  onKeyDown,
}: ChatComposerProps) {
  const hasTranscript = finalTranscript.length > 0 || interimTranscript.length > 0;
  const hasAvailableChatModels = chatModels.some((model) => model.available);
  const [searchMenuOpen, setSearchMenuOpen] = useState(false);
  const searchMenuRef = useRef<HTMLDivElement | null>(null);
  const searchModeLabels: Record<SearchMode, string> = {
    auto: 'Auto',
    required: 'Always search',
    off: 'Off',
  };
  const searchModeTooltip: Record<SearchMode, string> = {
    auto: 'Search auto: Keen will decide when live sources are needed',
    required: 'Always search: Keen will ground this reply with live sources',
    off: 'Search off: Keen will answer without live retrieval',
  };

  useEffect(() => {
    if (!searchMenuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (
        searchMenuRef.current
        && event.target instanceof Node
        && !searchMenuRef.current.contains(event.target)
      ) {
        setSearchMenuOpen(false);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [searchMenuOpen]);

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
              className="composer-scrollbar w-full min-h-10 min-w-0 resize-none bg-transparent pl-3 pr-[5.5rem] py-2.5 font-sans text-sm leading-relaxed text-foreground placeholder-muted/50 outline-none disabled:cursor-not-allowed disabled:opacity-50 overflow-y-auto"
              style={{ maxHeight: '200px' }}
            />

            {/* Buttons pinned to bottom-right, so scrollbar sits to their left at the far right of the card */}
            <div className="absolute bottom-1.5 right-2 flex flex-none items-center gap-2">
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

          <div className="mt-1.5 flex items-center justify-between gap-3 px-1">
            <div className="flex items-center gap-1.5">
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

              <div ref={searchMenuRef} className="relative">
                <Tooltip content={searchModeTooltip[searchMode]} side="bottom">
                  <button
                    type="button"
                    aria-haspopup="menu"
                    aria-expanded={searchMenuOpen}
                    aria-label={`Search mode ${searchModeLabels[searchMode].toLowerCase()}`}
                    onClick={() => setSearchMenuOpen((open) => !open)}
                    className={`flex h-7 w-7 items-center justify-center rounded-md border transition-colors ${
                      searchMode === 'required'
                        ? 'border-foreground/[0.10] bg-foreground/[0.05] text-foreground'
                        : searchMode === 'off'
                          ? 'border-border-subtle text-muted/60 hover:bg-foreground/[0.04] hover:text-foreground/70'
                          : 'border-border-subtle text-muted hover:bg-foreground/[0.04] hover:text-foreground/70'
                    }`}
                  >
                    <svg
                      className="h-3.5 w-3.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 21a9 9 0 100-18 9 9 0 000 18z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M3.6 9h16.8M3.6 15h16.8M12 3c2.1 2.25 3.15 5.25 3.15 9S14.1 18.75 12 21M12 3C9.9 5.25 8.85 8.25 8.85 12S9.9 18.75 12 21"
                      />
                    </svg>
                  </button>
                </Tooltip>

                {searchMenuOpen && (
                  <div
                    role="menu"
                    aria-label="Search mode"
                    className="absolute bottom-9 left-0 z-30 w-max rounded-lg border border-border-subtle bg-surface p-1 font-sans text-xs shadow-lg"
                  >
                    <span className="pointer-events-none absolute -bottom-1 left-3 h-2 w-2 rotate-45 border-b border-r border-border-subtle bg-surface" />
                    {(['auto', 'required', 'off'] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        role="menuitemradio"
                        aria-checked={searchMode === mode}
                        onClick={() => {
                          onSearchModeChange(mode);
                          setSearchMenuOpen(false);
                        }}
                        className={`grid h-8 w-full grid-cols-[1fr_0.375rem] items-center gap-3 whitespace-nowrap rounded-md px-2.5 text-left transition-colors ${
                          searchMode === mode
                            ? 'bg-foreground/[0.06] text-foreground'
                            : 'text-muted hover:bg-foreground/[0.04] hover:text-foreground'
                        }`}
                      >
                        <span>{searchModeLabels[mode]}</span>
                        {searchMode === mode && (
                          <span className="h-1.5 w-1.5 rounded-full bg-current" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <Tooltip
                content={
                  learningMode
                    ? 'Learning mode on'
                    : 'Learning mode off'
                }
                side="bottom"
              >
                <button
                  type="button"
                  aria-pressed={learningMode}
                  aria-label={learningMode ? 'Learning mode on' : 'Learning mode off'}
                  onClick={onToggleLearningMode}
                  className={`flex h-7 w-7 items-center justify-center rounded-md border transition-colors ${
                    learningMode
                      ? 'border-foreground/[0.10] bg-foreground/[0.05] text-foreground'
                      : 'border-border-subtle text-muted hover:bg-foreground/[0.04] hover:text-foreground/70'
                  }`}
                >
                  <svg
                    className="h-3.5 w-3.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"
                    />
                  </svg>
                </button>
              </Tooltip>
            </div>

            <ChatModelPicker
              chatModels={chatModels}
              selectedModelId={selectedModelId}
              disabled={!hasAvailableChatModels}
              onChange={onModelChange}
            />
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
