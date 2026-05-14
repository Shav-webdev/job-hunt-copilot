import { NextRequest } from 'next/server';
import { auth } from '@/auth';

const API_URL = process.env.API_URL ?? 'http://localhost:3000';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return new Response('Unauthorized', { status: 401 });

  const { id } = await params;
  const token = (session as { accessToken?: string }).accessToken;

  const upstream = await fetch(`${API_URL}/jobs/${id}/cover-letter`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });

  // Stream the SSE directly back to the browser
  return new Response(upstream.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
    },
  });
}
