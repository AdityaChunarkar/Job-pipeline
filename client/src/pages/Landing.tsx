import { Link } from 'react-router-dom';
import { useAuth } from '../auth';

const steps = ['Applied', 'Shortlisted', 'Interview', 'Hired'];

export default function Landing() {
  const { user } = useAuth();
  return (
    <div className="space-y-16">
      <section className="grid items-center gap-10 py-6 lg:grid-cols-2">
        <div>
          <p className="mb-3 inline-block rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">Job board + hiring pipeline</p>
          <h1 className="text-4xl font-bold tracking-tight text-ink sm:text-5xl">Hire better. Get hired with clarity.</h1>
          <p className="mt-4 max-w-xl text-lg text-slate-600">
            Employers post roles and move applicants through a clear pipeline. Candidates apply once and always know where they stand.
          </p>
          {user ? (
            <div className="mt-8">
              <Link to={user.role === 'EMPLOYER' ? '/employer' : '/applications'} className="btn-primary px-5 py-2.5">
                Go to your dashboard
              </Link>
            </div>
          ) : (
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              <Link to="/jobs" className="card group p-5 transition hover:border-brand-600">
                <p className="font-semibold text-ink">I&apos;m looking for a job</p>
                <p className="mt-1 text-sm text-slate-600">Search open roles and apply with your resume.</p>
                <span className="mt-3 inline-block text-sm font-medium text-brand-700 group-hover:underline">Browse jobs →</span>
              </Link>
              <Link to="/register?role=EMPLOYER" className="card group p-5 transition hover:border-brand-600">
                <p className="font-semibold text-ink">I&apos;m hiring</p>
                <p className="mt-1 text-sm text-slate-600">Post jobs and manage applicants in one place.</p>
                <span className="mt-3 inline-block text-sm font-medium text-brand-700 group-hover:underline">Post a job →</span>
              </Link>
            </div>
          )}
        </div>
        <div className="card p-6" aria-hidden="true">
          <p className="mb-4 text-sm font-medium text-slate-500">Application pipeline</p>
          <div className="space-y-3">
            {steps.map((s, i) => (
              <div key={s} className="flex items-center gap-3">
                <span className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ${i < 3 ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500'}`}>{i + 1}</span>
                <div className="h-2 flex-1 rounded-full bg-slate-100">
                  <div className="h-2 rounded-full bg-brand-600" style={{ width: `${(i < 3 ? 100 : 30)}%` }} />
                </div>
                <span className="w-24 text-sm text-slate-700">{s}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {[
          ['Private resumes', 'PDFs are validated and stored privately. Only the employer who owns the job can open them.'],
          ['Live status tracking', 'Candidates see a timeline and get a notification every time their application moves.'],
          ['Structured pipeline', 'Applied → Shortlisted → Interview → Hired, with private notes for your hiring team.'],
        ].map(([t, d]) => (
          <div key={t} className="card p-5">
            <h2 className="font-semibold text-ink">{t}</h2>
            <p className="mt-1 text-sm text-slate-600">{d}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
