// Generated types from the OpenAPI spec.
// Run: pnpm --filter @jobhunt/shared-types codegen
// (requires the api to be running at localhost:3000)

export type ApplicationStatus = 'saved' | 'applied' | 'interview' | 'rejected' | 'offer';

export interface User {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
}

export interface Job {
  id: string;
  title: string;
  company: string;
  description: string;
  url: string;
  location: string | null;
  createdAt: string;
}

export interface Application {
  id: string;
  userId: string;
  jobId: string;
  status: ApplicationStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  job: Job;
}

export interface Cv {
  id: string;
  userId: string;
  rawText: string;
  parsed: Record<string, unknown>;
  createdAt: string;
}

export interface AuthResponse {
  access_token: string;
}
