import React, { useMemo, useState } from 'react';
import { X, Loader2, Trophy } from 'lucide-react';
import type { Match } from '../types';
import { useTournamentStore } from '../store/tournamentStore';
import { notify, notifyError } from './Dialog';

interface Props {
  match: Match;
  onClose: () => void;
}

type SetInput = { team1: string; team2: string };

const toNumber = (value: string) => {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

/**
 * Admin form to enter or correct the result of a match (set scores + winner).
 * The winner defaults to the team that won more sets; the admin can change it (e.g. walkover / retirement).
 */
export const ResultEditor: React.FC<Props> = ({ match, onClose }) => {
  const setMatchResult = useTournamentStore(s => s.setMatchResult);
  const [busy, setBusy] = useState(false);
  const [sets, setSets] = useState<SetInput[]>(() =>
    [0, 1, 2].map(i => {
      const s = match.sets?.[i];
      const played = s && (s.score.team1 > 0 || s.score.team2 > 0);
      return played ? { team1: String(s.score.team1), team2: String(s.score.team2) } : { team1: '', team2: '' };
    })
  );

  const setsWon = useMemo(() => {
    const won = { team1: 0, team2: 0 };
    sets.forEach(s => {
      const a = toNumber(s.team1);
      const b = toNumber(s.team2);
      if (a > b) won.team1++;
      else if (b > a) won.team2++;
    });
    return won;
  }, [sets]);

  const autoWinner: 'team1' | 'team2' | null =
    setsWon.team1 > setsWon.team2 ? 'team1' : setsWon.team2 > setsWon.team1 ? 'team2' : null;
  const [winnerChoice, setWinnerChoice] = useState<'team1' | 'team2' | null>(null);
  const winner = winnerChoice ?? autoWinner;

  const updateSet = (index: number, side: 'team1' | 'team2', value: string) => {
    setSets(prev => prev.map((s, i) => (i === index ? { ...s, [side]: value.replace(/[^0-9]/g, '').slice(0, 2) } : s)));
  };

  const handleSave = async () => {
    if (!winner) {
      notify('Select the winner of the match.', { tone: 'warning' });
      return;
    }
    setBusy(true);
    try {
      await setMatchResult(
        match.id,
        sets.map(s => ({ team1: toNumber(s.team1), team2: toNumber(s.team2) })),
        winner
      );
      onClose();
    } catch (error) {
      notifyError(error, 'Failed to save the result');
    } finally {
      setBusy(false);
    }
  };

  const teamName = (key: 'team1' | 'team2') => match[key].name;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:p-4" onClick={onClose}>
      <div
        className="bg-white w-full sm:max-w-md rounded-3xl sm:rounded-lg shadow-xl p-4 sm:p-6 max-h-[88vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-1">
          <h2 className="text-lg sm:text-xl font-bold text-gray-800">
            {match.status === 'completed' ? 'Edit Result' : 'Enter Result'}
          </h2>
          <button onClick={onClose} aria-label="Close" className="p-2 -mr-2 -mt-1 rounded-lg text-gray-500 hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
        </div>
        {match.matchName && <p className="text-sm font-semibold text-purple-700">{match.matchName}</p>}
        <p className="text-sm text-gray-600 mb-4">
          {teamName('team1')} vs {teamName('team2')}
        </p>

        {/* Set scores */}
        <div className="grid grid-cols-[auto_1fr_1fr] gap-2 items-center mb-4">
          <div />
          <div className="text-xs font-semibold text-gray-600 text-center break-words">{teamName('team1')}</div>
          <div className="text-xs font-semibold text-gray-600 text-center break-words">{teamName('team2')}</div>
          {sets.map((s, i) => (
            <React.Fragment key={i}>
              <div className="text-sm font-medium text-gray-700 pr-1">Set {i + 1}</div>
              {(['team1', 'team2'] as const).map(side => (
                <input
                  key={side}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={s[side]}
                  onChange={e => updateSet(i, side, e.target.value)}
                  placeholder={i === 2 ? '–' : '0'}
                  aria-label={`Set ${i + 1} ${teamName(side)}`}
                  className="w-full text-center text-lg font-bold px-2 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              ))}
            </React.Fragment>
          ))}
        </div>
        <p className="text-xs text-gray-500 mb-4">Leave set 3 empty if it wasn't played.</p>

        {/* Winner */}
        <div className="mb-5">
          <p className="text-sm font-semibold text-gray-700 mb-2">
            Winner <span className="font-normal text-gray-500">(sets {setsWon.team1}–{setsWon.team2})</span>
          </p>
          <div className="grid grid-cols-2 gap-2">
            {(['team1', 'team2'] as const).map(side => (
              <button
                key={side}
                type="button"
                onClick={() => setWinnerChoice(side)}
                className={`flex items-center justify-center gap-1.5 px-3 py-3 rounded-lg border-2 text-sm font-semibold transition break-words ${
                  winner === side ? 'border-green-600 bg-green-50 text-green-800' : 'border-gray-200 text-gray-700'
                }`}
              >
                {winner === side && <Trophy className="w-4 h-4 flex-shrink-0 text-yellow-500" />}
                {teamName(side)}
              </button>
            ))}
          </div>
          {winnerChoice && autoWinner && winnerChoice !== autoWinner && (
            <p className="text-xs text-orange-700 mt-2">The selected winner won fewer sets (e.g. walkover or retirement).</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={onClose}
            disabled={busy}
            className="bg-gray-200 text-gray-700 py-3 rounded-lg hover:bg-gray-300 transition font-semibold disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={busy || !winner}
            className="bg-green-600 text-white py-3 rounded-lg hover:bg-green-700 transition font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {busy && <Loader2 className="w-5 h-5 animate-spin" />}
            Save Result
          </button>
        </div>
      </div>
    </div>
  );
};
