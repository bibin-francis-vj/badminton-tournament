import React, { useState } from 'react';
import { X, RotateCcw, Trash2, Loader2, ArrowLeft, Lock, Check } from 'lucide-react';
import { useTournamentStore } from '../store/tournamentStore';
import { notify } from './Dialog';

type Mode = 'scores' | 'everything';

const OPTIONS: Record<Mode, { title: string; summary: string; keeps: string[]; removes: string[] }> = {
  scores: {
    title: 'Reset scores only',
    summary: 'Start the scoring again with the same setup.',
    keeps: ['Groups, pools and teams', 'All matches (with their court and queue order)', 'Courts and referees'],
    removes: ['All match scores and results (every match back to upcoming, 0–0)', 'Team stats, standings edits and pending approvals']
  },
  everything: {
    title: 'Reset everything',
    summary: 'Delete all data and start with an empty app.',
    keeps: [],
    removes: ['All teams, groups and pools', 'All matches, results and scores', 'All courts and referee accounts']
  }
};

/** Admin "Reset" dialog: pick scores-only or full reset, then confirm with the reset password. */
export const ResetDialog: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { resetScores, resetEverything } = useTournamentStore();
  const [mode, setMode] = useState<Mode | null>(null);
  const [password, setPassword] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const resetPassword = import.meta.env.VITE_RESET_PASSWORD;
  const needsTyping = mode === 'everything';
  const canSubmit = !!password && (!needsTyping || confirmText.trim().toUpperCase() === 'RESET');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mode) return;
    setError('');
    if (!resetPassword) {
      setError('Reset is disabled: VITE_RESET_PASSWORD is not configured.');
      return;
    }
    if (password !== resetPassword) {
      setError('Incorrect reset password.');
      setPassword('');
      return;
    }
    setBusy(true);
    try {
      await (mode === 'scores' ? resetScores() : resetEverything());
      notify(mode === 'scores' ? 'All matches are back to 0–0 and team stats are cleared.' : 'All data has been deleted. The app is now empty.', {
        tone: 'success',
        title: mode === 'scores' ? 'Scores reset' : 'Everything reset'
      });
      onClose();
    } catch (err) {
      console.error('Reset failed:', err);
      setError('Reset failed. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  const option = (value: Mode, Icon: typeof RotateCcw, tone: string) => (
    <button
      type="button"
      onClick={() => setMode(value)}
      className={`w-full text-left rounded-xl border-2 p-4 flex gap-3 items-start transition hover:shadow-md active:scale-[0.99] ${tone}`}
    >
      <Icon className="w-6 h-6 flex-shrink-0 mt-0.5" />
      <span>
        <span className="block font-bold text-gray-900">{OPTIONS[value].title}</span>
        <span className="block text-sm text-gray-600">{OPTIONS[value].summary}</span>
      </span>
    </button>
  );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:p-4" onClick={busy ? undefined : onClose}>
      <div
        className="bg-white w-full sm:max-w-md rounded-3xl sm:rounded-xl shadow-xl p-4 sm:p-6 max-h-[88vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2 min-w-0">
            {mode && (
              <button onClick={() => { setMode(null); setError(''); setPassword(''); setConfirmText(''); }} disabled={busy} aria-label="Back" className="p-2 -ml-2 rounded-lg text-gray-600 hover:bg-gray-100">
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <h2 className="text-lg sm:text-xl font-bold text-gray-800">{mode ? OPTIONS[mode].title : 'Reset tournament'}</h2>
          </div>
          <button onClick={onClose} disabled={busy} aria-label="Close" className="p-2 -mr-2 rounded-lg text-gray-500 hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        {!mode ? (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">What do you want to reset?</p>
            {option('scores', RotateCcw, 'border-orange-200 hover:border-orange-400 text-orange-600')}
            {option('everything', Trash2, 'border-red-200 hover:border-red-400 text-red-600')}
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="rounded-xl bg-gray-50 p-3 text-sm space-y-2">
              {OPTIONS[mode].removes.map(item => (
                <div key={item} className="flex gap-2 text-red-700">
                  <Trash2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{item}</span>
                </div>
              ))}
              {OPTIONS[mode].keeps.map(item => (
                <div key={item} className="flex gap-2 text-green-700">
                  <Check className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>Keeps: {item}</span>
                </div>
              ))}
            </div>
            <p className="text-sm font-semibold text-gray-800">This cannot be undone.</p>

            <div>
              <label htmlFor="reset-password" className="block text-sm font-medium text-gray-700 mb-1.5">Reset password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
                <input
                  id="reset-password"
                  type="password"
                  autoFocus
                  autoComplete="off"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  disabled={busy}
                  className="w-full pl-10 pr-3 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
            </div>

            {needsTyping && (
              <div>
                <label htmlFor="reset-confirm" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Type <span className="font-mono font-bold">RESET</span> to confirm
                </label>
                <input
                  id="reset-confirm"
                  type="text"
                  autoCapitalize="characters"
                  autoComplete="off"
                  value={confirmText}
                  onChange={e => setConfirmText(e.target.value)}
                  disabled={busy}
                  className="w-full px-3 py-3 border border-gray-300 rounded-xl font-mono focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
            )}

            {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">{error}</div>}

            <button
              type="submit"
              disabled={busy || !canSubmit}
              className={`w-full py-3.5 rounded-xl font-bold text-white flex items-center justify-center gap-2 transition disabled:opacity-50 ${
                mode === 'everything' ? 'bg-red-600 hover:bg-red-700' : 'bg-orange-500 hover:bg-orange-600'
              }`}
            >
              {busy && <Loader2 className="w-5 h-5 animate-spin" />}
              {mode === 'everything' ? 'Delete everything' : 'Reset all scores'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
