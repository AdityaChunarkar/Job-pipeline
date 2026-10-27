import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError, TYPE_LABEL, formatDate, formatSalary, type AppStatus, type Job } from '../api';
import { api } from '../api';
import { useAuth } from '../auth';
import { useFetch } from '../hooks';
import { ErrorBox, Spinner, StatusBadge, SuccessBox } from '../components/ui';

const MAX_MB = 5; // mirrors the server default; the server remains the authority

export default function JobDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { data, error, loading, reload } = useFetch<{ job: Job; myApplication: { id: string; status: AppStatus } | null }>(`/jobs/${id}`);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  if (loading && !data) return <Spinner />;
  if (error || !data) return <ErrorBox message={error ?? 'Job not found'} />;
  const { job, myApplication } = data;

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const file = (form.elements.namedItem('resume') as HTMLInputElement).files?.[0];
    setErr('');
    if (!file) return setErr('Please attach your resume as a PDF.');
    if (!file.name.toLowerCase().endsWith('.pdf')) return setErr('Resume must be a PDF file.');
    if (file.size > MAX_MB * 1024 * 1024) return setErr(`Resume must be under ${MAX_MB} MB.`);
    const fd = new FormData();
    fd.append('resume', file);
    fd.append('coverLetter', String(new FormData(form).get('coverLetter') ?? ''));
    setBusy(true);
    try {
      await api(`/jobs/${job.id}/applications`, { form: fd });
      setDone(true);
      reload();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not reach the server');
      if (e instanceof ApiError && (e.code === 'ALREADY_APPLIED' || e.code === 'JOB_CLOSED')) reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <article className="card p-6">
        <Link to="/jobs" className="text-sm text-brand-700 hover:underline">← All jobs</Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-ink">{job.title}</h1>
            <p className="text-slate-600">{job.employer?.company ?? job.employer?.name}</p>
          </div>
          {job.status === 'CLOSED' && <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">Closed</span>}
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-4 border-y border-slate-100 py-4 text-sm sm:grid-cols-4">
          <div><dt className="text-slate-500">Location</dt><dd className="font-medium">{job.location}</dd></div>
          <div><dt className="text-slate-500">Type</dt><dd className="font-medium">{TYPE_LABEL[job.type]}</dd></div>
          <div className="col-span-2"><dt className="text-slate-500">Salary</dt><dd className="font-medium">{formatSalary(job.salaryMin, job.salaryMax)}</dd></div>
        </dl>
        <h2 className="mt-5 font-semibold text-ink">About the role</h2>
        <p className="mt-2 whitespace-pre-line text-slate-700">{job.description}</p>
        <p className="mt-6 text-xs text-slate-500">Posted {formatDate(job.createdAt)}</p>
      </article>

      <aside className="card h-fit p-6 lg:sticky lg:top-24">
        <h2 className="font-semibold text-ink">Apply for this role</h2>
        {!user ? (
          <p className="mt-3 text-sm text-slate-600">
            <Link to="/login" state={{ from: `/jobs/${job.id}` }} className="font-medium text-brand-700 hover:underline">Log in</Link> or{' '}
            <Link to="/register" className="font-medium text-brand-700 hover:underline">create a candidate account</Link> to apply.
          </p>
        ) : user.role === 'EMPLOYER' ? (
          <p className="mt-3 text-sm text-slate-600">Employer accounts cannot apply to jobs.</p>
        ) : myApplication ? (
          <div className="mt-3 space-y-3">
            {done && <SuccessBox>Application submitted. Good luck!</SuccessBox>}
            <p className="flex items-center gap-2 text-sm text-slate-700">You applied · <StatusBadge status={myApplication.status} /></p>
            <Link to="/applications" className="btn-secondary w-full">Track your application</Link>
          </div>
        ) : job.status === 'CLOSED' ? (
          <p className="mt-3 text-sm text-slate-600">This job is closed and no longer accepts applications.</p>
        ) : (
          <form onSubmit={submit} className="mt-4 space-y-4" noValidate>
            {err && <ErrorBox message={err} />}
            <div>
              <label htmlFor="resume" className="label">Resume (PDF, max {MAX_MB} MB)</label>
              <input id="resume" name="resume" type="file" accept="application/pdf,.pdf" required
                className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100" />
            </div>
            <div>
              <label htmlFor="coverLetter" className="label">Cover letter (optional)</label>
              <textarea id="coverLetter" name="coverLetter" rows={5} maxLength={5000} className="input" />
            </div>
            <button className="btn-primary w-full" disabled={busy}>{busy ? 'Submitting…' : 'Submit application'}</button>
          </form>
        )}
      </aside>
    </div>
  );
}
