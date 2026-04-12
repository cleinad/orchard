import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || '';
// Default to a natural conversational voice - you can change this
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'fjnwTZkKtQOJaYzGLa6n'; // William, deep voice

interface TTSRequest {
  text: string;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!ELEVENLABS_API_KEY) {
      return NextResponse.json(
        { error: 'ElevenLabs API key not configured' },
        { status: 500 }
      );
    }

    const body: TTSRequest = await request.json();
    const { text } = body;

    if (!text?.trim()) {
      return NextResponse.json(
        { error: 'Text is required' },
        { status: 400 }
      );
    }

    // Call ElevenLabs streaming endpoint — audio chunks arrive as they're generated
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}/stream`,
      {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': ELEVENLABS_API_KEY,
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_turbo_v2_5', // Fast, good quality
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.5,
            use_speaker_boost: true,
          },
        }),
        // Abort the ElevenLabs request if the client disconnects (e.g. user interrupts)
        signal: request.signal,
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('ElevenLabs API error:', error);
      return NextResponse.json(
        { error: `ElevenLabs API error: ${response.status}` },
        { status: response.status }
      );
    }

    // Pipe the stream straight through — no buffering
    return new NextResponse(response.body, {
      headers: {
        'Content-Type': 'audio/mpeg',
      },
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      // Client disconnected — nothing to send back
      return new NextResponse(null, { status: 499 });
    }
    console.error('TTS API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
