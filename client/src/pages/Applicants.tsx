import { useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ApiError, STATUS_LABEL, api, formatDate, type AppStatus, type HistoryEntry, type Job, type Paged } from '../api';
import { useFetch } from '../hooks';
import { Empty, ErrorBox, Pagination, Spinner, StatusBadge, SuccessBox, Timeline } from '../components/ui';

interface Row {
  id: string;
  status: AppStatus;
  createdAt: string;
  candidate: { id: string; name: string; email: string };
}
interface Detail {
  application: {
    id: string;
    status: AppStatus;
    coverLetter: string | null;
    resumeOriginalName: string;
    candidate: { name: string; email: string };
    history: HistoryEntry[];
    allowedTransitions: AppStatus[];
  };
}
interface Note { id: string; body: string; createdAt: string }

function ApplicantPanel({ id, onChanged }: { id: string; onChanged: () => void }) {
  const detail = useFetch<Detail>(`/applications/${id}`);
  const notes = useFetch<{ items: Note[] }>(`/applications/${id}/notes`);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);

  if (detail.loading && !detail.data) return <Spinner />;
  if (detail.error || !detail.data) return <ErrorBox message={detail.error ?? 'Not found'} />;
  const a = detail.data.application;

  async function move(status: AppStatus) {
    setErr('');
    setOk('');
    setBusy(true);
    try {
      await api(`/applications/${id}/status`, { method: 'PATCH', body: { status } });
      setOk(`Moved to ${STATUS_LABEL[status]}. The candidate has been notified.`);
      detail.reload();
      onChanged();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not update status');
      detail.reload();
    } finally {
      setBusy(false);
    }
  }

  async function addNote(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const body = String(new FormData(form).get('body') ?? '').trim();
    if (!body) return;
    try {
      await api(`/applications/${id}/notes`, { body: { body } });
      form.reset();
      notes.reload();
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : 'Could not save note');
    }
  }

  return (
    <div className="card space-y-5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-ink">{a.candidate.name}</h2>
          <a href={`mailto:${a.candidate.email}`} className="text-sm text-brand-700 hover:underline">{a.candidate.email}</a>
        </div>
        <StatusBadge status={a.status} />
      </div>

      {err && <ErrorBox message={err} />}
      {ok && <SuccessBox>{ok}</SuccessBox>}

      <div className="flex flex-wrap items-center gap-2">
        <a href={`/api/applications/${a.id}/resume`} className="btn-secondary" download>
          Download resume (PDF)
        </a>
      </div>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-slate-900">Move to</h3>
        {a.allowedTransitions.length === 0 ? (
          <p className="text-sm text-slate-500">This application is {STATUS_LABEL[a.status].toLowerCase()}; no further changes are possible.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {a.allowedTransitions.map((s) => (
              <button key={s} disabled={busy} onClick={() => move(s)} className={s === 'REJECTED' ? 'btn-danger' : 'btn-primary'}>
                {STATUS_LABEL[s]}
              </button>
            ))}
          </div>
        )}
      </section>

      {a.coverLetter && (
        <section>
          <h3 className="mb-1 text-sm font-semibold text-slate-900">Cover letter</h3>
          <p className="whitespace-pre-line text-sm text-slate-700">{a.coverLetter}</p>
        </section>
      )}

      <section>
        <h3 className="mb-3 text-sm font-semibold text-slate-900">Timeline</h3>
        <Timeline history={a.history} />
      </section>

      <section>
        <h3 className="text-sm font-semibold text-slate-900">Private notes</h3>
        <p className="mb-2 text-xs text-slate-500">Only you can see these. Candidates never do.</p>
        <form onSubmit={addNote} className="flex gap-2">
          <label htmlFor="note" className="sr-only">Add a note</label>
          <input id="note" name="body" maxLength={2000} placeholder="Add a note…" className="input" />
          <button className="btn-primary">Add</button>
        </form>
        <ul className="mt-3 space-y-2">
          {notes.data?.items.map((n) => (
            <li key={n.id} className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-slate-800">
              {n.body}
              <span className="mt-1 block text-xs text-slate-500">{formatDate(n.createdAt)}</span>
            </li>
          ))}
          {notes.data && notes.data.items.length === 0 && <li className="text-sm text-slate-500">No notes yet.</li>}
        </ul>
      </section>
    </div>
  );
}

export default function Applicants() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const page = Number(params.get('page') ?? 1) || 1;
  const status = params.get('status') ?? '';
  const [selected, setSelected] = useState<string | null>(null);

  const job = useFetch<{ job: Job }>(`/employer/jobs/${id}`);
  const list = useFetch<Paged<Row>>(`/employer/jobs/${id}/applications?page=${page}&pageSize=10${status ? `&status=${status}` : ''}`);

  const update = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setParams(next);
    setSelected(null);
  };

  return (
    <div>
      <Link to="/employer" className="text-sm text-brand-700 hover:underline">← Back to dashboard</Link>
      <h1 className="mt-2 text-2xl font-bold text-ink">{job.data?.job.title ?? 'Applicants'}</h1>
      {job.error && <div className="mt-4"><ErrorBox message={job.error} /></div>}

      <div className="mt-5 flex flex-wrap items-center gap-2" role="group" aria-label="Filter by status">
        {['', 'APPLIED', 'SHORTLISTED', 'INTERVIEW', 'HIRED', 'REJECTED'].map((s) => (
          <button key={s} aria-pressed={status === s} onClick={() => update({ status: s, page: '' })}
            className={`rounded-full px-3 py-1 text-sm font-medium ring-1 ring-inset ${status === s ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50'}`}>
            {s ? STATUS_LABEL[s as AppStatus] : 'All'}
          </button>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[340px_1fr]">
        <div>
          {list.loading && !list.data ? <Spinner /> : list.error ? <ErrorBox message={list.error} onRetry={list.reload} /> : list.data && list.data.items.length === 0 ? (
            <Empty title="No applicants here yet" />
          ) : (
            <>
              <ul className="space-y-2">
                {list.data?.items.map((r) => (
                  <li key={r.id}>
                    <button onClick={() => setSelected(r.id)} aria-current={selected === r.id}
                      className={`card w-full p-3 text-left transition hover:border-brand-600 ${selected === r.id ? 'border-brand-600 ring-2 ring-brand-600/20' : ''}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-medium text-ink">{r.candidate.name}</span>
                        <StatusBadge status={r.status} />
                      </div>
                      <span className="text-xs text-slate-500">Applied {formatDate(r.createdAt)}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {list.data && <Pagination page={list.data.page} totalPages={list.data.totalPages} onPage={(p) => update({ page: String(p) })} />}
            </>
          )}
        </div>
        <div>
          {selected ? (
            <ApplicantPanel key={selected} id={selected} onChanged={list.reload} />
          ) : (
            <Empty title="Select an applicant">Review their resume, move them through the pipeline and keep private notes.</Empty>
          )}
        </div>
      </div>
    </div>
  );
}
