'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { registerAction } from './actions';

export default function RegisterPage() {
  const [error, formAction, isPending] = useActionState(registerAction, null);

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-900">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Create account</h1>
        <p className="mt-1 text-sm text-zinc-500">Job Hunt Copilot</p>
        <form action={formAction} className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300" htmlFor="name">
              Name <span className="text-zinc-400">(optional)</span>
            </label>
            <input
              id="name"
              name="name"
              type="text"
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300" htmlFor="password">
              Password <span className="text-zinc-400">(min 8 chars)</span>
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={isPending}
            className="w-full rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {isPending ? 'Creating account…' : 'Create account'}
          </button>
        </form>
        <p className="mt-4 text-center text-xs text-zinc-500">
          Already have an account?{' '}
          <Link href="/login" className="text-zinc-900 underline dark:text-zinc-50">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
