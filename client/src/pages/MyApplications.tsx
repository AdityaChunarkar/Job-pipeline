import { useState } from 'react';
import { Link } from 'react-router-dom';
import { TYPE_LABEL, formatDate, type AppStatus, type HistoryEntry, type JobType } from '../api';
import { useFetch } from '../hooks';
import { Empty, ErrorBox, Spinner, StatusBadge, Timeline } from '../components/ui';

interface MyApp {
  id: string;
  status: AppStatus;
  createdAt: string;
  job: { id: string; title: string; location: string; type: JobType; status: string; employer: { company: string | null } };
  history: HistoryEntry[];
}

export default function MyApplications() {
  const { data, error, loading, reload } = useFetch<{ items: MyApp[] }>('/applications/mine');
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div>
      <h1 className="text-2xl font-bold text-ink">My applications</h1>
      <div className="mt-6">
        {loading && !data ? <Spinner /> : error ? <ErrorBox message={error} onRetry={reload} /> : data && data.items.length === 0 ? (
          <Empty title="You haven't applied to any jobs yet">
            <Link to="/jobs" className="font-medium text-brand-700 hover:underline">Browse open jobs</Link>
          </Empty>
        ) : (
          <ul className="space-y-3">
            {data?.items.map((a) => (
              <li key={a.id} className="card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <Link to={`/jobs/${a.job.id}`} className="font-semibold text-ink hover:underline">{a.job.title}</Link>
                    <p className="text-sm text-slate-600">{a.job.employer.company} · {a.job.location} · {TYPE_LABEL[a.job.type]}</p>
                    <p className="mt-1 text-xs text-slate-500">Applied {formatDate(a.createdAt)}</p>
                  </div>
                  <StatusBadge status={a.status} />
                </div>
                <button
                  className="mt-3 text-sm font-medium text-brand-700 hover:underline"
                  aria-expanded={open === a.id}
                  onClick={() => setOpen(open === a.id ? null : a.id)}
                >
                  {open === a.id ? 'Hide timeline' : 'Show timeline'}
                </button>
                {open === a.id && <div className="mt-4 pl-2"><Timeline history={a.history} /></div>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
