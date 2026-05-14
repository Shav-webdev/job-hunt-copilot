'use server';

import { signIn } from '@/auth';
import { AuthError } from 'next-auth';

export async function loginAction(_prev: string | null, formData: FormData) {
  try {
    await signIn('credentials', {
      email: formData.get('email'),
      password: formData.get('password'),
      redirectTo: '/',
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return 'Invalid email or password';
    }
    throw error; // re-throw Next.js redirect
  }
  return null;
}
