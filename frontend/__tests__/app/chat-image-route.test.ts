import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createMockSupabase } from '../helpers/mock-supabase';

const mockCreateSupabaseServerClient = vi.fn();
const mockStorageDownload = vi.fn();

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServerClient: () => mockCreateSupabaseServerClient(),
}));

function createSupabase({
  userId = 'user-1',
  attachmentRows = [],
}: {
  userId?: string | null;
  attachmentRows?: object[];
} = {}) {
  const { client } = createMockSupabase({
    tables: {
      message_attachments: {
        rows: attachmentRows,
      },
    },
  });

  return {
    ...client,
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: userId ? { id: userId } : null },
        error: null,
      }),
    },
    storage: {
      from: vi.fn(() => ({
        download: (...args: unknown[]) => mockStorageDownload(...args),
      })),
    },
  };
}

async function runImageRequest(attachmentId = 'attachment-1') {
  const { GET } = await import('@/app/api/chat/images/[attachmentId]/route');
  return GET(new NextRequest(`http://localhost/api/chat/images/${attachmentId}`), {
    params: Promise.resolve({ attachmentId }),
  });
}

describe('chat image route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStorageDownload.mockResolvedValue({
      data: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
      error: null,
    });
  });

  it('requires an authenticated user', async () => {
    mockCreateSupabaseServerClient.mockResolvedValue(createSupabase({ userId: null }));

    const response = await runImageRequest();

    expect(response.status).toBe(401);
    expect(mockStorageDownload).not.toHaveBeenCalled();
  });

  it('streams an owned private image through the app route', async () => {
    mockCreateSupabaseServerClient.mockResolvedValue(
      createSupabase({
        attachmentRows: [
          {
            storage_path: 'user-1/photo.png',
            storage_bucket: 'chat-images',
            mime_type: 'image/png',
            file_name: 'photo.png',
          },
        ],
      })
    );

    const response = await runImageRequest();

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('content-disposition')).toBe('inline; filename="photo.png"');
    expect(mockStorageDownload).toHaveBeenCalledWith('user-1/photo.png');
    expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual([1, 2, 3]);
  });
});
