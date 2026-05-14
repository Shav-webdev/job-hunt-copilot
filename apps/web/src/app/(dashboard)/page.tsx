import { auth } from '@/auth';
import { api } from '@/lib/api';

export default async function DashboardPage() {
  const session = await auth();
  const [jobs, applications] = await Promise.all([
    api.jobs.list().catch(() => []),
    api.applications.list().catch(() => []),
  ]);

  const statusCounts = applications.reduce<Record<string, number>>((acc, a) => {
    acc[a.status] = (acc[a.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        Welcome back{session?.user?.name ? `, ${session.user.name}` : ''}
      </h1>
      <p className="mt-1 text-sm text-zinc-500">Here's your job hunt at a glance.</p>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: 'Jobs tracked', value: jobs.length },
          { label: 'Applied', value: statusCounts['applied'] ?? 0 },
          { label: 'Interviews', value: statusCounts['interview'] ?? 0 },
          { label: 'Offers', value: statusCounts['offer'] ?? 0 },
        ].map((stat) => (
          <div
            key={stat.label}
            className="flex items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950"
          >
            <p className="text-sm text-zinc-500">{stat.label}</p>
            <p className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-8">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
          Recent applications
        </h2>
        {applications.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">No applications yet. Add a job to get started.</p>
        ) : (
          <ul className="mt-3 divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-950">
            {applications.slice(0, 5).map((app) => (
              <li key={app.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                    {app.job.title}
                  </p>
                  <p className="text-xs text-zinc-500">{app.job.company}</p>
                </div>
                <StatusBadge status={app.status} />
              </li>
            ))}
          </ul>
        )}
      </div>
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
