import { api } from '@/lib/api';
import { CvUpload } from './cv-upload';

type ParsedCv = {
  name?: string;
  summary?: string;
  skills?: string[];
  experience?: { title: string; company: string; duration?: string }[];
  education?: { degree: string; institution: string; year?: string }[];
};

export default async function ProfilePage() {
  const [user, cv] = await Promise.all([
    api.users.me().catch(() => null),
    api.cvs.latest().catch(() => null),
  ]);

  const parsed = cv?.parsed as ParsedCv | undefined;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Profile</h1>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">Account</h2>
          <dl className="mt-4 space-y-3">
            <div>
              <dt className="text-xs text-zinc-400">Email</dt>
              <dd className="mt-0.5 text-sm text-zinc-900 dark:text-zinc-50">{user?.email ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-400">Name</dt>
              <dd className="mt-0.5 text-sm text-zinc-900 dark:text-zinc-50">{user?.name ?? 'Not set'}</dd>
            </div>
          </dl>
        </div>
        <CvUpload />
      </div>

      {parsed && (
        <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
            Parsed CV{parsed.name ? ` — ${parsed.name}` : ''}
          </h2>
          <div className="mt-4 space-y-5 text-sm text-zinc-700 dark:text-zinc-300">
            {parsed.summary && <p>{parsed.summary}</p>}

            {parsed.skills && parsed.skills.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-medium uppercase text-zinc-400">Skills</p>
                <div className="flex flex-wrap gap-1.5">
                  {parsed.skills.map((s) => (
                    <span key={s} className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs dark:bg-zinc-800">{s}</span>
                  ))}
                </div>
              </div>
            )}

            {parsed.experience && parsed.experience.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-medium uppercase text-zinc-400">Experience</p>
                <ul className="space-y-1">
                  {parsed.experience.map((e, i) => (
                    <li key={i}>
                      <span className="font-medium">{e.title}</span> · {e.company}
                      {e.duration ? ` (${e.duration})` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {parsed.education && parsed.education.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-medium uppercase text-zinc-400">Education</p>
                <ul className="space-y-1">
                  {parsed.education.map((e, i) => (
                    <li key={i}>{e.degree} · {e.institution}{e.year ? ` (${e.year})` : ''}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
