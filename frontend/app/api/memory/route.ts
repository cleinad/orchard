import { NextResponse } from 'next/server';

function deprecatedResponse() {
  return NextResponse.json(
    {
      error: 'Deprecated endpoint. Use /api/memory/items and /api/memory/items/:id.',
    },
    { status: 410 }
  );
}

export async function GET() {
  return deprecatedResponse();
}

export async function PATCH() {
  return deprecatedResponse();
}

export async function DELETE() {
  return deprecatedResponse();
}
