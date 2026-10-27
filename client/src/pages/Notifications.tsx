import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, formatDate, type Paged } from '../api';
import { useAuth } from '../auth';
import { useFetch } from '../hooks';
import { Empty, ErrorBox, Pagination, Spinner } from '../components/ui';

interface N { id: string; message: string; readAt: string | null; createdAt: string; applicationId: string | null }

export default function Notifications() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const page = Number(params.get('page') ?? 1) || 1;
  const { data, error, loading, reload } = useFetch<Paged<N> & { unread: number }>(`/notifications?page=${page}&pageSize=15`);
  const [err, setErr] = useState('');

  async function mark(path: string) {
    setErr('');
    try {
      await api(path, { method: 'POST' });
      window.dispatchEvent(new Event('notifications-changed'));
      reload();
    } catch {
      setErr('Could not update notifications');
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink">Notifications</h1>
        {data && data.unread > 0 && <button className="btn-secondary" onClick={() => mark('/notifications/read-all')}>Mark all read</button>}
      </div>
      <div className="mt-6 space-y-3">
        {err && <ErrorBox message={err} />}
        {loading && !data ? <Spinner /> : error ? <ErrorBox message={error} onRetry={reload} /> : data && data.items.length === 0 ? (
          <Empty title="You're all caught up">Status updates will appear here.</Empty>
        ) : (
          <>
            <ul className="space-y-2">
              {data?.items.map((n) => (
                <li key={n.id} className={`card flex items-start justify-between gap-3 p-4 ${n.readAt ? '' : 'border-brand-600/40 bg-brand-50/50'}`}>
                  <div>
                    <p className="text-sm text-slate-900">{!n.readAt && <span className="mr-2 inline-block h-2 w-2 rounded-full bg-brand-600" aria-label="Unread" />}{n.message}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {formatDate(n.createdAt)}
                      {user?.role === 'CANDIDATE' && n.applicationId && <> · <Link to="/applications" className="text-brand-700 hover:underline">View application</Link></>}
                    </p>
                  </div>
                  {!n.readAt && <button className="shrink-0 text-xs font-medium text-brand-700 hover:underline" onClick={() => mark(`/notifications/${n.id}/read`)}>Mark read</button>}
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
