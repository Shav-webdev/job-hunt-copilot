import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';

export const dynamic = 'force-dynamic';

const API_URL = process.env.API_URL ?? 'http://localhost:3000';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const token = (session as { accessToken?: string }).accessToken;
  const body = await req.formData();

  const res = await fetch(`${API_URL}/cvs/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body,
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
