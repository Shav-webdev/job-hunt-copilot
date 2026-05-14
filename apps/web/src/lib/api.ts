import { auth } from '@/auth';

const API_URL = process.env.API_URL ?? 'http://localhost:3000';

async function getToken(): Promise<string | undefined> {
  const session = await auth();
  return (session as { accessToken?: string } | null)?.accessToken;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

export type Job = {
  id: string;
  title: string;
  company: string;
  description: string;
  url: string;
  location: string | null;
  createdAt: string;
};

export type Application = {
  id: string;
  jobId: string;
  status: 'saved' | 'applied' | 'interview' | 'rejected' | 'offer';
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  job: Job;
};

export const api = {
  jobs: {
    list: () => apiFetch<Job[]>('/jobs'),
    get: (id: string) => apiFetch<Job>(`/jobs/${id}`),
    create: (data: Omit<Job, 'id' | 'createdAt'>) =>
      apiFetch<Job>('/jobs', { method: 'POST', body: JSON.stringify(data) }),
  },
  applications: {
    list: () => apiFetch<Application[]>('/applications'),
    create: (data: { jobId: string; status?: string; notes?: string }) =>
      apiFetch<Application>('/applications', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: { status?: string; notes?: string }) =>
      apiFetch<Application>(`/applications/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    remove: (id: string) => apiFetch<void>(`/applications/${id}`, { method: 'DELETE' }),
  },
  users: {
    me: () => apiFetch<{ id: string; email: string; name: string | null }>('/users/me'),
  },
  cvs: {
    latest: () => apiFetch<{ id: string; parsed: unknown; createdAt: string; rawText: string }>('/cvs/latest'),
  },
};
