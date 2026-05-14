'use client';

import { useRef, useState } from 'react';

type AgentEvent = {
  type: 'start' | 'tool_start' | 'tool_end' | 'llm_chunk' | 'done' | 'error';
  message: string;
  data?: Record<string, unknown>;
};

type LogEntry = { id: number; event: AgentEvent };

const ICON: Record<AgentEvent['type'], string> = {
  start: '🚀',
  tool_start: '⚙️',
  tool_end: '✓',
  llm_chunk: '💬',
  done: '✅',
  error: '❌',
};

export default function ChatPage() {
  const [goal, setGoal] = useState('');
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const idRef = useRef(0);
  const readerRef = useRef<ReadableStreamDefaultReader | null>(null);

  function appendEntry(event: AgentEvent) {
    setLog((prev) => [...prev, { id: idRef.current++, event }]);
  }

  async function handleRun() {
    if (!goal.trim() || running) return;
    setLog([]);
    setRunning(true);

    try {
      const runRes = await fetch('/api/proxy/agent/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal }),
      });
      if (!runRes.ok) throw new Error('Failed to start agent run');
      const { run_id } = await runRes.json() as { run_id: string };

      const streamRes = await fetch(`/api/proxy/agent/${run_id}/stream`);
      if (!streamRes.body) throw new Error('No stream body');

      const reader = streamRes.body.getReader();
      readerRef.current = reader;
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
          try {
            const event = JSON.parse(line.slice(6)) as AgentEvent;
            appendEntry(event);
            if (event.type === 'done' || event.type === 'error') return;
          } catch { /* ignore */ }
        }
      }
    } catch (e) {
      appendEntry({ type: 'error', message: e instanceof Error ? e.message : 'Unknown error' });
    } finally {
      setRunning(false);
      readerRef.current = null;
    }
  }

  function handleStop() {
    readerRef.current?.cancel();
    setRunning(false);
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Agent</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Tell the agent what to do — it will search jobs, score them against your CV, and save the best ones.
        </p>
      </div>

      <div className="flex gap-2">
        <input
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleRun()}
          disabled={running}
          placeholder="e.g. Find 5 remote Python jobs and score them against my CV"
          className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        />
        {running ? (
          <button
            onClick={handleStop}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            Stop
          </button>
        ) : (
          <button
            onClick={handleRun}
            disabled={!goal.trim()}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900"
          >
            Run
          </button>
        )}
      </div>

      {log.length > 0 && (
        <div className="flex-1 overflow-y-auto rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <ul className="space-y-2">
            {log.map(({ id, event }) => (
              <li key={id} className="flex items-start gap-2 text-sm">
                <span className="mt-0.5 shrink-0">{ICON[event.type] ?? '•'}</span>
                <span className={
                  event.type === 'error' ? 'text-red-600' :
                  event.type === 'done' ? 'text-green-600 font-medium' :
                  event.type === 'tool_start' ? 'text-blue-600' :
                  'text-zinc-700 dark:text-zinc-300'
                }>
                  {event.message}
                </span>
              </li>
            ))}
            {running && (
              <li className="flex items-center gap-2 text-sm text-zinc-400">
                <span className="animate-pulse">▌</span>
                <span>Working…</span>
              </li>
            )}
          </ul>
        </div>
      )}

      {log.length === 0 && !running && (
        <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800">
          <p className="text-sm text-zinc-400">Agent output will appear here</p>
        </div>
      )}
    </div>
  );
}
