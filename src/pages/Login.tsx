import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Lock, User, Loader2, ShieldCheck, UserCheck } from 'lucide-react';
import { authenticateReferee } from '../utils/supabaseStorage';

type Role = 'admin' | 'referee';

/**
 * Single sign-in page for tournament staff.
 * Admins sign in with the credentials from .env; referees with the account created in Dashboard → Referees.
 * /login?role=referee opens with the Referee tab selected.
 */
export default function Login() {
  const [params, setParams] = useSearchParams();
  const role: Role = params.get('role') === 'referee' ? 'referee' : 'admin';
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const switchRole = (next: Role) => {
    setParams(next === 'referee' ? { role: 'referee' } : {}, { replace: true });
    setError('');
    setPassword('');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (role === 'admin') {
        if (username === import.meta.env.VITE_ADMIN_USERNAME && password === import.meta.env.VITE_ADMIN_PASSWORD) {
          sessionStorage.setItem('isAuthenticated', 'true');
          navigate('/dashboard');
          return;
        }
      } else {
        const referee = await authenticateReferee(username, password);
        if (referee) {
          sessionStorage.setItem('refereeAuthenticated', 'true');
          sessionStorage.setItem('refereeId', referee.id);
          sessionStorage.setItem('refereeName', referee.name);
          sessionStorage.setItem('refereeCourtId', referee.courtId || '');
          navigate('/referee/panel');
          return;
        }
      }
      setError('Invalid username or password');
      setPassword('');
    } catch (err) {
      console.error('Login error:', err);
      setError('Could not sign in. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const tab = (value: Role, label: string, Icon: typeof ShieldCheck) => (
    <button
      type="button"
      onClick={() => switchRole(value)}
      aria-pressed={role === value}
      className={`flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition ${
        role === value ? 'bg-white text-slate-900 shadow' : 'text-slate-500 hover:text-slate-700'
      }`}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );

  const input =
    'block w-full pl-10 pr-3 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-indigo-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Brand (links home) */}
        <Link to="/" className="flex flex-col items-center text-center mb-6 group" aria-label="Go to home page">
          <span className="w-14 h-14 rounded-2xl bg-lime-300 text-slate-900 flex items-center justify-center shadow-lg group-hover:scale-105 group-active:scale-95 transition">
            <svg viewBox="0 0 64 64" className="w-9 h-9" fill="none" aria-hidden="true">
              <path d="M22 6 L32 34 L42 6" stroke="currentColor" strokeWidth="3.5" strokeLinejoin="round" />
              <path d="M32 6 V34" stroke="currentColor" strokeWidth="3.5" />
              <circle cx="32" cy="44" r="12" fill="currentColor" />
            </svg>
          </span>
          <span className="mt-3 text-white text-xl font-black tracking-tight">Cubet Badminton Tournament</span>
          <span className="text-lime-300 text-xs font-bold uppercase tracking-widest">Season 2</span>
        </Link>

        <div className="bg-white rounded-2xl shadow-2xl p-6 sm:p-8">
          <h1 className="text-2xl font-bold text-slate-900">Staff sign in</h1>
          <p className="text-sm text-slate-500 mb-5">For tournament admins and referees.</p>

          <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-xl mb-6" role="group" aria-label="Sign in as">
            {tab('admin', 'Admin', ShieldCheck)}
            {tab('referee', 'Referee', UserCheck)}
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">{error}</div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-slate-700 mb-1.5">
                Username
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 pointer-events-none" />
                <input
                  id="username"
                  type="text"
                  autoComplete="username"
                  autoCapitalize="none"
                  required
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  className={input}
                  placeholder={role === 'admin' ? 'Admin username' : 'Referee username'}
                  disabled={loading}
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 pointer-events-none" />
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className={input}
                  placeholder="Password"
                  disabled={loading}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 text-white py-3.5 rounded-xl font-semibold hover:bg-indigo-700 transition shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-5 h-5 animate-spin" />}
              {loading ? 'Signing in…' : `Sign in as ${role === 'admin' ? 'Admin' : 'Referee'}`}
            </button>
          </form>

          {role === 'referee' && (
            <p className="mt-4 text-xs text-slate-500 text-center">Referee accounts are created by the admin.</p>
          )}
        </div>

        <p className="mt-6 text-center">
          <Link to="/" className="text-sm text-indigo-200 hover:text-white">← Back to tournament home</Link>
        </p>
      </div>
    </div>
  );
}
