import React, { useState } from 'react';
import { GitBranch, Trophy, Loader2, Plus, Medal } from 'lucide-react';
import type { Group, Match, Team } from '../types';
import { useTournamentStore } from '../store/tournamentStore';
import { getKnockout, hasKnockout, loserOf, sortGroups, sortPools, sortStanding, sortByName } from '../utils/calculations';
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

/** One group's knockouts: the whole-group bracket, or (switch at the top) a single pool's own bracket. */
const GroupKnockouts: React.FC<{ group: Group }> = ({ group }) => {
  const { pools, teams, matches, createSemiFinals, createFinal, createThirdPlace } = useTournamentStore();
  const groupPools = sortPools(pools.filter(p => p.groupId === group.id));
  // Start on the bracket that already has matches (the whole group if none do)
  const [poolId, setPoolId] = useState<string | null>(
    () => (hasKnockout(matches, group.id) ? null : groupPools.find(p => hasKnockout(matches, group.id, p.id))?.id ?? null)
  );
  const [editing, setEditing] = useState(false);
  const [pairs, setPairs] = useState<[string, string][]>([['', ''], ['', '']]);
  const [busy, setBusy] = useState(false);

  const { semi1, semi2, final, thirdPlace } = getKnockout(matches, group.id, poolId);
  const pool = poolId ? groupPools.find(p => p.id === poolId) : undefined;
  const crossPools = !poolId && groupPools.length === 2; // whole group with two pools: pool winners cross over
  const scopeTeams = sortByName(teams.filter(t => t.groupId === group.id && (!poolId || t.poolId === poolId)));
  const where = pool ? pool.name : 'the group';
  const loser1 = loserOf(semi1);
  const loser2 = loserOf(semi2);
  const semisDone = !!(semi1?.status === 'completed' && semi2?.status === 'completed' && semi1.winner && semi2.winner);

  const semiPlaceholder = (n: 1 | 2) => {
    if (crossPools) {
      return n === 1 ? `${groupPools[0].name} 1st vs ${groupPools[1].name} 2nd` : `${groupPools[0].name} 2nd vs ${groupPools[1].name} 1st`;
    }
    if (!poolId && groupPools.length > 0) return 'Not created';
    return n === 1 ? '1st vs 4th' : '2nd vs 3rd';
  };

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
      setEditing(false);
    } catch (error) {
      notifyError(error, 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  /** Fill from the current standings: pool winners cross over, or 1st vs 4th and 2nd vs 3rd in one table. */
  const openSemiForm = () => {
    const ranked = (ids: (t: Team) => boolean) => sortStanding(teams.filter(ids), matches);
    if (crossPools) {
      const a = ranked(t => t.poolId === groupPools[0].id);
      const b = ranked(t => t.poolId === groupPools[1].id);
      setPairs([
        [a[0]?.id ?? '', b[1]?.id ?? ''],
        [a[1]?.id ?? '', b[0]?.id ?? '']
      ]);
    } else if (poolId || groupPools.length === 0) {
      const r = ranked(t => t.groupId === group.id && (!poolId || t.poolId === poolId));
      setPairs([
        [r[0]?.id ?? '', r[3]?.id ?? ''],
        [r[1]?.id ?? '', r[2]?.id ?? '']
      ]);
    } else {
      setPairs([['', ''], ['', '']]);
    }
    setEditing(true);
  };

  const updatePair = (pairIndex: number, side: 0 | 1, teamId: string) => {
    setPairs(prev => prev.map((p, i) => (i === pairIndex ? (side === 0 ? [teamId, p[1]] : [p[0], teamId]) : p)) as [string, string][]);
  };

  const teamOption = (team: Team) => (
    <option key={team.id} value={team.id}>
      {team.name}
      {!poolId && team.poolId ? ` (${pools.find(p => p.id === team.poolId)?.name ?? ''})` : ''}
    </option>
  );

  return (
    <div className="bg-white rounded-lg border border-purple-200 p-3">
      <h4 className="font-bold text-gray-800 mb-1 break-words">{group.name}</h4>

      {groupPools.length > 0 && (
        <div className="flex gap-1 rounded-lg bg-purple-50 p-1 mb-2" role="tablist" aria-label="Bracket">
          {[{ id: null as string | null, name: 'Whole group' }, ...groupPools.map(p => ({ id: p.id as string | null, name: p.name }))].map(tab => {
            const on = tab.id === poolId;
            const used = hasKnockout(matches, group.id, tab.id);
            return (
              <button
                key={tab.id ?? 'group'}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => {
                  setPoolId(tab.id);
                  setEditing(false);
                }}
                className={`flex-1 py-1.5 px-1 rounded-md text-xs font-semibold transition ${on ? 'bg-purple-600 text-white' : 'text-purple-800'}`}
              >
                {tab.name}
                {used && !on && <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-purple-500 align-middle" />}
              </button>
            );
          })}
        </div>
      )}

      <KnockoutRow label={semi1?.matchName || 'Semi-final 1'} match={semi1} placeholder={semiPlaceholder(1)} />
      <KnockoutRow label={semi2?.matchName || 'Semi-final 2'} match={semi2} placeholder={semiPlaceholder(2)} />
      <KnockoutRow label={final?.matchName || 'Final'} match={final} placeholder="Winner SF1 vs Winner SF2" />
      <KnockoutRow label={thirdPlace?.matchName || '3rd place match'} match={thirdPlace} placeholder="Loser SF1 vs Loser SF2" />

      {final?.status === 'completed' && final.winner && (
        <div className="mt-2 flex items-center gap-2 bg-yellow-50 border border-yellow-300 rounded-lg px-3 py-2 text-sm font-semibold text-yellow-900">
          <Trophy className="w-4 h-4 text-yellow-500 flex-shrink-0" />
          {pool ? `${pool.name} winner` : 'Champion'}: {final.winner.name}
        </div>
      )}
      {thirdPlace?.status === 'completed' && thirdPlace.winner && (
        <div className="mt-2 flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 text-sm font-semibold text-orange-900">
          <Medal className="w-4 h-4 text-orange-500 flex-shrink-0" />
          3rd place: {thirdPlace.winner.name}
        </div>
      )}

      {/* Create semi-finals from standings */}
      {!semi1 && !semi2 && !editing && (
        <button
          onClick={openSemiForm}
          disabled={busy || scopeTeams.length < 4}
          className="mt-3 w-full flex items-center justify-center gap-2 bg-purple-600 text-white py-2.5 rounded-lg font-semibold hover:bg-purple-700 transition disabled:opacity-50"
        >
          <Plus className="w-4 h-4" />
          Create Semi-finals{pool ? ` for ${pool.name}` : ''}
        </button>
      )}
      {!semi1 && !semi2 && !editing && scopeTeams.length < 4 && (
        <p className="mt-1.5 text-xs text-gray-500">
          {where === 'the group' ? 'The group' : where} has {scopeTeams.length} teams, so semi-finals need 4. You can still add a final or any match with the form below.
        </p>
      )}

      {editing && (
        <div className="mt-3 space-y-3">
          <p className="text-xs text-gray-600">
            {crossPools || poolId || groupPools.length === 0
              ? 'Filled from the current standings. Change a team if needed, then save.'
              : 'Pick the four teams, then save.'}
          </p>
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
                  {scopeTeams.map(teamOption)}
                </select>
              ))}
            </div>
          ))}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setEditing(false)}
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
                run(() => createSemiFinals(group.id, pairs, poolId));
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
              run(() => createFinal(group.id, poolId));
            }
          }}
          disabled={busy}
          className="mt-3 w-full flex items-center justify-center gap-2 bg-yellow-500 text-white py-2.5 rounded-lg font-semibold hover:bg-yellow-600 transition disabled:opacity-50"
        >
          <Trophy className="w-4 h-4" />
          Create Final
        </button>
      )}

      {/* Create the 3rd place match from the semi-final losers */}
      {!thirdPlace && loser1 && loser2 && (
        <button
          onClick={async () => {
            if (await confirmDialog({ title: 'Create the 3rd place match?', message: `${loser1.name} vs ${loser2.name}`, confirmText: 'Create match', tone: 'success' })) {
              run(() => createThirdPlace(group.id, poolId));
            }
          }}
          disabled={busy}
          className="mt-2 w-full flex items-center justify-center gap-2 bg-orange-500 text-white py-2.5 rounded-lg font-semibold hover:bg-orange-600 transition disabled:opacity-50"
        >
          <Medal className="w-4 h-4" />
          Create 3rd place match
        </button>
      )}
    </div>
  );
};

/** Knockout overview per group (or per pool), with shortcuts to create semi-finals, the final and the 3rd place match. */
export const KnockoutPanel: React.FC = () => {
  const { groups } = useTournamentStore();
  return (
    <div className="mb-6 p-3 sm:p-4 bg-purple-50 rounded-lg border-2 border-purple-200">
      <h3 className="text-lg font-semibold text-purple-900 flex items-center gap-2 mb-1">
        <GitBranch className="w-5 h-5" />
        Semi-finals, Finals & 3rd place
      </h3>
      <p className="text-xs sm:text-sm text-purple-900/80 mb-3">
        Each group has its own knockouts, and each pool can have its own too (switch at the top of a group). Knockout results
        don't change the pool standings. Assign knockout matches to a court in the Courts tab.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {sortGroups(groups).map(group => (
          <GroupKnockouts key={group.id} group={group} />
        ))}
      </div>
    </div>
  );
};
