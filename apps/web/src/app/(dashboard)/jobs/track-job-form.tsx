'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Field = { label: string; name: string; type?: string; required?: boolean; rows?: number };

const FIELDS: Field[] = [
  { label: 'Job URL', name: 'url', required: true },
  { label: 'Title', name: 'title', required: true },
  { label: 'Company', name: 'company', required: true },
  { label: 'Location', name: 'location' },
  { label: 'Description', name: 'description', required: true, rows: 5 },
];

export function TrackJobForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError('');

    const form = e.currentTarget;
    const data = Object.fromEntries(
      FIELDS.map((f) => [f.name, (form.elements.namedItem(f.name) as HTMLInputElement | HTMLTextAreaElement).value.trim()]).filter(([, v]) => v !== ''),
    );

    try {
      const res = await fetch('/api/proxy/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const body = await res.json() as { message?: string };
        throw new Error(body.message ?? `Error ${res.status}`);
      }

      form.reset();
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save job');
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        + Track a job
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
      <p className="mb-4 font-medium text-zinc-900 dark:text-zinc-50">Track a job</p>

      <div className="space-y-3">
        {FIELDS.map((field) =>
          field.rows ? (
            <label key={field.name} className="block">
              <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                {field.label}{field.required && ' *'}
              </span>
              <textarea
                name={field.name}
                required={field.required}
                rows={field.rows}
                className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                placeholder="Paste the full job description here…"
              />
            </label>
          ) : (
            <label key={field.name} className="block">
              <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                {field.label}{field.required && ' *'}
              </span>
              <input
                name={field.name}
                type={field.name === 'url' ? 'url' : 'text'}
                required={field.required}
                className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                placeholder={field.name === 'url' ? 'https://…' : ''}
              />
            </label>
          ),
        )}
      </div>

      {error && <p className="mt-3 text-xs text-red-600">{error}</p>}

      <div className="mt-4 flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {saving ? 'Saving…' : 'Save job'}
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setError(''); }}
          className="rounded-md border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
