import { api } from '@/lib/api';

const STATUS_ORDER = ['saved', 'applied', 'interview', 'offer', 'rejected'];

export default async function ApplicationsPage() {
  const applications = await api.applications.list().catch(() => []);
  const sorted = [...applications].sort(
    (a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status),
  );

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Applications</h1>

      {sorted.length === 0 ? (
        <p className="mt-6 text-sm text-zinc-500">No applications yet.</p>
      ) : (
        <table className="mt-6 w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left dark:border-zinc-800">
              <th className="pb-2 font-medium text-zinc-500">Role</th>
              <th className="pb-2 font-medium text-zinc-500">Company</th>
              <th className="pb-2 font-medium text-zinc-500">Status</th>
              <th className="pb-2 font-medium text-zinc-500">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
            {sorted.map((app) => (
              <tr key={app.id}>
                <td className="py-3 font-medium text-zinc-900 dark:text-zinc-50">{app.job.title}</td>
                <td className="py-3 text-zinc-500">{app.job.company}</td>
                <td className="py-3">
                  <StatusBadge status={app.status} />
                </td>
                <td className="py-3 text-zinc-500">{app.notes ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colours: Record<string, string> = {
    saved: 'bg-zinc-100 text-zinc-700',
    applied: 'bg-blue-50 text-blue-700',
    interview: 'bg-yellow-50 text-yellow-700',
    rejected: 'bg-red-50 text-red-700',
    offer: 'bg-green-50 text-green-700',
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${colours[status] ?? colours['saved']}`}>
      {status}
    </span>
  );
}
