import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ApiError, TYPE_LABEL, api, formatDate, type Job, type Paged } from '../api';
import { useFetch } from '../hooks';
import { Empty, ErrorBox, Pagination, Spinner } from '../components/ui';

export default function EmployerDashboard() {
  const [params, setParams] = useSearchParams();
  const page = Number(params.get('page') ?? 1) || 1;
  const { data, error, loading, reload } = useFetch<Paged<Job>>(`/employer/jobs?page=${page}&pageSize=10`);
  const [actionError, setActionError] = useState('');

  async function toggle(job: Job) {
    setActionError('');
    try {
      await api(`/employer/jobs/${job.id}/${job.status === 'OPEN' ? 'close' : 'reopen'}`, { method: 'POST' });
      reload();
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : 'Action failed');
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink">Your jobs</h1>
        <Link to="/employer/jobs/new" className="btn-primary">Post a job</Link>
      </div>
      <div className="mt-6 space-y-3">
        {actionError && <ErrorBox message={actionError} />}
        {loading && !data ? <Spinner /> : error ? <ErrorBox message={error} onRetry={reload} /> : data && data.items.length === 0 ? (
          <Empty title="No jobs yet">Post your first job to start receiving applicants.</Empty>
        ) : (
          <>
            <ul className="space-y-3">
              {data?.items.map((j) => (
                <li key={j.id} className="card flex flex-wrap items-center justify-between gap-4 p-5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="truncate font-semibold text-ink">{j.title}</h2>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${j.status === 'OPEN' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                        {j.status === 'OPEN' ? 'Open' : 'Closed'}
                      </span>
                    </div>
                    <p className="text-sm text-slate-600">{j.location} · {TYPE_LABEL[j.type]} · Posted {formatDate(j.createdAt)}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Link to={`/employer/jobs/${j.id}/applicants`} className="btn-secondary">
                      Applicants <span className="rounded-full bg-brand-50 px-2 text-xs font-semibold text-brand-700">{j.applicantCount}</span>
                    </Link>
                    <Link to={`/employer/jobs/${j.id}/edit`} className="btn-secondary">Edit</Link>
                    <button className={j.status === 'OPEN' ? 'btn-danger' : 'btn-secondary'} onClick={() => toggle(j)}>
                      {j.status === 'OPEN' ? 'Close' : 'Reopen'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            {data && <Pagination page={data.page} totalPages={data.totalPages} onPage={(p) => setParams({ page: String(p) })} />}
          </>
        )}
      </div>
    </div>
  );
}
