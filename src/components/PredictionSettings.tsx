import React, { useCallback, useEffect, useState } from 'react';
import { Crown, KeyRound, Loader2, Lock, Mail, Unlock, Users } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { confirmDialog, notify } from './Dialog';

/** "2026-11-11T20:00" in the admin's own time zone, for <input type="datetime-local">. */
const toLocalInput = (date: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const formatTime = (date: Date) =>
  date.toLocaleString('en-US', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

const errorText = (message: string) =>
  message.includes('not set up')
    ? 'The reset password is not set up in the database yet. Run the one-time setup in Supabase first.'
    : message.includes('Incorrect reset password')
      ? 'Incorrect reset password.'
      : message.includes('at least one')
        ? 'Turn on at least one sign-in method.'
        : 'Could not save. Check your connection and try again.';

const Toggle: React.FC<{ on: boolean; onChange: (on: boolean) => void; label: string; hint: string; icon: React.ReactNode }> = ({
  on,
  onChange,
  label,
  hint,
  icon
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={on}
    onClick={() => onChange(!on)}
    className={`w-full flex items-center gap-3 rounded-xl p-3 text-left ring-1 transition ${on ? 'ring-blue-300 bg-blue-50' : 'ring-gray-200 bg-white'}`}
  >
    <span className="w-9 h-9 rounded-lg bg-white ring-1 ring-gray-200 flex items-center justify-center flex-shrink-0">{icon}</span>
    <span className="flex-1 min-w-0">
      <span className="block font-semibold text-gray-800">{label}</span>
      <span className="block text-xs text-gray-500">{hint}</span>
    </span>
    <span className={`relative w-11 h-6 rounded-full flex-shrink-0 transition ${on ? 'bg-blue-600' : 'bg-gray-300'}`}>
      <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
    </span>
  </button>
);

/**
 * Admin: when audience predictions close and how people sign in.
 * Saving needs the reset password (checked in the database).
 */
export const PredictionSettings: React.FC = () => {
  const [deadline, setDeadline] = useState<Date | null>(null);
  const [value, setValue] = useState('');
  const [logins, setLogins] = useState({ google: true, email: false });
  const [savedLogins, setSavedLogins] = useState({ google: true, email: false });
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<'save' | 'close' | 'logins' | null>(null);
  const [error, setError] = useState('');
  const [stats, setStats] = useState({ people: 0, picks: 0 });
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    const [{ data }, { data: rows }] = await Promise.all([
      supabase.from('prediction_settings').select('deadline, google_login, email_login').eq('id', 1).maybeSingle(),
      supabase.from('predictions').select('user_id')
    ]);
    if (data?.deadline) {
      const d = new Date(data.deadline);
      setDeadline(d);
      setValue(toLocalInput(d));
      const l = { google: data.google_login, email: data.email_login };
      setLogins(l);
      setSavedLogins(l);
    }
    if (rows) setStats({ people: new Set(rows.map(r => r.user_id)).size, picks: rows.length });
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(timer);
  }, [load]);

  const needPassword = () => {
    setError('');
    if (password) return true;
    setError('Enter the reset password to make changes.');
    return false;
  };

  const saveDeadline = async (next: Date, kind: 'save' | 'close') => {
    if (!needPassword()) return;
    setBusy(kind);
    const { error: rpcError } = await supabase.rpc('set_prediction_deadline', { p_password: password, p_deadline: next.toISOString() });
    setBusy(null);
    if (rpcError) return setError(errorText(rpcError.message));
    setDeadline(next);
    setValue(toLocalInput(next));
    notify(kind === 'close' ? 'Nobody can make or change picks now.' : `Picks close ${formatTime(next)}.`, {
      tone: 'success',
      title: kind === 'close' ? 'Predictions closed' : 'Close time saved'
    });
  };

  const saveLogins = async () => {
    if (!needPassword()) return;
    if (!logins.google && !logins.email) return setError('Turn on at least one sign-in method.');
    setBusy('logins');
    const { error: rpcError } = await supabase.rpc('set_prediction_login_methods', {
      p_password: password,
      p_google: logins.google,
      p_email: logins.email
    });
    setBusy(null);
    if (rpcError) return setError(errorText(rpcError.message));
    setSavedLogins(logins);
    notify('People will see the new sign-in options straight away.', { tone: 'success', title: 'Sign-in options saved' });
  };

  const closeNow = async () => {
    const ok = await confirmDialog({
      title: 'Close predictions now?',
      message: 'Nobody will be able to make or change picks. You can open them again by setting a later time.',
      confirmText: 'Close now',
      tone: 'danger'
    });
    if (ok) saveDeadline(new Date(), 'close');
  };

  const open = deadline ? now < deadline.getTime() : false;
  const loginsChanged = logins.google !== savedLogins.google || logins.email !== savedLogins.email;
  const input = 'w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500';
  const section = 'rounded-xl ring-1 ring-gray-200 p-4 space-y-3';

  return (
    <div className="bg-white rounded-lg shadow-md p-4 sm:p-6 space-y-5">
      <h2 className="text-lg sm:text-2xl font-bold text-gray-800 flex items-center gap-2">
        <Crown className="w-5 h-5 sm:w-6 sm:h-6" />
        Predictions
      </h2>

      {/* Status */}
      <div className={`rounded-xl p-4 flex items-start gap-3 ${open ? 'bg-green-50 ring-1 ring-green-200' : 'bg-gray-100 ring-1 ring-gray-200'}`}>
        {open ? <Unlock className="w-6 h-6 text-green-700 flex-shrink-0" /> : <Lock className="w-6 h-6 text-gray-600 flex-shrink-0" />}
        <div className="min-w-0">
          <div className={`font-bold ${open ? 'text-green-800' : 'text-gray-800'}`}>{open ? 'Open' : 'Closed'}</div>
          <div className="text-sm text-gray-600">
            {!deadline ? 'Loading…' : open ? `Picks close ${formatTime(deadline)}.` : `Picks closed ${formatTime(deadline)}.`}
          </div>
          <div className="mt-1 text-sm text-gray-600 flex items-center gap-1.5">
            <Users className="w-4 h-4" /> {stats.people} {stats.people === 1 ? 'person has' : 'people have'} made {stats.picks}{' '}
            {stats.picks === 1 ? 'pick' : 'picks'}
          </div>
        </div>
      </div>

      {/* Password used by every change below */}
      <div>
        <label htmlFor="prediction-password" className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1.5">
          <KeyRound className="w-4 h-4" /> Reset password <span className="font-normal text-gray-500">(needed to save changes)</span>
        </label>
        <input
          id="prediction-password"
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          autoComplete="current-password"
          className={input}
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* Close time */}
      <form
        onSubmit={e => {
          e.preventDefault();
          if (!value) return setError('Pick a close time.');
          saveDeadline(new Date(value), 'save');
        }}
        className={section}
      >
        <h3 className="font-semibold text-gray-800">Close time</h3>
        <div>
          <label htmlFor="prediction-close" className="block text-sm text-gray-600 mb-1.5">
            Close picks at
          </label>
          <input id="prediction-close" type="datetime-local" value={value} onChange={e => setValue(e.target.value)} className={input} />
          <p className="mt-1 text-xs text-gray-500">Set a later time to open picks again.</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            type="submit"
            disabled={!!busy}
            className="flex items-center justify-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-lg font-semibold hover:bg-blue-700 transition disabled:opacity-50"
          >
            {busy === 'save' && <Loader2 className="w-4 h-4 animate-spin" />}
            Save close time
          </button>
          {open && (
            <button
              type="button"
              onClick={closeNow}
              disabled={!!busy}
              className="flex items-center justify-center gap-2 bg-red-600 text-white px-5 py-2.5 rounded-lg font-semibold hover:bg-red-700 transition disabled:opacity-50"
            >
              {busy === 'close' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
              Close now
            </button>
          )}
        </div>
      </form>

      {/* Sign-in methods */}
      <div className={section}>
        <h3 className="font-semibold text-gray-800">How people sign in</h3>
        <Toggle
          on={logins.google}
          onChange={google => setLogins(l => ({ ...l, google }))}
          label="Google"
          hint="Any Google account"
          icon={<span className="font-black text-blue-600">G</span>}
        />
        <Toggle
          on={logins.email}
          onChange={email => setLogins(l => ({ ...l, email }))}
          label="Cubet email"
          hint="@cubettech.com only, with a code sent by email"
          icon={<Mail className="w-5 h-5 text-gray-700" />}
        />
        <button
          type="button"
          onClick={saveLogins}
          disabled={!!busy || !loginsChanged}
          className="w-full sm:w-auto flex items-center justify-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-lg font-semibold hover:bg-blue-700 transition disabled:opacity-50"
        >
          {busy === 'logins' && <Loader2 className="w-4 h-4 animate-spin" />}
          Save sign-in options
        </button>
      </div>
    </div>
  );
};
