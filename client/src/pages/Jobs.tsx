import { Link, useSearchParams } from 'react-router-dom';
import { TYPE_LABEL, formatDate, formatSalary, type Job, type JobType, type Paged } from '../api';
import { useFetch } from '../hooks';
import { Empty, ErrorBox, Pagination, Spinner } from '../components/ui';

export default function Jobs() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const location = params.get('location') ?? '';
  const type = params.get('type') ?? '';
  const page = Number(params.get('page') ?? 1) || 1;

  const qs = new URLSearchParams({ page: String(page), pageSize: '8' });
  if (q) qs.set('q', q);
  if (location) qs.set('location', location);
  if (type) qs.set('type', type);

  const jobs = useFetch<Paged<Job>>(`/jobs?${qs}`);
  const locations = useFetch<{ items: string[] }>('/jobs/locations');

  const update = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!('page' in patch)) next.delete('page');
    setParams(next);
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-ink">Find your next role</h1>
      <form
        role="search"
        className="card mt-5 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          update({ q: String(new FormData(e.currentTarget).get('q') ?? '').trim() });
        }}
      >
        <div>
          <label htmlFor="q" className="label">Keyword</label>
          <input id="q" name="q" key={q} defaultValue={q} placeholder="Title, skill or company" className="input" />
        </div>
        <div>
          <label htmlFor="location" className="label">Location</label>
          <select id="location" className="input" value={location} onChange={(e) => update({ location: e.target.value })}>
            <option value="">All locations</option>
            {locations.data?.items.map((l) => <option key={l}>{l}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="type" className="label">Job type</label>
          <select id="type" className="input" value={type} onChange={(e) => update({ type: e.target.value })}>
            <option value="">All types</option>
            {(Object.keys(TYPE_LABEL) as JobType[]).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
          </select>
        </div>
        <div className="flex items-end gap-2">
          <button className="btn-primary flex-1">Search</button>
          {(q || location || type) && (
            <button type="button" className="btn-secondary" onClick={() => setParams({})}>Clear</button>
          )}
        </div>
      </form>

      <div className="mt-6" aria-live="polite">
        {jobs.loading && !jobs.data ? (
          <Spinner label="Loading jobs" />
        ) : jobs.error ? (
          <ErrorBox message={jobs.error} onRetry={jobs.reload} />
        ) : jobs.data && jobs.data.items.length === 0 ? (
          <Empty title="No jobs match your search">Try a different keyword or clear the filters.</Empty>
        ) : (
          jobs.data && (
            <>
              <p className="mb-3 text-sm text-slate-500">{jobs.data.total} open {jobs.data.total === 1 ? 'job' : 'jobs'}</p>
              <ul className="space-y-3">
                {jobs.data.items.map((j) => (
                  <li key={j.id}>
                    <Link to={`/jobs/${j.id}`} className="card block p-5 transition hover:border-brand-600">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <h2 className="font-semibold text-ink">{j.title}</h2>
                          <p className="text-sm text-slate-600">{j.employer?.company ?? j.employer?.name} · {j.location}</p>
                        </div>
                        <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700">{TYPE_LABEL[j.type]}</span>
                      </div>
                      <p className="mt-2 line-clamp-2 text-sm text-slate-600">{j.description}</p>
                      <p className="mt-3 text-xs text-slate-500">{formatSalary(j.salaryMin, j.salaryMax)} · Posted {formatDate(j.createdAt)}</p>
                    </Link>
                  </li>
                ))}
              </ul>
              <Pagination page={jobs.data.page} totalPages={jobs.data.totalPages} onPage={(p) => update({ page: String(p) })} />
            </>
          )
        )}
      </div>
    </div>
  );
}
