import React, { useState } from 'react';
import { AlertCircle, Loader2, MapPin } from 'lucide-react';
import { useTournamentStore } from '../store/tournamentStore';
import { isKnockout, matchLabel, sortByName } from '../utils/calculations';
import { notify } from './Dialog';

/**
 * Admin: upcoming matches that are not on any court yet (they don't show on the Live Courts page),
 * with one-tap buttons to add each to the end of a court's queue.
 */
export const UnassignedMatches: React.FC = () => {
  const { matches, courts, groups, pools, assignMatchToCourt } = useTournamentStore();
  const [busy, setBusy] = useState<string | null>(null);
  const sortedCourts = sortByName(courts);
  // Knockouts first (usually the ones just created), then by planned time
  const waiting = matches
    .filter(m => m.status === 'upcoming' && !m.courtId)
    .sort((a, b) => Number(isKnockout(b)) - Number(isKnockout(a)) || (a.scheduledTime ?? '').localeCompare(b.scheduledTime ?? ''));

  if (waiting.length === 0) return null;

  const assign = async (matchId: string, courtId: string, text: string) => {
    setBusy(`${matchId}:${courtId}`);
    await assignMatchToCourt(matchId, courtId);
    setBusy(null);
    notify(text, { tone: 'success', title: 'Added to court' });
  };

  return (
    <div className="mb-4 sm:mb-6 p-3 sm:p-4 rounded-lg border-2 border-amber-300 bg-amber-50">
      <h3 className="font-semibold text-amber-900 flex items-center gap-2">
        <AlertCircle className="w-5 h-5 flex-shrink-0" />
        Not on a court yet ({waiting.length})
      </h3>
      <p className="text-xs sm:text-sm text-amber-900/80 mt-0.5 mb-3">
        These matches don't show on the Live Courts page until you add them to a court.
      </p>
      <ul className="space-y-2">
        {waiting.map(match => (
          <li key={match.id} className="bg-white rounded-lg border border-amber-200 p-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-purple-700 break-words">
                {isKnockout(match) ? '🏆 ' : ''}
                {matchLabel(match, groups, pools)}
                {match.scheduledTime && <span className="text-gray-500 font-medium"> · {match.scheduledTime}</span>}
              </div>
              <div className="text-sm font-semibold text-gray-900 break-words">
                {match.team1.name} <span className="font-normal text-gray-400">vs</span> {match.team2.name}
              </div>
            </div>
            {sortedCourts.length === 0 ? (
              <span className="text-xs text-gray-500">Add a court first</span>
            ) : (
              <div className="flex flex-wrap gap-2">
                {sortedCourts.map(court => (
                  <button
                    key={court.id}
                    type="button"
                    disabled={!!busy}
                    onClick={() => assign(match.id, court.id, `${match.team1.name} vs ${match.team2.name} is now in the ${court.name} queue.`)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition disabled:opacity-50"
                  >
                    {busy === `${match.id}:${court.id}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
                    {court.name}
                  </button>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};
