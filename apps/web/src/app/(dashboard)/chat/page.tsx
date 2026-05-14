'use client';

import { useEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';

type EventType = 'start' | 'tool_start' | 'tool_end' | 'llm_chunk' | 'done' | 'error';

type AgentEvent = {
  type: EventType;
  message: string;
  data?: Record<string, unknown>;
};

type LogEntry = { id: number; event: AgentEvent };

const STORAGE_KEY = 'jobhunt-chat-log';

function loadLog(): LogEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function saveLog(log: LogEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(log));
}

export default function ChatPage() {
  const [goal, setGoal] = useState('');
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const idRef = useRef(0);
  const readerRef = useRef<ReadableStreamDefaultReader | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = loadLog();
    if (saved.length) {
      idRef.current = (saved.at(-1)?.id ?? -1) + 1;
      setLog(saved);
    }
  }, []);

  useEffect(() => {
    saveLog(log);
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [log]);

  function append(event: AgentEvent) {
    setLog((prev) => {
      // Accumulate consecutive llm_chunk events into the last entry
      if (event.type === 'llm_chunk' && prev.at(-1)?.event.type === 'llm_chunk') {
        const last = prev.at(-1)!;
        const updated = {
          ...last,
          event: { ...last.event, message: last.event.message + event.message },
        };
        return [...prev.slice(0, -1), updated];
      }
      return [...prev, { id: idRef.current++, event }];
    });
  }

  async function handleRun() {
    if (!goal.trim() || running) return;
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
            append(event);
            if (event.type === 'done' || event.type === 'error') return;
          } catch { /* ignore */ }
        }
      }
    } catch (e) {
      append({ type: 'error', message: e instanceof Error ? e.message : 'Unknown error' });
    } finally {
      setRunning(false);
      readerRef.current = null;
    }
  }

  function handleStop() {
    readerRef.current?.cancel();
    setRunning(false);
  }

  function handleClear() {
    setLog([]);
    idRef.current = 0;
    localStorage.removeItem(STORAGE_KEY);
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Agent</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Tell the agent what to do — it will search jobs, score them against your CV, and save the best ones.
          </p>
        </div>
        {log.length > 0 && !running && (
          <button
            onClick={handleClear}
            className="text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
          >
            Clear history
          </button>
        )}
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

      {log.length > 0 ? (
        <div className="flex-1 overflow-y-auto rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <ul className="space-y-3">
            {log.map(({ id, event }) => (
              <LogItem key={id} event={event} />
            ))}
            {running && (
              <li className="flex items-center gap-2 text-sm text-zinc-400">
                <span className="animate-pulse">▌</span>
                <span>Working…</span>
              </li>
            )}
          </ul>
          <div ref={bottomRef} />
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800">
          <p className="text-sm text-zinc-400">Agent output will appear here</p>
        </div>
      )}
    </div>
  );
}

function LogItem({ event }: { event: AgentEvent }) {
  if (event.type === 'llm_chunk') {
    return (
      <li className="rounded-lg bg-zinc-50 px-4 py-3 dark:bg-zinc-900">
        <div className="prose prose-sm prose-zinc dark:prose-invert max-w-none
          prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5
          prose-headings:my-2 prose-a:text-blue-600">
          <Markdown>{event.message}</Markdown>
        </div>
      </li>
    );
  }

  if (event.type === 'tool_end') {
    const output = event.data?.output as string | undefined;
    let parsed: unknown = null;
    try { parsed = JSON.parse(output ?? ''); } catch { /* not JSON */ }

    return (
      <li className="space-y-1">
        <div className="flex items-center gap-2 text-sm">
          <span className="shrink-0 text-green-600">✓</span>
          <span className="font-medium text-zinc-700 dark:text-zinc-300">{event.message}</span>
        </div>
        {output && (
          <div className="ml-5 rounded-md bg-zinc-50 px-3 py-2 dark:bg-zinc-900">
            {Array.isArray(parsed) ? (
              <ul className="space-y-1.5">
                {(parsed as Record<string, string>[]).map((item, i) => (
                  <li key={i} className="text-xs text-zinc-600 dark:text-zinc-400">
                    <span className="font-medium text-zinc-800 dark:text-zinc-200">{item.title}</span>
                    {item.company ? ` · ${item.company}` : ''}
                    {item.url ? (
                      <a href={item.url} target="_blank" rel="noopener noreferrer"
                        className="ml-1 text-blue-600 hover:underline">↗</a>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-zinc-500 whitespace-pre-wrap line-clamp-4">{output}</p>
            )}
          </div>
        )}
      </li>
    );
  }

  const colours: Partial<Record<EventType, string>> = {
    error: 'text-red-600',
    done: 'text-green-600 font-medium',
    tool_start: 'text-blue-600',
    start: 'text-zinc-500 text-xs',
  };

  const icons: Partial<Record<EventType, string>> = {
    start: '🚀', tool_start: '⚙️', done: '✅', error: '❌',
  };

  return (
    <li className="flex items-start gap-2 text-sm">
      <span className="mt-0.5 shrink-0">{icons[event.type] ?? '•'}</span>
      <span className={colours[event.type] ?? 'text-zinc-700 dark:text-zinc-300'}>
        {event.message}
      </span>
    </li>
  );
}
