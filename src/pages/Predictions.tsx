import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { ArrowLeft, Check, ClipboardPaste, Crown, Loader2, Lock, LogOut, Mail, Medal, Sparkles, Timer, Trophy, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useTournamentStore } from '../store/tournamentStore';
import { getKnockout, sortByName, sortGroups } from '../utils/calculations';
import type { Group, Team } from '../types';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { notifyError } from '../components/Dialog';
import { usePredictionSettings } from '../hooks/usePredictionSettings';

/** Points for each correct group-winner pick. */
export const POINTS_PER_PICK = 10;

interface Prediction {
  user_id: string;
  group_id: string;
  team_id: string;
  user_name: string;
  user_avatar: string | null;
  updated_at: string;
}

interface LeaderRow {
  userId: string;
  name: string;
  avatar: string | null;
  points: number;
  correct: number;
  picks: number;
  lastPick: string;
  rank: number;
}

type Tab = 'picks' | 'leaderboard';

/* ---------------------------------------------------------------------------------------------
 * Data hooks
 * -------------------------------------------------------------------------------------------*/

const useSession = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);
  return { session, ready };
};


const usePredictions = () => {
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loaded, setLoaded] = useState(false);
  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('predictions')
      .select('user_id, group_id, team_id, user_name, user_avatar, updated_at');
    if (!error && data) setPredictions(data as Prediction[]);
    setLoaded(true);
  }, []);
  useEffect(() => {
    load();
    const channel = supabase
      .channel('predictions-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'predictions' }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);
  return { predictions, setPredictions, loaded };
};

/* ---------------------------------------------------------------------------------------------
 * Helpers
 * -------------------------------------------------------------------------------------------*/

const displayName = (session: Session) => {
  const meta = session.user.user_metadata ?? {};
  return (meta.full_name || meta.name || 'Player') as string;
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase())
    .join('') || '?';

const Avatar: React.FC<{ name: string; src?: string | null; size?: string }> = ({ name, src, size = 'w-9 h-9' }) =>
  src ? (
    <img src={src} alt="" referrerPolicy="no-referrer" className={`${size} rounded-full object-cover flex-shrink-0 bg-slate-200`} />
  ) : (
    <span className={`${size} rounded-full flex-shrink-0 bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center`}>
      {initials(name)}
    </span>
  );

const countdown = (ms: number) => {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m ${String(s).padStart(2, '0')}s`;
};

const GoogleIcon = () => (
  <svg viewBox="0 0 48 48" className="w-5 h-5" aria-hidden="true">
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
  </svg>
);

/* ---------------------------------------------------------------------------------------------
 * Group card: pick one team
 * -------------------------------------------------------------------------------------------*/

const GroupPicker: React.FC<{
  group: Group;
  teams: Team[];
  myPick?: string;
  winnerId?: string;
  pickCounts: Record<string, number>;
  totalPicks: number;
  locked: boolean;
  savingTeam?: string;
  onPick: (teamId: string) => void;
}> = ({ group, teams, myPick, winnerId, pickCounts, totalPicks, locked, savingTeam, onPick }) => {
  const result = winnerId && myPick ? (winnerId === myPick ? 'right' : 'wrong') : null;
  return (
    <section id={`pick-group-${group.id}`} className="scroll-mt-20 rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-100">
        <h2 className="font-black text-slate-900">{group.name}</h2>
        {result === 'right' && (
          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 text-green-800 text-xs font-bold px-2.5 py-1">
            <Check className="w-3.5 h-3.5" /> +{POINTS_PER_PICK}
          </span>
        )}
        {result === 'wrong' && (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 text-red-700 text-xs font-bold px-2.5 py-1">
            <X className="w-3.5 h-3.5" /> 0
          </span>
        )}
        {!result && winnerId && <span className="text-xs font-semibold text-slate-500">Final played</span>}
        {!result && !winnerId && myPick && <span className="text-xs font-semibold text-indigo-600">Picked</span>}
      </div>
      <ul className="p-2 grid gap-1.5">
        {teams.map(team => {
          const picked = myPick === team.id;
          const won = winnerId === team.id;
          const share = totalPicks > 0 ? Math.round(((pickCounts[team.id] ?? 0) / totalPicks) * 100) : 0;
          return (
            <li key={team.id}>
              <button
                type="button"
                disabled={locked || !!savingTeam}
                onClick={() => onPick(team.id)}
                aria-pressed={picked}
                className={`relative w-full overflow-hidden rounded-xl px-3 py-2.5 text-left flex items-center gap-3 transition ring-1 ${
                  picked ? 'ring-2 ring-indigo-600 bg-indigo-50' : 'ring-slate-200 bg-white'
                } ${locked ? 'cursor-default' : 'hover:ring-indigo-300 active:scale-[0.99]'}`}
              >
                {/* how many people picked this team */}
                <span
                  className={`absolute inset-y-0 left-0 ${picked ? 'bg-indigo-100' : 'bg-slate-100'}`}
                  style={{ width: `${share}%` }}
                  aria-hidden="true"
                />
                <span
                  className={`relative w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center ${
                    picked ? 'bg-indigo-600 text-white' : 'ring-2 ring-slate-300 bg-white'
                  }`}
                >
                  {savingTeam === team.id ? <Loader2 className="w-3 h-3 animate-spin" /> : picked && <Check className="w-3 h-3" />}
                </span>
                <span className={`relative flex-1 min-w-0 text-sm ${picked ? 'font-bold text-slate-900' : 'font-medium text-slate-700'}`}>
                  {team.name}
                </span>
                {won && (
                  <span className="relative inline-flex items-center gap-1 text-xs font-bold text-amber-700">
                    <Trophy className="w-4 h-4" /> Winner
                  </span>
                )}
                <span className="relative w-10 text-right text-xs tabular-nums text-slate-500">{share}%</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

/* ---------------------------------------------------------------------------------------------
 * Cubet email sign-in: email -> 6-digit code (sent by the prediction-email-otp Edge Function)
 * -------------------------------------------------------------------------------------------*/

const CUBET_EMAIL = /^[a-z0-9._%+-]+@cubettech\.com$/i;

/** Calls the Edge Function; returns its JSON, or throws with its friendly error message. */
const otpRequest = async (body: Record<string, string>) => {
  const { data, error } = await supabase.functions.invoke('prediction-email-otp', { body });
  if (error) {
    let message = 'Something went wrong. Please try again.';
    try {
      const details = await (error as { context?: Response }).context?.json();
      if (details?.error) message = details.error;
    } catch {
      /* not JSON */
    }
    throw new Error(message);
  }
  return data as { ok?: boolean; token_hash?: string; expires_at?: string; same_code?: boolean };
};

const EmailOtpSignIn: React.FC = () => {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [resendIn, setResendIn] = useState(0);
  const [notice, setNotice] = useState('');
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [, setTick] = useState(0);

  // Keep the "works for N minutes" line current
  useEffect(() => {
    if (step !== 'code') return;
    const t = setInterval(() => setTick(x => x + 1), 10_000);
    return () => clearInterval(t);
  }, [step]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const sendCode = async () => {
    const clean = email.trim().toLowerCase();
    setError('');
    if (!CUBET_EMAIL.test(clean)) {
      setError('Please use your Cubet email (name@cubettech.com).');
      return;
    }
    setBusy(true);
    try {
      const result = await otpRequest({ action: 'send', email: clean });
      const resend = step === 'code' && clean === email;
      setEmail(clean);
      if (!resend) setCode('');
      setStep('code');
      setResendIn(60);
      setExpiresAt(result.expires_at ? new Date(result.expires_at).getTime() : null);
      setNotice(
        !resend ? '' : result.same_code ? 'Sent again. It is the same code as before.' : 'Your old code expired, so we sent a new one.'
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async (value = code) => {
    setError('');
    if (value.length !== 6) {
      setError('Enter the 6-digit code from the email.');
      return;
    }
    setBusy(true);
    try {
      const { token_hash } = await otpRequest({ action: 'verify', email, code: value });
      if (!token_hash) throw new Error('Something went wrong. Please try again.');
      const { error: authError } = await supabase.auth.verifyOtp({ token_hash, type: 'magiclink' });
      if (authError) throw new Error('Could not sign you in. Please ask for a new code.');
      // onAuthStateChange picks up the new session
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  const enterCode = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 6);
    setCode(digits);
    if (digits.length === 6 && !busy) verifyCode(digits); // sign in as soon as the whole code is in
  };

  const pasteCode = async () => {
    try {
      enterCode(await navigator.clipboard.readText());
    } catch {
      setError('Could not paste. Long-press the box and choose Paste.');
    }
  };

  const minutesLeft = expiresAt ? Math.max(0, Math.ceil((expiresAt - Date.now()) / 60_000)) : 10;

  const field =
    'w-full rounded-xl ring-1 ring-slate-300 px-4 py-3 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500';
  const button =
    'inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 font-bold text-white shadow-sm hover:bg-indigo-700 active:scale-[0.98] transition disabled:opacity-60';

  return step === 'email' ? (
    <form
      onSubmit={e => {
        e.preventDefault();
        sendCode();
      }}
      className="space-y-2.5 text-left"
    >
      <label htmlFor="cubet-email" className="block text-sm font-semibold text-slate-700">
        Cubet email
      </label>
      <input
        id="cubet-email"
        type="email"
        inputMode="email"
        autoComplete="email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        placeholder="name@cubettech.com"
        className={field}
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={busy} className={button}>
        {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Mail className="w-5 h-5" />}
        Send code
      </button>
    </form>
  ) : (
    <form
      onSubmit={e => {
        e.preventDefault();
        verifyCode();
      }}
      className="space-y-2.5 text-left"
    >
      <p className="text-sm text-slate-600">
        We sent a 6-digit code to <b className="text-slate-900 break-all">{email}</b>.{' '}
        {minutesLeft === 0 ? (
          <b className="text-red-600">This code has expired. Tap Resend code to get a new one.</b>
        ) : (
          `It works for ${minutesLeft === 1 ? '1 more minute' : `${minutesLeft} more minutes`}.`
        )}
      </p>
      <p className="rounded-lg bg-amber-50 ring-1 ring-amber-200 px-3 py-2 text-xs text-amber-900">
        Can't find it? Check your <b>Spam</b> or <b>Junk</b> folder. It can take a couple of minutes to arrive.
      </p>
      {notice && <p className="text-sm text-green-700">{notice}</p>}
      <div className="flex items-end justify-between gap-2">
        <label htmlFor="cubet-code" className="block text-sm font-semibold text-slate-700">
          Code
        </label>
        <button
          type="button"
          onClick={pasteCode}
          className="inline-flex items-center gap-1 text-sm font-semibold text-indigo-600 hover:text-indigo-800"
        >
          <ClipboardPaste className="w-4 h-4" /> Paste
        </button>
      </div>
      <input
        id="cubet-code"
        inputMode="numeric"
        autoComplete="one-time-code"
        value={code}
        onChange={e => enterCode(e.target.value)}
        placeholder="000000"
        className={`${field} text-center text-2xl font-black tracking-[0.5em] tabular-nums`}
        autoFocus
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={busy} className={button}>
        {busy && <Loader2 className="w-5 h-5 animate-spin" />}
        Verify and sign in
      </button>
      <div className="flex items-center justify-between text-sm pt-1">
        <button
          type="button"
          onClick={() => {
            setStep('email');
            setError('');
            setNotice('');
          }}
          className="font-semibold text-slate-500 hover:text-slate-800"
        >
          Change email
        </button>
        <button
          type="button"
          onClick={sendCode}
          disabled={busy || resendIn > 0}
          className="font-semibold text-indigo-600 hover:text-indigo-800 disabled:text-slate-400"
        >
          {resendIn > 0 ? `Resend code in 0:${String(resendIn).padStart(2, '0')}` : 'Resend code'}
        </button>
      </div>
    </form>
  );
};

/* ---------------------------------------------------------------------------------------------
 * Page
 * -------------------------------------------------------------------------------------------*/

export const Predictions: React.FC = () => {
  const { groups, teams, matches, isLoading, isInitialized } = useTournamentStore();
  const { session, ready } = useSession();
  const { deadline, logins, closed, msLeft } = usePredictionSettings();
  const { predictions, setPredictions, loaded } = usePredictions();
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'leaderboard' ? 'leaderboard' : 'picks';
  const [saving, setSaving] = useState<{ groupId: string; teamId: string } | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  const sortedGroups = useMemo(() => sortGroups(groups), [groups]);
  const userId = session?.user.id;

  /** Group id -> winning team id, once the group's final is complete. */
  const winners = useMemo(() => {
    const map: Record<string, string> = {};
    for (const g of groups) {
      const final = getKnockout(matches, g.id).final;
      if (final?.status === 'completed' && final.winner) map[g.id] = final.winner.id;
    }
    return map;
  }, [groups, matches]);

  const myPicks = useMemo(() => {
    const map: Record<string, string> = {};
    predictions.filter(p => p.user_id === userId).forEach(p => (map[p.group_id] = p.team_id));
    return map;
  }, [predictions, userId]);

  const pickCounts = useMemo(() => {
    const byGroup: Record<string, Record<string, number>> = {};
    const totals: Record<string, number> = {};
    for (const p of predictions) {
      byGroup[p.group_id] ??= {};
      byGroup[p.group_id][p.team_id] = (byGroup[p.group_id][p.team_id] ?? 0) + 1;
      totals[p.group_id] = (totals[p.group_id] ?? 0) + 1;
    }
    return { byGroup, totals };
  }, [predictions]);

  const leaderboard = useMemo<LeaderRow[]>(() => {
    const rows = new Map<string, LeaderRow>();
    for (const p of predictions) {
      const row = rows.get(p.user_id) ?? {
        userId: p.user_id,
        name: p.user_name || 'Player',
        avatar: p.user_avatar,
        points: 0,
        correct: 0,
        picks: 0,
        lastPick: p.updated_at,
        rank: 0
      };
      row.picks += 1;
      if (winners[p.group_id] === p.team_id) {
        row.correct += 1;
        row.points += POINTS_PER_PICK;
      }
      if (p.updated_at > row.lastPick) row.lastPick = p.updated_at;
      rows.set(p.user_id, row);
    }
    // Most points first; on equal points, whoever made their final pick earlier goes higher
    const sorted = [...rows.values()].sort((a, b) => b.points - a.points || a.lastPick.localeCompare(b.lastPick));
    sorted.forEach((row, i) => (row.rank = i + 1));
    return sorted;
  }, [predictions, winners]);

  const setTab = (next: Tab) => {
    const p = new URLSearchParams(params);
    if (next === 'picks') p.delete('tab');
    else p.set('tab', next);
    setParams(p, { replace: true });
  };

  const signIn = async () => {
    setSigningIn(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/predict`, queryParams: { prompt: 'select_account' } }
    });
    if (error) {
      setSigningIn(false);
      notifyError(error, 'Could not open Google sign-in. Please try again.');
    }
  };

  const pick = async (groupId: string, teamId: string) => {
    if (!session || closed || myPicks[groupId] === teamId) return;
    const meta = session.user.user_metadata ?? {};
    const row: Prediction = {
      user_id: session.user.id,
      group_id: groupId,
      team_id: teamId,
      user_name: displayName(session),
      user_avatar: (meta.avatar_url || meta.picture || null) as string | null,
      updated_at: new Date().toISOString()
    };
    const previous = predictions;
    // Show the pick straight away; roll back if the save fails
    setPredictions(list => [...list.filter(p => !(p.user_id === row.user_id && p.group_id === groupId)), row]);
    setSaving({ groupId, teamId });
    // First pick in a group: glide to the next group. Changing a pick later never scrolls.
    if (!myPicks[groupId]) {
      const next = sortedGroups[sortedGroups.findIndex(g => g.id === groupId) + 1];
      if (next) {
        const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        setTimeout(
          () => document.getElementById(`pick-group-${next.id}`)?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' }),
          300
        );
      }
    }
    const { updated_at: _ignored, ...payload } = row;
    const { error } = await supabase.from('predictions').upsert(payload, { onConflict: 'user_id,group_id' });
    setSaving(null);
    if (error) {
      setPredictions(previous);
      notifyError(
        error,
        Date.now() >= deadline.getTime() ? 'Predictions are closed.' : 'Could not save your pick. Please try again.'
      );
    }
  };

  if ((isLoading && !isInitialized) || !ready) {
    return <LoadingSpinner fullScreen size="xl" text="Loading predictions..." />;
  }

  const pickedCount = sortedGroups.filter(g => myPicks[g.id]).length;
  const provider = session?.user.app_metadata?.provider;
  const methodOff = !!session && logins.loaded && ((provider === 'google' && !logins.google) || (provider === 'email' && !logins.email));
  const me = leaderboard.find(r => r.userId === userId);
  const time = deadline.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const deadlineText =
    deadline.toDateString() === new Date().toDateString()
      ? `today at ${time}`
      : `${deadline.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })}, ${time}`;
  const anyFinalDone = Object.keys(winners).length > 0;
  const tabClass = 'flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-bold transition';

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-indigo-950 to-indigo-900 text-white">
        <div className="pointer-events-none absolute -right-16 -top-20 w-64 h-64 rounded-full bg-lime-400/15 blur-3xl" aria-hidden="true" />
        <div className="relative max-w-3xl mx-auto px-4 pt-4 pb-5">
          <div className="flex items-center justify-between gap-2">
            <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-indigo-200 hover:text-white py-1 -ml-1 px-1">
              <ArrowLeft className="w-4 h-4" /> Home
            </Link>
            {session && (
              <div className="flex items-center gap-2 min-w-0">
                <Avatar name={displayName(session)} src={session.user.user_metadata?.avatar_url} size="w-8 h-8" />
                <span className="text-sm font-semibold truncate max-w-[9rem]">{displayName(session)}</span>
                <button
                  onClick={() => supabase.auth.signOut()}
                  aria-label="Sign out"
                  className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          <div className="mt-3 flex items-end justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.12em] sm:tracking-[0.2em] text-lime-300 whitespace-nowrap">
                Cubet Badminton · Season 2
              </div>
              <h1 className="text-3xl sm:text-4xl font-black tracking-tight">Predict & Win</h1>
            </div>
            <div className="flex-shrink-0 rounded-xl bg-white/10 px-3 py-1.5 text-center">
              {closed ? (
                <>
                  <div className="text-sm font-black leading-tight flex items-center gap-1 justify-center">
                    <Lock className="w-3.5 h-3.5" /> Closed
                  </div>
                  <div className="text-[10px] uppercase tracking-wide text-indigo-200">Picks locked</div>
                </>
              ) : (
                <>
                  <div className="text-lg font-black tabular-nums leading-tight">{countdown(msLeft)}</div>
                  <div className="text-[10px] uppercase tracking-wide text-indigo-200">Left to pick</div>
                </>
              )}
            </div>
          </div>
          <p className="mt-3 text-sm text-indigo-100/90">
            Pick the winner of each group. Every right pick is <b className="text-lime-300">{POINTS_PER_PICK} points</b>.{' '}
            {closed ? 'Picks are closed.' : `Picks close ${deadlineText}.`}
          </p>
        </div>
      </header>

      <nav className="sticky top-0 z-30 bg-slate-100/90 backdrop-blur border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-4 py-2.5">
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-white p-1 shadow-sm ring-1 ring-slate-200">
            <button
              onClick={() => setTab('picks')}
              aria-pressed={tab === 'picks'}
              className={`${tabClass} ${tab === 'picks' ? 'bg-slate-900 text-white shadow' : 'text-slate-500 hover:text-slate-800'}`}
            >
              <Sparkles className="w-4 h-4" /> My picks
            </button>
            <button
              onClick={() => setTab('leaderboard')}
              aria-pressed={tab === 'leaderboard'}
              className={`${tabClass} ${tab === 'leaderboard' ? 'bg-slate-900 text-white shadow' : 'text-slate-500 hover:text-slate-800'}`}
            >
              <Medal className="w-4 h-4" /> Leaderboard
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-4 py-4 pb-10 space-y-4">
        {tab === 'picks' && (
          <>
            {!session ? (
              <div className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 p-5 text-center">
                <div className="mx-auto w-12 h-12 rounded-2xl bg-lime-100 text-lime-700 flex items-center justify-center">
                  <Crown className="w-6 h-6" />
                </div>
                <h2 className="mt-3 text-lg font-black text-slate-900">
                  {closed ? 'Predictions are closed' : 'Sign in to make your picks'}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {closed
                    ? 'Sign in to see how your picks are doing, or check the leaderboard.'
                    : 'We only use your name for the leaderboard.'}
                </p>
                <div className="mt-4 mx-auto max-w-sm space-y-4">
                  {!logins.loaded && <Loader2 className="mx-auto w-6 h-6 animate-spin text-slate-400" />}
                  {logins.google && (
                    <button
                      onClick={signIn}
                      disabled={signingIn}
                      className="inline-flex w-full items-center justify-center gap-2.5 rounded-xl bg-white ring-1 ring-slate-300 px-5 py-3 font-bold text-slate-800 shadow-sm hover:bg-slate-50 active:scale-[0.98] transition disabled:opacity-60"
                    >
                      {signingIn ? <Loader2 className="w-5 h-5 animate-spin" /> : <GoogleIcon />}
                      Continue with Google
                    </button>
                  )}
                  {logins.google && logins.email && (
                    <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                      <span className="h-px flex-1 bg-slate-200" /> or <span className="h-px flex-1 bg-slate-200" />
                    </div>
                  )}
                  {logins.email && <EmailOtpSignIn />}
                </div>
              </div>
            ) : methodOff ? (
              <div className="rounded-2xl bg-amber-50 ring-1 ring-amber-200 px-4 py-3 flex items-center justify-between gap-3">
                <p className="text-sm text-amber-900">
                  {provider === 'google' ? 'Google' : 'Cubet email'} sign-in is turned off for picks. Sign out and use{' '}
                  {provider === 'google' ? 'your Cubet email' : 'Google'} instead.
                </p>
                <button
                  onClick={() => supabase.auth.signOut()}
                  className="flex-shrink-0 rounded-lg bg-white ring-1 ring-amber-300 px-3 py-1.5 text-sm font-semibold text-amber-900"
                >
                  Sign out
                </button>
              </div>
            ) : (
              <div className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 px-4 py-3 flex items-center justify-between gap-3">
                <div className="text-sm text-slate-600">
                  {closed ? (
                    <>Your picks are locked in.</>
                  ) : pickedCount === sortedGroups.length ? (
                    <>All picked! You can change them until {deadlineText}.</>
                  ) : (
                    <>
                      Picked <b className="text-slate-900">{pickedCount}</b> of {sortedGroups.length} groups. Tap a team to pick.
                    </>
                  )}
                </div>
                {me && (
                  <div className="flex-shrink-0 text-right">
                    <div className="text-lg font-black tabular-nums text-indigo-700 leading-tight">{me.points}</div>
                    <div className="text-[10px] uppercase tracking-wide text-slate-500">Points</div>
                  </div>
                )}
              </div>
            )}

            {sortedGroups.map(group => (
              <GroupPicker
                key={group.id}
                group={group}
                teams={sortByName(teams.filter(t => t.groupId === group.id))}
                myPick={myPicks[group.id]}
                winnerId={winners[group.id]}
                pickCounts={pickCounts.byGroup[group.id] ?? {}}
                totalPicks={pickCounts.totals[group.id] ?? 0}
                locked={!session || closed || methodOff}
                savingTeam={saving?.groupId === group.id ? saving.teamId : undefined}
                onPick={teamId => pick(group.id, teamId)}
              />
            ))}
            <p className="text-xs text-slate-500 text-center">The % shows how many people picked each team.</p>
          </>
        )}

        {tab === 'leaderboard' && (
          <section className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 overflow-hidden">
            {!anyFinalDone && (
              <p className="px-4 py-3 text-sm text-slate-600 bg-amber-50 border-b border-amber-100">
                Points come in as each group's final ends. {POINTS_PER_PICK} points for every right pick.
              </p>
            )}
            {!loaded ? (
              <div className="p-8 flex justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
              </div>
            ) : leaderboard.length === 0 ? (
              <p className="p-8 text-center text-sm text-slate-500">No picks yet. Be the first!</p>
            ) : (
              <ol>
                {leaderboard.map(row => {
                  const mine = row.userId === userId;
                  const medal = row.points > 0 && row.rank <= 3 ? ['bg-amber-400', 'bg-slate-300', 'bg-orange-300'][row.rank - 1] : '';
                  return (
                    <li
                      key={row.userId}
                      className={`flex items-center gap-3 px-4 py-2.5 border-b border-slate-100 last:border-0 ${mine ? 'bg-indigo-50' : ''}`}
                    >
                      <span
                        className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-black tabular-nums ${
                          medal ? `${medal} text-slate-900` : 'text-slate-500'
                        }`}
                      >
                        {row.rank}
                      </span>
                      <Avatar name={row.name} src={row.avatar} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-slate-900 truncate">
                          {row.name}
                          {mine && <span className="ml-1.5 text-xs font-semibold text-indigo-600">(you)</span>}
                        </div>
                        <div className="text-xs text-slate-500">
                          {row.correct} right · {row.picks} picked
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-lg font-black tabular-nums text-slate-900 leading-tight">{row.points}</div>
                        <div className="text-[10px] uppercase tracking-wide text-slate-500">pts</div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        )}

        {tab === 'leaderboard' && (
          <p className="text-xs text-slate-500 flex items-center justify-center gap-1.5">
            <Timer className="w-3.5 h-3.5" /> Same points? Whoever picked first goes higher.
          </p>
        )}
      </main>
    </div>
  );
};
