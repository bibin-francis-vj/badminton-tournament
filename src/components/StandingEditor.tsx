import React, { useState } from 'react';
import { X, ChevronUp, ChevronDown, Loader2, RotateCcw } from 'lucide-react';
import type { Standing, StatsOverride, Team } from '../types';
import { setDiffOf, pointDiffOf } from '../utils/calculations';
import { useTournamentStore } from '../store/tournamentStore';
import { confirmDialog, notifyError } from './Dialog';

interface Props {
  standing: Standing;
  teams: Team[]; // in current display order
  onClose: () => void;
}

type Field = 'won' | 'lost' | 'setDiff' | 'pointDiff';
type Row = { team: Team } & Record<Field, string>;

/** Whole number from an input; negatives allowed only for the difference columns. */
const toInt = (v: string, allowNegative = false) => {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return 0;
  return allowNegative ? n : Math.max(0, n);
};

/** Does the entered row equal what the match results give? (then no override is needed) */
const matchesComputed = (o: StatsOverride, team: Team) => {
  const c = team.computedStats;
  if (!c) return false;
  return (
    o.matchesWon === c.matchesWon &&
    o.matchesLost === c.matchesLost &&
    o.setDiff === (c.setsWon ?? 0) - (c.setsLost ?? 0) &&
    o.pointDiff === c.points - (c.pointsAgainst ?? 0)
  );
};

/**
 * Admin editor for one pool table: move teams up/down to set positions, and edit W / L / set ± / point ±.
 * Edited numbers are saved as an override, so the computed values from match results are kept
 * and come back with "Reset to automatic".
 */
export const StandingEditor: React.FC<Props> = ({ standing, teams, onClose }) => {
  const { updateStanding, resetStanding } = useTournamentStore();
  const [busy, setBusy] = useState(false);
  const [moved, setMoved] = useState(false);
  const [rows, setRows] = useState<Row[]>(() =>
    teams.map(team => ({
      team,
      won: String(team.stats.matchesWon),
      lost: String(team.stats.matchesLost),
      setDiff: String(setDiffOf(team)),
      pointDiff: String(pointDiffOf(team))
    }))
  );
  const hasManualOrder = teams.some(t => t.standingRank != null);
  const hasOverrides = teams.some(t => t.statsOverride);

  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= rows.length) return;
    setRows(prev => {
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setMoved(true);
  };

  const update = (index: number, field: Field, value: string) => {
    const signedField = field === 'setDiff' || field === 'pointDiff';
    // Digits only; the difference columns may also start with a minus sign
    const clean = signedField ? value.replace(/[−–]/g, '-').replace(/(?!^)-|[^0-9-]/g, '').slice(0, 5) : value.replace(/[^0-9]/g, '').slice(0, 3);
    setRows(prev => prev.map((r, i) => (i === index ? { ...r, [field]: clean } : r)));
  };

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
      onClose();
    } catch (error) {
      notifyError(error, 'Failed to save');
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    run(() =>
      updateStanding(
        standing.id,
        rows.map(r => {
          const stats: StatsOverride = {
            matchesWon: toInt(r.won),
            matchesLost: toInt(r.lost),
            setDiff: toInt(r.setDiff, true),
            pointDiff: toInt(r.pointDiff, true)
          };
          // Values equal to the computed ones need no override
          return { teamId: r.team.id, stats: matchesComputed(stats, r.team) ? null : stats };
        }),
        moved || hasManualOrder
      )
    );

  const reset = async () => {
    if (await confirmDialog({
      title: 'Reset to automatic?',
      message: `Manual positions and edited numbers in ${standing.name} are removed; results from matches are used again.`,
      confirmText: 'Reset',
      tone: 'warning'
    })) {
      run(() => resetStanding(standing.id));
    }
  };

  const cell = 'w-full text-center font-semibold px-1 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:p-4" onClick={onClose}>
      <div
        className="bg-white w-full sm:max-w-lg rounded-3xl sm:rounded-lg shadow-xl p-4 sm:p-6 max-h-[88vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-1">
          <h2 className="text-lg sm:text-xl font-bold text-gray-800 break-words">Edit {standing.name}</h2>
          <button onClick={onClose} aria-label="Close" className="p-2 -mr-2 -mt-1 rounded-lg text-gray-500 hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-xs sm:text-sm text-gray-600 mb-4">
          Use the arrows to set positions. Edit W (won), L (lost), Sets ± (set difference) and Pts ± (point difference) if needed.
        </p>

        <div className="grid grid-cols-[auto_minmax(0,1fr)_2.25rem_2.25rem_2.75rem_3rem] gap-x-1 gap-y-2 items-center text-sm">
          <div />
          <div className="text-xs font-semibold text-gray-500">Team</div>
          <div className="text-xs font-semibold text-gray-500 text-center">W</div>
          <div className="text-xs font-semibold text-gray-500 text-center">L</div>
          <div className="text-xs font-semibold text-gray-500 text-center">Sets ±</div>
          <div className="text-xs font-semibold text-gray-500 text-center">Pts ±</div>
          {rows.map((r, i) => (
            <React.Fragment key={r.team.id}>
              <div className="flex flex-col -my-1">
                <button onClick={() => move(i, -1)} disabled={i === 0 || busy} aria-label="Move up" className="p-1 rounded hover:bg-gray-100 disabled:opacity-25">
                  <ChevronUp className="w-5 h-5" />
                </button>
                <button onClick={() => move(i, 1)} disabled={i === rows.length - 1 || busy} aria-label="Move down" className="p-1 rounded hover:bg-gray-100 disabled:opacity-25">
                  <ChevronDown className="w-5 h-5" />
                </button>
              </div>
              <div className="min-w-0">
                <span className="font-bold text-gray-400 mr-1">{i + 1}.</span>
                <span className="font-semibold text-gray-800 break-words">{r.team.name}</span>
              </div>
              <input inputMode="numeric" value={r.won} onChange={e => update(i, 'won', e.target.value)} aria-label={`${r.team.name} won`} className={cell} />
              <input inputMode="numeric" value={r.lost} onChange={e => update(i, 'lost', e.target.value)} aria-label={`${r.team.name} lost`} className={cell} />
              {/* Differences can be negative, so use a keyboard with a minus sign */}
              <input inputMode="text" value={r.setDiff} onChange={e => update(i, 'setDiff', e.target.value)} aria-label={`${r.team.name} set difference`} className={cell} />
              <input inputMode="text" value={r.pointDiff} onChange={e => update(i, 'pointDiff', e.target.value)} aria-label={`${r.team.name} point difference`} className={cell} />
            </React.Fragment>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 mt-6">
          <button onClick={onClose} disabled={busy} className="bg-gray-200 text-gray-700 py-3 rounded-lg hover:bg-gray-300 font-semibold disabled:opacity-50">
            Cancel
          </button>
          <button onClick={save} disabled={busy} className="bg-green-600 text-white py-3 rounded-lg hover:bg-green-700 font-semibold disabled:opacity-50 flex items-center justify-center gap-2">
            {busy && <Loader2 className="w-5 h-5 animate-spin" />}
            Save
          </button>
        </div>
        {(hasManualOrder || hasOverrides) && (
          <button
            onClick={reset}
            disabled={busy}
            className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 text-sm font-semibold text-orange-700 hover:bg-orange-50 rounded-lg disabled:opacity-50"
          >
            <RotateCcw className="w-4 h-4" />
            Reset to automatic
          </button>
        )}
      </div>
    </div>
  );
};
