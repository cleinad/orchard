import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getChatRun, logChatRunEvent } from '@/lib/chat-runs/server';
import { isUuid } from '@/lib/chat-session';

export async function GET(
  request: NextRequest,
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
    console.error('[chat-run] reconciliation lookup failed', {
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

  if (request.headers.get('x-chat-run-reconciliation') === 'initial') {
    await logChatRunEvent({
      supabase,
      userId: user.id,
      runId,
      event: 'client_reconciled',
    });
  }
  return NextResponse.json({ run });
}
