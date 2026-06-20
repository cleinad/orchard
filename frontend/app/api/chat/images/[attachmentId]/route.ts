import { NextRequest, NextResponse } from 'next/server';
import { CHAT_IMAGE_BUCKET } from '@/lib/chat-attachments';
import { createSupabaseServerClient } from '@/lib/supabase-server';

interface RouteContext {
  params: Promise<{
    attachmentId: string;
  }>;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const { attachmentId } = await context.params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: attachment, error } = await supabase
    .from('message_attachments')
    .select('storage_path, storage_bucket, mime_type, file_name')
    .eq('id', attachmentId)
    .eq('user_id', user.id)
    .single();

  if (error || !attachment || attachment.storage_bucket !== CHAT_IMAGE_BUCKET) {
    return NextResponse.json({ error: 'Image not found' }, { status: 404 });
  }

  const { data, error: downloadError } = await supabase.storage
    .from(CHAT_IMAGE_BUCKET)
    .download(attachment.storage_path);

  if (downloadError || !data) {
    return NextResponse.json({ error: 'Could not load image' }, { status: 500 });
  }

  const fileName = String(attachment.file_name || 'image').replace(/["\r\n]/g, '_');

  return new NextResponse(data, {
    headers: {
      'Cache-Control': 'private, no-store',
      'Content-Disposition': `inline; filename="${fileName}"`,
      'Content-Type': String(attachment.mime_type || 'application/octet-stream'),
    },
  });
}
