import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';

const API_URL = process.env.API_URL ?? 'http://localhost:3000';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const token = (session as { accessToken?: string }).accessToken;
  const body = await req.json() as unknown;

  const res = await fetch(`${API_URL}/jobs`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await res.json() as unknown;
  return NextResponse.json(data, { status: res.status });
}
