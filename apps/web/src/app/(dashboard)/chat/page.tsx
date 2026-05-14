export default function ChatPage() {
  return (
    <div className="flex h-full flex-col items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Agent Chat</h1>
        <p className="mt-2 text-sm text-zinc-500">
          The agentic orchestrator will be wired up in Phase 4.
        </p>
        <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950">
          <span className="h-2 w-2 rounded-full bg-zinc-300" />
          Coming soon
        </div>
      </div>
    </div>
  );
}
