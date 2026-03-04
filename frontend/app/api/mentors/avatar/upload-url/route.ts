import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { buildAvatarObjectPath } from '@/lib/mentors/server';
import { MENTOR_AVATARS_BUCKET } from '@/lib/mentors/types';

const UploadUrlSchema = z.object({
  file_name: z.string().min(1).max(200),
  content_type: z.enum(['image/png', 'image/jpeg', 'image/webp']),
  mentor_id: z.string().uuid().optional(),
});

async function getAuthenticatedUser(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>
) {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;
  return user;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const user = await getAuthenticatedUser(supabase);

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const parsed = UploadUrlSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { file_name, mentor_id } = parsed.data;
    const mentorScope = mentor_id ?? 'draft';

    if (mentor_id) {
      const { data: mentor, error: mentorError } = await supabase
        .from('mentors')
        .select('id')
        .eq('id', mentor_id)
        .eq('user_id', user.id)
        .single();

      if (mentorError || !mentor) {
        return NextResponse.json({ error: 'Mentor not found' }, { status: 404 });
      }
    }

    const path = buildAvatarObjectPath(user.id, mentorScope, file_name);
    const storage = supabase.storage.from(MENTOR_AVATARS_BUCKET);

    const { data: uploadData, error: uploadError } = await storage.createSignedUploadUrl(path);
    if (uploadError || !uploadData) {
      return NextResponse.json(
        { error: uploadError?.message || 'Failed to create upload URL' },
        { status: 500 }
      );
    }

    const { data: publicUrlData } = storage.getPublicUrl(path);

    return NextResponse.json({
      upload_url: uploadData.signedUrl,
      upload_token: uploadData.token,
      path: uploadData.path,
      public_url: publicUrlData.publicUrl,
      bucket: MENTOR_AVATARS_BUCKET,
    });
  } catch (error) {
    console.error('Avatar upload-url POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
