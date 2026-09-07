import 'server-only';

import { after } from 'next/server';
import {
  recordModelUsageCall,
  startModelUsageCall,
  type ModelUsageCallContext,
  type ModelUsageTerminal,
} from '@/lib/telemetry/server';

export type ModelUsageTerminalRecorder = (
  terminal: ModelUsageTerminal
) => void;

function deferTerminalWrite(
  context: ModelUsageCallContext,
  terminal: ModelUsageTerminal
) {
  const write = () => recordModelUsageCall(context, terminal);

  try {
    after(write);
  } catch {
    void write();
  }
}

export function startDeferredModelUsageCall(
  context: Omit<ModelUsageCallContext, 'id' | 'startedAt'>
): ModelUsageTerminalRecorder {
  try {
    const started = startModelUsageCall(context);
    let terminalRecorded = false;

    return (terminal) => {
      if (terminalRecorded) return;
      terminalRecorded = true;
      deferTerminalWrite(started, terminal);
    };
  } catch {
    console.error('[telemetry] provider call start failed', {
      code: 'start_failed',
    });
    return () => undefined;
  }
}
