import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError, type Role } from '../api';
import { useAuth } from '../auth';
import { ErrorBox, Field } from '../components/ui';

function useAfterAuth() {
  const navigate = useNavigate();
  const loc = useLocation();
  const from = (loc.state as { from?: string } | null)?.from;
  return (role: Role) => navigate(from ?? (role === 'EMPLOYER' ? '/employer' : '/jobs'), { replace: true });
}

export function Login() {
  const { login } = useAuth();
  const done = useAfterAuth();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError('');
    try {
      const u = await login(String(f.get('email')), String(f.get('password')));
      done(u.role);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reach the server');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-2xl font-bold text-ink">Welcome back</h1>
      <p className="mt-1 text-sm text-slate-600">
        New here? <Link to="/register" className="font-medium text-brand-700 hover:underline">Create an account</Link>
      </p>
      <form onSubmit={submit} className="card mt-6 space-y-4 p-6" noValidate>
        {error && <ErrorBox message={error} />}
        <Field label="Email" htmlFor="email">
          <input id="email" name="email" type="email" autoComplete="email" required className="input" />
        </Field>
        <Field label="Password" htmlFor="password">
          <input id="password" name="password" type="password" autoComplete="current-password" required className="input" />
        </Field>
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Signing in…' : 'Log in'}</button>
      </form>
      <p className="mt-4 text-center text-xs text-slate-500">Demo accounts are listed in the README.</p>
    </div>
  );
}

export function Register() {
  const { register } = useAuth();
  const done = useAfterAuth();
  const [params] = useSearchParams();
  const [role, setRole] = useState<Role>(params.get('role') === 'EMPLOYER' ? 'EMPLOYER' : 'CANDIDATE');
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError('');
    setFields({});
    try {
      const u = await register({
        name: f.get('name'),
        email: f.get('email'),
        password: f.get('password'),
        role,
        company: role === 'EMPLOYER' ? f.get('company') : undefined,
      });
      done(u.role);
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
    <div className="mx-auto max-w-md">
      <h1 className="text-2xl font-bold text-ink">Create your account</h1>
      <p className="mt-1 text-sm text-slate-600">
        Already registered? <Link to="/login" className="font-medium text-brand-700 hover:underline">Log in</Link>
      </p>
      <form onSubmit={submit} className="card mt-6 space-y-4 p-6" noValidate>
        {error && <ErrorBox message={error} />}
        <fieldset>
          <legend className="label">I am a…</legend>
          <div className="grid grid-cols-2 gap-2">
            {(['CANDIDATE', 'EMPLOYER'] as const).map((r) => (
              <label key={r} className={`cursor-pointer rounded-lg border px-3 py-2 text-center text-sm font-medium has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand-600 ${role === r ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-300 text-slate-700'}`}>
                <input type="radio" name="role" value={r} checked={role === r} onChange={() => setRole(r)} className="sr-only" />
                {r === 'CANDIDATE' ? 'Candidate' : 'Employer'}
              </label>
            ))}
          </div>
        </fieldset>
        <Field label="Full name" htmlFor="name" error={fields.name}>
          <input id="name" name="name" autoComplete="name" required className="input" aria-describedby="name-error" />
        </Field>
        {role === 'EMPLOYER' && (
          <Field label="Company" htmlFor="company" error={fields.company}>
            <input id="company" name="company" required className="input" />
          </Field>
        )}
        <Field label="Email" htmlFor="email" error={fields.email}>
          <input id="email" name="email" type="email" autoComplete="email" required className="input" aria-describedby="email-error" />
        </Field>
        <Field label="Password (min. 8 characters)" htmlFor="password" error={fields.password}>
          <input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} className="input" aria-describedby="password-error" />
        </Field>
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Creating account…' : 'Create account'}</button>
      </form>
    </div>
  );
}
