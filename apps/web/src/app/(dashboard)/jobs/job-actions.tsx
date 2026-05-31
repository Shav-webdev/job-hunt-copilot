'use client';

import { useState } from 'react';

type ScoreResult = { score: number; reasons: string[] };

export function JobActions({ jobId }: { jobId: string }) {
  const [score, setScore] = useState<ScoreResult | null>(null);
  const [scoring, setScoring] = useState(false);
  const [scoreError, setScoreError] = useState('');

  const [letter, setLetter] = useState('');
  const [streaming, setStreaming] = useState(false);

  async function handleScore() {
    setScoring(true);
    setScoreError('');
    setScore(null);
    try {
      const res = await fetch(`/api/proxy/jobs/${jobId}/score`, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json() as { message?: string };
        if (res.status === 429) {
          throw new Error('AI rate limit reached — please wait a moment and try again.');
        }
        throw new Error(body.message ?? `Error ${res.status}`);
      }
      setScore(await res.json() as ScoreResult);
    } catch (e) {
      setScoreError(e instanceof Error ? e.message : 'Failed to score CV');
    } finally {
      setScoring(false);
    }
  }

  async function handleCoverLetter() {
    setStreaming(true);
    setLetter('');
    try {
      const res = await fetch(`/api/proxy/jobs/${jobId}/cover-letter`, { method: 'POST' });
      if (!res.ok || !res.body) throw new Error('Stream failed');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6);
          if (payload === '[DONE]') break;
          try {
            const { text } = JSON.parse(payload) as { text: string };
            setLetter((prev) => prev + text);
          } catch { /* ignore parse errors */ }
        }
      }
    } finally {
      setStreaming(false);
    }
  }

  return (
    <div className="mt-4 space-y-3">
      <div className="flex gap-2">
        <button
          onClick={handleScore}
          disabled={scoring}
          className="rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          {scoring ? 'Scoring…' : 'Score my CV'}
        </button>
        <button
          onClick={handleCoverLetter}
          disabled={streaming}
          className="rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          {streaming ? 'Drafting…' : 'Draft cover letter'}
        </button>
      </div>

      {scoreError && <p className="text-xs text-red-600">{scoreError}</p>}

      {score && (
        <div className="rounded-lg bg-zinc-50 p-3 text-sm dark:bg-zinc-900">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-zinc-900 dark:text-zinc-50">Match score</span>
            <span className="font-semibold text-blue-600">{Math.round(score.score * 100)}%</span>
          </div>
          <ul className="mt-2 space-y-1">
            {score.reasons.map((r, i) => (
              <li key={i} className="text-xs text-zinc-600 dark:text-zinc-400">· {r}</li>
            ))}
          </ul>
        </div>
      )}

      {(letter || streaming) && (
        <div className="rounded-lg bg-zinc-50 p-4 dark:bg-zinc-900">
          <p className="mb-2 text-xs font-medium uppercase text-zinc-400">Cover Letter</p>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
            {letter}
            {streaming && <span className="animate-pulse">▌</span>}
          </p>
        </div>
      )}
    </div>
  );
}
