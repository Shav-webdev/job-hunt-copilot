'use client';

import { useState, useRef } from 'react';

export function CvUpload() {
  const [status, setStatus] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setStatus('uploading');
    setMessage('');

    const form = new FormData();
    form.append('file', file);

    try {
      const res = await fetch('/api/proxy/cvs/upload', { method: 'POST', body: form });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: res.statusText })) as { message: string };
        throw new Error(err.message);
      }
      setStatus('done');
      setMessage('CV uploaded and parsed successfully. Refresh to see your profile.');
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Upload failed');
    }
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">CV</h2>
      <p className="mt-2 text-sm text-zinc-500">Upload a PDF — Gemini will parse it automatically.</p>

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={status === 'uploading'}
        className="mt-4 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
      >
        {status === 'uploading' ? 'Uploading…' : 'Choose PDF'}
      </button>
      <input ref={inputRef} type="file" accept=".pdf" className="hidden" onChange={handleUpload} />

      {message && (
        <p className={`mt-3 text-xs ${status === 'error' ? 'text-red-600' : 'text-green-600'}`}>
          {message}
        </p>
      )}
    </div>
  );
}
