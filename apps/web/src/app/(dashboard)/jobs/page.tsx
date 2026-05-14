import { api } from '@/lib/api';
import { JobActions } from './job-actions';

export default async function JobsPage() {
  const jobs = await api.jobs.list().catch(() => []);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Jobs</h1>

      {jobs.length === 0 ? (
        <p className="mt-6 text-sm text-zinc-500">
          No jobs tracked yet. Use <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">POST /jobs</code> via Swagger to add one.
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {jobs.map((job) => (
            <li key={job.id} className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium text-zinc-900 dark:text-zinc-50">{job.title}</p>
                  <p className="text-sm text-zinc-500">{job.company}</p>
                  {job.location && <p className="mt-0.5 text-xs text-zinc-400">{job.location}</p>}
                </div>
                <a
                  href={job.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-xs font-medium text-blue-600 hover:underline"
                >
                  View →
                </a>
              </div>
              <JobActions jobId={job.id} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
