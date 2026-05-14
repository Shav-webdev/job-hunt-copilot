import Link from 'next/link';
import { auth, signOut } from '@/auth';

const NAV = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/jobs', label: 'Jobs' },
  { href: '/applications', label: 'Applications' },
  { href: '/profile', label: 'Profile' },
  { href: '/chat', label: 'Chat' },
];

export async function Sidebar() {
  const session = await auth();
  return (
    <aside className="flex h-full w-56 flex-col border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="px-4 py-5">
        <span className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Job Hunt Copilot
        </span>
      </div>
      <nav className="flex-1 space-y-0.5 px-2">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center rounded-md px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="border-t border-zinc-200 px-4 py-4 dark:border-zinc-800">
        <p className="truncate text-xs text-zinc-500">{session?.user?.email}</p>
        <form
          action={async () => {
            'use server';
            await signOut({ redirectTo: '/login' });
          }}
        >
          <button
            type="submit"
            className="mt-2 text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50"
          >
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
