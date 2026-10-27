import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError, TYPE_LABEL, api, type Job, type JobType } from '../api';
import { useFetch } from '../hooks';
import { ErrorBox, Field, Spinner } from '../components/ui';

export default function JobForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const existing = useFetch<{ job: Job }>(id ? `/employer/jobs/${id}` : null);
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  if (id && existing.loading) return <Spinner />;
  if (id && existing.error) return <ErrorBox message={existing.error} />;
  const job = existing.data?.job;

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const num = (k: string) => (f.get(k) ? Number(f.get(k)) : null);
    setBusy(true);
    setError('');
    setFields({});
    try {
      await api(id ? `/employer/jobs/${id}` : '/employer/jobs', {
        method: id ? 'PUT' : 'POST',
        body: {
          title: f.get('title'),
          location: f.get('location'),
          type: f.get('type'),
          salaryMin: num('salaryMin'),
          salaryMax: num('salaryMax'),
          description: f.get('description'),
        },
      });
      navigate('/employer');
    } catch (err) {
      if (err instanceof ApiError) {
        setFields(err.fields);
        setError(Object.keys(err.fields).length ? 'Please fix the highlighted fields.' : err.message);
      } else setError('Could not reach the server');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Link to="/employer" className="text-sm text-brand-700 hover:underline">← Back to dashboard</Link>
      <h1 className="mt-2 text-2xl font-bold text-ink">{id ? 'Edit job' : 'Post a job'}</h1>
      <form onSubmit={submit} className="card mt-6 space-y-4 p-6" noValidate>
        {error && <ErrorBox message={error} />}
        <Field label="Job title" htmlFor="title" error={fields.title}>
          <input id="title" name="title" required defaultValue={job?.title} className="input" aria-describedby="title-error" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Location" htmlFor="location" error={fields.location}>
            <input id="location" name="location" required defaultValue={job?.location} placeholder="City or Remote" className="input" aria-describedby="location-error" />
          </Field>
          <Field label="Job type" htmlFor="type" error={fields.type}>
            <select id="type" name="type" defaultValue={job?.type ?? 'FULL_TIME'} className="input">
              {(Object.keys(TYPE_LABEL) as JobType[]).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
            </select>
          </Field>
          <Field label="Minimum salary (₹ / year)" htmlFor="salaryMin" error={fields.salaryMin}>
            <input id="salaryMin" name="salaryMin" type="number" min={0} defaultValue={job?.salaryMin ?? ''} className="input" />
          </Field>
          <Field label="Maximum salary (₹ / year)" htmlFor="salaryMax" error={fields.salaryMax}>
            <input id="salaryMax" name="salaryMax" type="number" min={0} defaultValue={job?.salaryMax ?? ''} className="input" aria-describedby="salaryMax-error" />
          </Field>
        </div>
        <Field label="Description" htmlFor="description" error={fields.description}>
          <textarea id="description" name="description" rows={8} required defaultValue={job?.description} className="input" aria-describedby="description-error" />
        </Field>
        <div className="flex justify-end gap-2">
          <Link to="/employer" className="btn-secondary">Cancel</Link>
          <button className="btn-primary" disabled={busy}>{busy ? 'Saving…' : id ? 'Save changes' : 'Publish job'}</button>
        </div>
      </form>
    </div>
  );
}
