import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import {
  getChatRun,
  logChatRunEvent,
} from '@/lib/chat-runs/server';
import { isTerminalChatRunStatus } from '@/lib/chat-runs/protocol';
import { isUuid } from '@/lib/chat-session';
import { abortActiveChatRun } from '@/lib/chat-runs/active-run-registry';

type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

async function currentRunResponse(
  supabase: SupabaseServerClient,
  runId: string
) {
  try {
    const run = await getChatRun(supabase, runId);
    if (!run) {
      return NextResponse.json(
        { error: 'Run not found', code: 'run_not_found' },
        { status: 404 }
      );
    }
    return NextResponse.json({ run });
  } catch (lookupError) {
    console.error('[chat-run] post-cancellation lookup failed', {
      runId,
      code: lookupError instanceof Error ? lookupError.name : 'unknown_error',
    });
    return NextResponse.json(
      { error: 'Failed to load chat run', code: 'run_lookup_failed' },
      { status: 500 }
    );
  }
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params;
  if (!isUuid(runId)) {
    return NextResponse.json({ error: 'Invalid run id' }, { status: 400 });
  }
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  let run;
  try {
    run = await getChatRun(supabase, runId);
  } catch (lookupError) {
    console.error('[chat-run] cancellation lookup failed', {
      runId,
      code: lookupError instanceof Error ? lookupError.name : 'unknown_error',
    });
    return NextResponse.json(
      { error: 'Failed to load chat run', code: 'run_lookup_failed' },
      { status: 500 }
    );
  }
  if (!run) {
    return NextResponse.json(
      { error: 'Run not found', code: 'run_not_found' },
      { status: 404 }
    );
  }
  if (!isTerminalChatRunStatus(run.status)) {
    const now = new Date().toISOString();
    const { data: cancelledRun, error: cancelError } = await supabase
      .from('chat_runs')
      .update({
        status: 'cancelled',
        response_status: 'cancelled',
        title_status: ['completed', 'failed', 'skipped'].includes(run.subsystems.title)
          ? run.subsystems.title
          : 'cancelled',
        search_status: ['completed', 'failed', 'skipped'].includes(run.subsystems.search)
          ? run.subsystems.search
          : 'cancelled',
        cancelled_at: now,
        completed_at: now,
        updated_at: now,
      })
      .eq('id', runId)
      .eq('user_id', user.id)
      .in('status', ['queued', 'submitting', 'streaming', 'finalizing', 'interrupted'])
      .neq('response_status', 'completed')
      .select('id')
      .maybeSingle();
    if (cancelError) {
      return NextResponse.json(
        { error: 'Failed to cancel run', code: 'run_cancel_failed' },
        { status: 500 }
      );
    }
    if (!cancelledRun) {
      return currentRunResponse(supabase, runId);
    }
    abortActiveChatRun(runId);
    await logChatRunEvent({
      supabase,
      userId: user.id,
      runId,
      event: 'cancelled',
    });
  }
  return currentRunResponse(supabase, runId);
}
