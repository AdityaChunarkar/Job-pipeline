import type { ReactNode } from 'react';
import { STATUS_LABEL, formatDate, type AppStatus, type HistoryEntry } from '../api';

const BADGE: Record<AppStatus, string> = {
  APPLIED: 'bg-slate-100 text-slate-700 ring-slate-200',
  SHORTLISTED: 'bg-sky-50 text-sky-700 ring-sky-200',
  INTERVIEW: 'bg-amber-50 text-amber-800 ring-amber-200',
  HIRED: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  REJECTED: 'bg-red-50 text-red-700 ring-red-200',
};

export function StatusBadge({ status }: { status: AppStatus }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${BADGE[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-3 py-16 text-sm text-slate-500">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600" />
      {label}…
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
      <span>{message}</span>
      {onRetry && (
        <button className="font-medium underline" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

export function SuccessBox({ children }: { children: ReactNode }) {
  return (
    <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
      {children}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="card border-dashed px-6 py-14 text-center">
      <p className="font-medium text-slate-900">{title}</p>
      {children && <div className="mt-2 text-sm text-slate-500">{children}</div>}
    </div>
  );
}

export function Pagination({ page, totalPages, onPage }: { page: number; totalPages: number; onPage: (p: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <nav aria-label="Pagination" className="mt-6 flex items-center justify-between">
      <button className="btn-secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        Previous
      </button>
      <span className="text-sm text-slate-600">
        Page {page} of {totalPages}
      </span>
      <button className="btn-secondary" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
        Next
      </button>
    </nav>
  );
}

export function Field({ label, error, children, htmlFor }: { label: string; error?: string; children: ReactNode; htmlFor: string }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="label">
        {label}
      </label>
      {children}
      {error && (
        <p id={`${htmlFor}-error`} className="field-error">
          {error}
        </p>
      )}
    </div>
  );
}

export function Timeline({ history }: { history: HistoryEntry[] }) {
  return (
    <ol className="relative space-y-4 border-l-2 border-slate-200 pl-5" aria-label="Status timeline">
      {history.map((h, i) => (
        <li key={h.id} className="relative">
          <span
            className={`absolute -left-[27px] top-1 h-3 w-3 rounded-full ring-4 ring-white ${
              i === history.length - 1 ? 'bg-brand-600' : 'bg-slate-300'
            }`}
          />
          <p className="text-sm font-medium text-slate-900">{STATUS_LABEL[h.toStatus]}</p>
          <p className="text-xs text-slate-500">{formatDate(h.createdAt)}</p>
        </li>
      ))}
    </ol>
  );
}
