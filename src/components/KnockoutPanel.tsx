import React, { useState } from 'react';
import { GitBranch, Trophy, Loader2, Plus } from 'lucide-react';
import type { Match, Team } from '../types';
import { useTournamentStore } from '../store/tournamentStore';
import { getKnockout, sortGroups, sortPools, sortStanding, sortByName } from '../utils/calculations';
import { confirmDialog, notify, notifyError } from './Dialog';

const statusStyle: Record<string, string> = {
  upcoming: 'bg-gray-100 text-gray-700',
  live: 'bg-green-100 text-green-800',
  completed: 'bg-blue-100 text-blue-800'
};

const KnockoutRow: React.FC<{ label: string; match?: Match; placeholder: string }> = ({ label, match, placeholder }) => (
  <div className="flex items-start justify-between gap-2 py-2 border-b border-gray-100 last:border-0">
    <div className="min-w-0">
      <div className="text-xs font-semibold uppercase text-purple-700">{label}</div>
      {match ? (
        <div className="text-sm text-gray-800 break-words">
          <span className={match.winner?.id === match.team1.id ? 'font-bold text-green-700' : ''}>{match.team1.name}</span>
          <span className="text-gray-400"> vs </span>
          <span className={match.winner?.id === match.team2.id ? 'font-bold text-green-700' : ''}>{match.team2.name}</span>
          {match.status !== 'upcoming' && (
            <span className="ml-1 text-gray-500 whitespace-nowrap">({match.score.team1}–{match.score.team2})</span>
          )}
        </div>
      ) : (
        <div className="text-sm text-gray-400 italic">{placeholder}</div>
      )}
    </div>
    {match && (
      <span className={`flex-shrink-0 text-[11px] px-2 py-0.5 rounded-full font-semibold uppercase ${statusStyle[match.status] ?? statusStyle.upcoming}`}>
        {match.pendingApproval ? 'Approval' : match.status}
      </span>
    )}
  </div>
);

/** Knockout stage overview per group, with shortcuts to create the semi-finals and the final. */
export const KnockoutPanel: React.FC = () => {
  const { groups, pools, teams, matches, createSemiFinals, createFinal } = useTournamentStore();
  const [editingGroup, setEditingGroup] = useState<string | null>(null);
  const [pairs, setPairs] = useState<[string, string][]>([['', ''], ['', '']]);
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
      setEditingGroup(null);
    } catch (error) {
      notifyError(error, 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  /** Pool 1 #1 vs Pool 2 #2, Pool 1 #2 vs Pool 2 #1 from the current standings. */
  const openSemiForm = (groupId: string) => {
    const [poolA, poolB] = sortPools(pools.filter(p => p.groupId === groupId));
    const a = sortStanding(teams.filter(t => t.poolId === poolA.id), matches);
    const b = sortStanding(teams.filter(t => t.poolId === poolB.id), matches);
    setPairs([
      [a[0]?.id ?? '', b[1]?.id ?? ''],
      [a[1]?.id ?? '', b[0]?.id ?? '']
    ]);
    setEditingGroup(groupId);
  };

  const updatePair = (pairIndex: number, side: 0 | 1, teamId: string) => {
    setPairs(prev => prev.map((p, i) => (i === pairIndex ? (side === 0 ? [teamId, p[1]] : [p[0], teamId]) : p)) as [string, string][]);
  };

  const teamOption = (team: Team) => (
    <option key={team.id} value={team.id}>
      {team.name}
      {team.poolId ? ` (${pools.find(p => p.id === team.poolId)?.name ?? ''})` : ''}
    </option>
  );

  return (
    <div className="mb-6 p-3 sm:p-4 bg-purple-50 rounded-lg border-2 border-purple-200">
      <h3 className="text-lg font-semibold text-purple-900 flex items-center gap-2 mb-1">
        <GitBranch className="w-5 h-5" />
        Semi-finals & Finals
      </h3>
      <p className="text-xs sm:text-sm text-purple-900/80 mb-3">
        Knockout results don't change the pool standings. Assign knockout matches to a court in the Courts tab.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {sortGroups(groups).map(group => {
          const { semi1, semi2, final } = getKnockout(matches, group.id);
          const groupPools = sortPools(pools.filter(p => p.groupId === group.id));
          const canAutoSemis = groupPools.length === 2;
          const semisDone = semi1?.status === 'completed' && semi2?.status === 'completed' && semi1.winner && semi2.winner;
          const groupTeams = sortByName(teams.filter(t => t.groupId === group.id));
          const semiPlaceholder = (n: 1 | 2) =>
            canAutoSemis
              ? n === 1
                ? `${groupPools[0].name} 1st vs ${groupPools[1].name} 2nd`
                : `${groupPools[0].name} 2nd vs ${groupPools[1].name} 1st`
              : 'Not created';

          return (
            <div key={group.id} className="bg-white rounded-lg border border-purple-200 p-3">
              <h4 className="font-bold text-gray-800 mb-1 break-words">{group.name}</h4>
              <KnockoutRow label={semi1?.matchName || 'Semi-final 1'} match={semi1} placeholder={semiPlaceholder(1)} />
              <KnockoutRow label={semi2?.matchName || 'Semi-final 2'} match={semi2} placeholder={semiPlaceholder(2)} />
              <KnockoutRow label={final?.matchName || 'Final'} match={final} placeholder="Winner SF1 vs Winner SF2" />

              {final?.status === 'completed' && final.winner && (
                <div className="mt-2 flex items-center gap-2 bg-yellow-50 border border-yellow-300 rounded-lg px-3 py-2 text-sm font-semibold text-yellow-900">
                  <Trophy className="w-4 h-4 text-yellow-500 flex-shrink-0" />
                  Champion: {final.winner.name}
                </div>
              )}

              {/* Create semi-finals from standings */}
              {!semi1 && !semi2 && editingGroup !== group.id && (
                canAutoSemis ? (
                  <button
                    onClick={() => openSemiForm(group.id)}
                    disabled={busy}
                    className="mt-3 w-full flex items-center justify-center gap-2 bg-purple-600 text-white py-2.5 rounded-lg font-semibold hover:bg-purple-700 transition disabled:opacity-50"
                  >
                    <Plus className="w-4 h-4" />
                    Create Semi-finals
                  </button>
                ) : (
                  <p className="mt-2 text-xs text-gray-500">
                    Schedule semi-finals below with Match type “Semi-final”.
                  </p>
                )
              )}

              {editingGroup === group.id && (
                <div className="mt-3 space-y-3">
                  <p className="text-xs text-gray-600">Filled from the current standings. Change a team if needed, then save.</p>
                  {pairs.map((pair, i) => (
                    <div key={i} className="space-y-1.5">
                      <div className="text-xs font-semibold text-purple-700 uppercase">Semi-final {i + 1}</div>
                      {[0, 1].map(side => (
                        <select
                          key={side}
                          value={pair[side]}
                          onChange={e => updatePair(i, side as 0 | 1, e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                        >
                          <option value="">Select team</option>
                          {groupTeams.map(teamOption)}
                        </select>
                      ))}
                    </div>
                  ))}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setEditingGroup(null)}
                      disabled={busy}
                      className="bg-gray-200 text-gray-700 py-2.5 rounded-lg font-semibold hover:bg-gray-300 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        if (pairs.flat().some(id => !id)) {
                          notify('Select all four teams for the semi-finals.', { tone: 'warning' });
                          return;
                        }
                        run(() => createSemiFinals(group.id, pairs));
                      }}
                      disabled={busy}
                      className="bg-purple-600 text-white py-2.5 rounded-lg font-semibold hover:bg-purple-700 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                      Save
                    </button>
                  </div>
                </div>
              )}

              {/* Create the final from the semi-final winners */}
              {!final && semisDone && (
                <button
                  onClick={async () => {
                    if (await confirmDialog({ title: 'Create the final?', message: `${semi1!.winner!.name} vs ${semi2!.winner!.name}`, confirmText: 'Create final', tone: 'success' })) {
                      run(() => createFinal(group.id));
                    }
                  }}
                  disabled={busy}
                  className="mt-3 w-full flex items-center justify-center gap-2 bg-yellow-500 text-white py-2.5 rounded-lg font-semibold hover:bg-yellow-600 transition disabled:opacity-50"
                >
                  <Trophy className="w-4 h-4" />
                  Create Final
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
