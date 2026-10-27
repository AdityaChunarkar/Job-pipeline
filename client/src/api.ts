export type Role = 'EMPLOYER' | 'CANDIDATE';
export type JobType = 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'INTERNSHIP' | 'REMOTE';
export type AppStatus = 'APPLIED' | 'SHORTLISTED' | 'INTERVIEW' | 'HIRED' | 'REJECTED';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  company: string | null;
}
export interface Job {
  id: string;
  title: string;
  location: string;
  type: JobType;
  salaryMin: number | null;
  salaryMax: number | null;
  description: string;
  status: 'OPEN' | 'CLOSED';
  createdAt: string;
  employer?: { name: string; company: string | null };
  applicantCount?: number;
}
export interface HistoryEntry {
  id: string;
  fromStatus: AppStatus | null;
  toStatus: AppStatus;
  createdAt: string;
}
export interface Paged<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code: string,
    public details?: { path: string; message: string }[],
  ) {
    super(message);
  }
  /** Field-level messages keyed by input name, for inline form errors. */
  get fields(): Record<string, string> {
    return Object.fromEntries((this.details ?? []).map((d) => [d.path, d.message]));
  }
}

export async function api<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown; form?: FormData } = {},
): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: opts.method ?? (opts.body || opts.form ? 'POST' : 'GET'),
    credentials: 'same-origin',
    headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.form ?? (opts.body ? JSON.stringify(opts.body) : undefined),
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const e = data?.error;
    throw new ApiError(
      res.status,
      e?.message ?? 'Request failed',
      e?.code ?? 'ERROR',
      Array.isArray(e?.details) ? e.details : undefined,
    );
  }
  return data as T;
}

export const TYPE_LABEL: Record<JobType, string> = {
  FULL_TIME: 'Full-time',
  PART_TIME: 'Part-time',
  CONTRACT: 'Contract',
  INTERNSHIP: 'Internship',
  REMOTE: 'Remote',
};
export const STATUS_LABEL: Record<AppStatus, string> = {
  APPLIED: 'Applied',
  SHORTLISTED: 'Shortlisted',
  INTERVIEW: 'Interview',
  HIRED: 'Hired',
  REJECTED: 'Rejected',
};

export function formatSalary(min: number | null, max: number | null) {
  const f = (n: number) => `₹${new Intl.NumberFormat('en-IN').format(n)}`;
  if (min != null && max != null) return `${f(min)} – ${f(max)}`;
  if (min != null) return `From ${f(min)}`;
  if (max != null) return `Up to ${f(max)}`;
  return 'Salary not disclosed';
}
export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
