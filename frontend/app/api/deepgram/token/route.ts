import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';

const DEEPGRAM_TOKEN_URL = 'https://api.deepgram.com/v1/auth/grant';

function isTokenResponse(value: unknown): value is {
  access_token: string;
  expires_in: number;
} {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const response = value as Record<string, unknown>;
  return (
    typeof response.access_token === 'string' &&
    response.access_token.length > 0 &&
    typeof response.expires_in === 'number'
  );
}

export async function POST() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const apiKey = process.env.DEEPGRAM_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Deepgram API key not configured' },
      { status: 503 }
    );
  }

  try {
    const response = await fetch(DEEPGRAM_TOKEN_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Token ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Failed to create Deepgram token' },
        { status: 502 }
      );
    }

    const data = await response.json();
    if (!isTokenResponse(data)) {
      return NextResponse.json(
        { error: 'Invalid Deepgram token response' },
        { status: 502 }
      );
    }

    return NextResponse.json({
      accessToken: data.access_token,
      expiresIn: data.expires_in,
    });
  } catch (error) {
    console.error('Deepgram token route error:', error);
    return NextResponse.json(
      { error: 'Failed to create Deepgram token' },
      { status: 502 }
    );
  }
}
