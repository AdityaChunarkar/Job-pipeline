import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';

function Bell() {
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = () =>
      api<{ unread: number }>('/notifications?pageSize=1')
        .then((r) => alive && setUnread(r.unread))
        .catch(() => undefined);
    load();
    const t = setInterval(load, 30000);
    window.addEventListener('notifications-changed', load);
    return () => {
      alive = false;
      clearInterval(t);
      window.removeEventListener('notifications-changed', load);
    };
  }, []);
  return (
    <NavLink to="/notifications" className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100" aria-label={`Notifications, ${unread} unread`}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" />
      </svg>
      {unread > 0 && (
        <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-semibold text-white">
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </NavLink>
  );
}

const navClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap ${isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100'}`;

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5">
          <Link to="/" className="flex items-center gap-2 text-lg font-bold text-ink">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-600 text-sm text-white">P</span>
            Pipeline
          </Link>
          <nav aria-label="Main" className="order-3 -mx-1 flex w-full gap-1 overflow-x-auto sm:order-none sm:mx-0 sm:w-auto sm:flex-1">
            <NavLink to="/jobs" className={navClass}>Browse jobs</NavLink>
            {user?.role === 'CANDIDATE' && <NavLink to="/applications" className={navClass}>My applications</NavLink>}
            {user?.role === 'EMPLOYER' && <NavLink to="/employer" end className={navClass}>Dashboard</NavLink>}
            {user?.role === 'EMPLOYER' && <NavLink to="/employer/jobs/new" className={navClass}>Post a job</NavLink>}
          </nav>
          <div className="ml-auto flex items-center gap-2 sm:ml-0">
            {user ? (
              <>
                <Bell />
                <span className="hidden text-sm text-slate-600 md:inline">{user.name}</span>
                <button
                  className="btn-secondary"
                  onClick={async () => {
                    await logout();
                    navigate('/');
                  }}
                >
                  Log out
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="btn-secondary">Log in</Link>
                <Link to="/register" className="btn-primary">Sign up</Link>
              </>
            )}
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <Outlet />
      </main>
      <footer className="border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-500">
        Pipeline demo application. Resumes are private and only visible to the hiring employer.
      </footer>
    </div>
  );
}
