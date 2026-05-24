'use server';

import { signIn } from '@/auth';
import { AuthError } from 'next-auth';

const API_URL = process.env.API_URL ?? 'http://localhost:3000';

export async function registerAction(_prev: string | null, formData: FormData) {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;
  const name = formData.get('name') as string;

  const res = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name: name || undefined }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message = body?.message ?? 'Registration failed';
    return Array.isArray(message) ? message.join(', ') : String(message);
  }

  try {
    await signIn('credentials', { email, password, redirectTo: '/' });
  } catch (error) {
    if (error instanceof AuthError) return 'Account created but sign-in failed — try logging in.';
    throw error;
  }
  return null;
}
