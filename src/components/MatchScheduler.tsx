import React, { useState } from 'react';
import { useTournamentStore } from '../store/tournamentStore';
import { Match, MatchStage } from '../types';
import { Calendar, Plus, Trash2, Loader2, ClipboardEdit } from 'lucide-react';
import { LoadingSpinner } from './LoadingSpinner';
import { ResultEditor } from './ResultEditor';
import { KnockoutPanel } from './KnockoutPanel';
import { sortGroups, sortPools, sortByName, standingIdOf, matchLabel, isKnockout, getKnockout, pointsPerSetOf } from '../utils/calculations';
import { confirmDialog, notify, notifyError } from './Dialog';

export const MatchScheduler: React.FC = () => {
  const { teams, matches, courts, addMatch, deleteMatch, createKnockoutMatch, groups: unsortedGroups, pools, isLoading, isInitialized } = useTournamentStore();
  const groups = sortGroups(unsortedGroups);
  const [team1Id, setTeam1Id] = useState('');
  const [team2Id, setTeam2Id] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('');
  const [selectedPool, setSelectedPool] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [matchType, setMatchType] = useState<MatchStage>('pool');
  const [matchName, setMatchName] = useState('');
  const [pointsPerSet, setPointsPerSet] = useState<15 | 21>(15);
  const [loading, setLoading] = useState(false);
  const [resultMatch, setResultMatch] = useState<Match | null>(null);

  const knockout = matchType !== 'pool';
  const groupPools = sortPools(pools.filter(p => p.groupId === selectedGroup));
  const needsPool = !knockout && groupPools.length > 0;

  // Pool matches: teams from the same pool (or same group without pools). Knockouts: any teams in the group.
  const filteredTeams = !selectedGroup || (needsPool && !selectedPool)
    ? []
    : sortByName(teams.filter(team => team.groupId === selectedGroup && (!needsPool || team.poolId === selectedPool)));

  const courtName = (courtId?: string) => courts.find(c => c.id === courtId)?.name;

  const resetTeams = () => {
    setTeam1Id('');
    setTeam2Id('');
  };

  const handleManualSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      if (!selectedGroup) {
        notify('Please select a group.', { tone: 'warning' });
        return;
      }

      if (needsPool && !selectedPool) {
        notify('Please select a pool.', { tone: 'warning' });
        return;
      }

      if (!team1Id || !team2Id) {
        notify('Please select both teams.', { tone: 'warning' });
        return;
      }

      if (team1Id === team2Id) {
        notify('A team cannot play itself. Please select two different teams.', { tone: 'warning' });
        return;
      }

      if (knockout) {
        // Semi-finals take the next free bracket slot (1, then 2); the final is slot 1
        const { semi1, semi2 } = getKnockout(matches, selectedGroup);
        const slot = matchType === 'final' ? 1 : !semi1 ? 1 : !semi2 ? 2 : 0;
        if (!slot) {
          notify('This group already has two semi-finals.', { tone: 'warning' });
          return;
        }
        try {
          await createKnockoutMatch({
            groupId: selectedGroup,
            stage: matchType,
            slot,
            team1Id,
            team2Id,
            name: matchName,
            scheduledTime,
            pointsPerSet
          });
        } catch (error) {
          notifyError(error, 'Failed to schedule match');
          return;
        }
        resetTeams();
        setScheduledTime('');
        setMatchName('');
        notify('The match has been added to the schedule.', { tone: 'success', title: 'Match scheduled' });
        return;
      }

      const team1 = teams.find(t => t.id === team1Id);
      const team2 = teams.find(t => t.id === team2Id);

      if (!team1 || !team2) {
        notify('One of the selected teams no longer exists. Please select again.', { tone: 'warning' });
        return;
      }

      // Validate teams are in the same pool (or same group when it has no pools)
      if (standingIdOf(team1) !== standingIdOf(team2)) {
        notify('Both teams must be from the same group and pool.', { tone: 'warning' });
        return;
      }

      const newMatch: Match = {
        id: `match-${Date.now()}`,
        team1,
        team2,
        score: { team1: 0, team2: 0 }, // Sets won (0-2)
        sets: [
          {
            setNumber: 1,
            score: { team1: 0, team2: 0 }
          }
        ], // Initialize with first set
        currentSetNumber: 1, // Start with set 1
        servingTeam: 'team1', // Team 1 serves first (rally scoring)
        team1Position: 'left', // Default positions
        team2Position: 'right',
        status: 'upcoming',
        history: [], // Initialize empty history for score tracking
        scheduledTime: scheduledTime.trim() || null,
        pointsPerSet
      };

      await addMatch(newMatch);
      resetTeams();
      setScheduledTime('');
      notify('The match has been added to the schedule.', { tone: 'success', title: 'Match scheduled' });
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      upcoming: 'bg-gray-200 text-gray-700',
      live: 'bg-green-200 text-green-800',
      completed: 'bg-blue-200 text-blue-800'
    };
    return styles[status as keyof typeof styles] || styles.upcoming;
  };

  const handleDeleteMatch = async (matchId: string, matchInfo: string) => {
    if (await confirmDialog({ title: 'Delete match?', message: matchInfo, confirmText: 'Delete', tone: 'danger' })) {
      deleteMatch(matchId);
    }
  };

  // Show loader during initial data fetch
  if (isLoading && !isInitialized) {
    return <LoadingSpinner size="lg" text="Loading Matches..." />;
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-4 sm:p-6">
      <div className="flex justify-between items-center mb-4 sm:mb-6">
        <h2 className="text-lg sm:text-2xl font-bold text-gray-800 flex items-center gap-2">
          <Calendar className="w-5 h-5 sm:w-6 sm:h-6" />
          Match Scheduler
        </h2>
      </div>

      <KnockoutPanel />

      {/* Manual Scheduling Form */}
      <form onSubmit={handleManualSchedule} className="mb-6 p-3 sm:p-4 bg-blue-50 rounded-lg border-2 border-blue-200">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-blue-900">Schedule New Match</h3>
          <Plus className="w-5 h-5 text-blue-700" />
        </div>

        {/* Match type */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Match type
          </label>
          <div className="grid grid-cols-3 gap-2">
            {([['pool', 'Pool match'], ['semifinal', 'Semi-final'], ['final', 'Final']] as [MatchStage, string][]).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setMatchType(value);
                  setPointsPerSet(value === 'pool' ? 15 : 21);
                  setSelectedPool('');
                  resetTeams();
                }}
                className={`py-2.5 px-2 rounded-lg text-sm font-semibold border-2 transition ${
                  matchType === value ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-200 bg-white text-gray-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {knockout && (
            <p className="text-xs text-gray-600 mt-2">
              Knockout matches can pair any two teams in the group and don't count toward pool standings.
            </p>
          )}
        </div>

        {/* Set length */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">Points per set</label>
          <div className="grid grid-cols-2 gap-2">
            {([15, 21] as const).map(points => (
              <button
                key={points}
                type="button"
                onClick={() => setPointsPerSet(points)}
                aria-pressed={pointsPerSet === points}
                className={`py-2.5 px-2 rounded-lg text-sm font-semibold border-2 transition ${
                  pointsPerSet === points ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-200 bg-white text-gray-700'
                }`}
              >
                {points} points
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-600 mt-2">
            Win by 2, up to {pointsPerSet === 21 ? 30 : 21} max. Best of 3 sets.
          </p>
        </div>

        {/* Group & Pool Selection */}
        <div className={`grid grid-cols-1 ${needsPool ? 'md:grid-cols-2' : ''} gap-4 mb-4`}>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Group
            </label>
            <select
              value={selectedGroup}
              onChange={(e) => {
                setSelectedGroup(e.target.value);
                setSelectedPool('');
                resetTeams(); // Reset team selections when group changes
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="">Select Group First</option>
              {groups.map(group => (
                <option key={group.id} value={group.id}>
                  {group.name} ({teams.filter(t => t.groupId === group.id).length} teams)
                </option>
              ))}
            </select>
          </div>
          {needsPool && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Pool
              </label>
              <select
                value={selectedPool}
                onChange={(e) => {
                  setSelectedPool(e.target.value);
                  resetTeams();
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="">Select Pool</option>
                {groupPools.map(pool => (
                  <option key={pool.id} value={pool.id}>
                    {pool.name} ({teams.filter(t => t.poolId === pool.id).length} teams)
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Team 1
            </label>
            <select
              value={team1Id}
              onChange={(e) => setTeam1Id(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
              disabled={filteredTeams.length === 0}
            >
              <option value="">Select Team 1</option>
              {filteredTeams.map(team => (
                <option key={team.id} value={team.id}>
                  {team.name} ({team.players.map(p => p.name).join(' & ')})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Team 2
            </label>
            <select
              value={team2Id}
              onChange={(e) => setTeam2Id(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
              disabled={filteredTeams.length === 0}
            >
              <option value="">Select Team 2</option>
              {filteredTeams.map(team => (
                <option key={team.id} value={team.id} disabled={team.id === team1Id}>
                  {team.name} ({team.players.map(p => p.name).join(' & ')})
                </option>
              ))}
            </select>
          </div>
          {knockout && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Match name <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={matchName}
                onChange={(e) => setMatchName(e.target.value)}
                placeholder={matchType === 'final' ? 'Final' : 'Semi-final 1'}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Start time <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={scheduledTime}
              onChange={(e) => setScheduledTime(e.target.value)}
              placeholder="e.g. 7:15 PM"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full sm:w-auto justify-center bg-green-600 text-white px-6 py-3 sm:py-2 rounded-lg hover:bg-green-700 transition font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Schedule Match
          </button>
        </form>

      <div className="space-y-3">
        {matches.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Calendar className="w-16 h-16 mx-auto mb-4 text-gray-300" />
            <p className="text-lg">No matches scheduled</p>
            <p className="text-sm">Schedule matches using the form above</p>
          </div>
        ) : (
          matches.map(match => {
            const groupLabel = matchLabel(match, groups, pools);
            const knockoutMatch = isKnockout(match);
            return (
              <div key={match.id} className="border border-gray-200 rounded-lg p-3 sm:p-4 hover:shadow-md transition">
                <div className="flex justify-between items-start">
                  <div className="flex-1 min-w-0">
                    {/* Group / pool badge and planned time */}
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${knockoutMatch ? 'bg-yellow-100 text-yellow-800' : 'bg-purple-100 text-purple-700'}`}>
                        {knockoutMatch ? '🏆' : '📍'} {groupLabel}
                      </span>
                      {match.scheduledTime && (
                        <span className="text-xs font-medium text-gray-600">🕒 {match.scheduledTime}</span>
                      )}
                      <span className="text-xs font-medium text-gray-600">{pointsPerSetOf(match)} pts/set</span>
                    </div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-gray-800 break-words">
                          {match.team1.name}
                        </div>
                        <div className="text-xs text-gray-500">
                          {match.team1.players.map(p => p.name).join(' & ')}
                        </div>
                      </div>
                      <div className="text-base sm:text-2xl font-bold mx-2 sm:mx-4 text-gray-600 flex-shrink-0">VS</div>
                      <div className="flex-1 min-w-0 text-right">
                        <div className="font-semibold text-gray-800 break-words">
                          {match.team2.name}
                        </div>
                        <div className="text-xs text-gray-500">
                          {match.team2.players.map(p => p.name).join(' & ')}
                        </div>
                      </div>
                    </div>
                  <div className="flex flex-wrap justify-between items-center gap-2 mt-3">
                    <span className={`text-xs px-3 py-1 rounded-full font-medium ${getStatusBadge(match.status)}`}>
                      {match.status.toUpperCase()}
                    </span>
                    {match.status === 'completed' && (
                      <div className="text-sm font-semibold text-gray-700">
                        Score: {match.score.team1} - {match.score.team2}
                      </div>
                    )}
                    {match.status === 'live' && (
                      <div className="text-sm font-semibold text-green-700">
                        Live: {match.score.team1} - {match.score.team2}
                      </div>
                    )}
                    {match.courtId && (
                      <div className="text-xs text-gray-500">
                        {courtName(match.courtId) ?? 'Court'}
                      </div>
                    )}
                  </div>
                  {match.status !== 'live' && (
                    <button
                      onClick={() => setResultMatch(match)}
                      className="mt-3 w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 rounded-lg border-2 border-gray-200 text-sm font-semibold text-gray-700 hover:border-blue-400 hover:text-blue-700 transition"
                    >
                      <ClipboardEdit className="w-4 h-4" />
                      {match.status === 'completed' ? 'Edit Result' : 'Enter Result'}
                    </button>
                  )}
                </div>
                {match.status === 'upcoming' && (
                  <button
                    onClick={() => handleDeleteMatch(
                      match.id,
                      `${match.team1.name} vs ${match.team2.name}`
                    )}
                    className="ml-2 sm:ml-4 -mr-1 -mt-1 text-red-600 hover:text-red-800 hover:bg-red-50 p-2.5 rounded-lg transition flex-shrink-0"
                    title="Delete match"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                )}
              </div>
            </div>
            );
          })
        )}
      </div>

      <div className="mt-6 p-4 bg-blue-50 rounded-lg">
        <h3 className="font-semibold text-blue-900 mb-2">Match Summary</h3>
        <div className="grid grid-cols-3 gap-2 sm:gap-4 text-sm text-center sm:text-left">
          <div className="flex flex-col sm:block">
            <span className="text-gray-600 text-xs sm:text-sm">Total<span className="hidden sm:inline"> Matches</span>:</span>
            <span className="sm:ml-2 font-semibold text-lg sm:text-sm">{matches.length}</span>
          </div>
          <div className="flex flex-col sm:block">
            <span className="text-gray-600 text-xs sm:text-sm">Live:</span>
            <span className="sm:ml-2 font-semibold text-lg sm:text-sm text-green-700">
              {matches.filter(m => m.status === 'live').length}
            </span>
          </div>
          <div className="flex flex-col sm:block">
            <span className="text-gray-600 text-xs sm:text-sm">Completed:</span>
            <span className="sm:ml-2 font-semibold text-lg sm:text-sm text-blue-700">
              {matches.filter(m => m.status === 'completed').length}
            </span>
          </div>
        </div>
      </div>
      {resultMatch && <ResultEditor match={resultMatch} onClose={() => setResultMatch(null)} />}
    </div>
  );
};
