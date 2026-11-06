import React, { useMemo, useState } from 'react';
import { useTournamentStore } from '../store/tournamentStore';
import { calculations, getStandings, standingIdOf, teamGroupLabel, compareTeams, sortStanding, standingHasPoolMatches, isKnockout, setDiffOf, pointDiffOf, signed } from '../utils/calculations';
import type { Standing, Team } from '../types';
import { TrendingUp, Award, Users, Target, RefreshCw, Calculator, Trophy, Edit2 } from 'lucide-react';
import { LoadingSpinner } from './LoadingSpinner';
import { StandingEditor } from './StandingEditor';
import { confirmDialog, notify, notifyError } from './Dialog';

export const Statistics: React.FC = () => {
  const { teams, matches, groups, pools, courts, refreshData, recalculateAllStatistics, isLoading, isInitialized } = useTournamentStore();
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [editingStanding, setEditingStanding] = useState<Standing | null>(null);

  // Real-time subscriptions in useRealtimeSubscriptions hook handle all updates
  // No component-level polling needed - reduces database load significantly

  // Standings tables: one per pool (or per group when a group has no pools).
  // A group that only plays knockouts (no pool matches) has no table.
  const standings = useMemo(
    () => getStandings(groups, pools).filter(s => standingHasPoolMatches(s.id, matches)),
    [groups, pools, matches]
  );

  const stats = useMemo(() => {
    return calculations.calculateTournamentStats(teams, matches, standings.map(s => s.id));
  }, [teams, matches, standings]);

  // Use teams directly from store (stats are now persisted in database)
  const teamsWithStats = useMemo(() => teams, [teams]);

  // Per-standing statistics
  const standingStats = useMemo(() => {
    const result: { [standingId: string]: { teams: Team[] } } = {};
    standings.forEach(standing => {
      const standingTeams = teamsWithStats.filter(t => standingIdOf(t) === standing.id);
      result[standing.id] = {
        teams: standingTeams,

      };
    });
    return result;
  }, [teamsWithStats, standings]);

  // Show loader during initial data fetch
  if (isLoading && !isInitialized) {
    return <LoadingSpinner size="lg" text="Loading Statistics..." />;
  }

  const handleRecalculate = async () => {
    if (await confirmDialog({
      title: 'Recalculate statistics?',
      message: 'Team stats will be rebuilt from the results of completed pool matches. Admin edits to standings are kept.',
      confirmText: 'Recalculate'
    })) {
      setIsRecalculating(true);
      try {
        await recalculateAllStatistics();
        notify('All team stats have been rebuilt from match results.', { tone: 'success', title: 'Statistics updated' });
      } catch (error) {
        notifyError(error, 'Could not recalculate statistics. Please try again.');
        console.error(error);
      } finally {
        setIsRecalculating(false);
      }
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-4 sm:p-6">
      {/* Warning banner if statistics might be stale */}
      {teams.some(t =>
        !t.statsOverride && t.stats.points === 0 && t.stats.matchesWon === 0 &&
        matches.some(m => m.status === 'completed' && !isKnockout(m) && (m.team1.id === t.id || m.team2.id === t.id))
      ) && (
        <div className="mb-6 bg-yellow-50 border-2 border-yellow-300 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0">
              <Calculator className="w-6 h-6 text-yellow-600" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-yellow-900 mb-1">
                Statistics May Need Recalculation
              </h3>
              <p className="text-sm text-yellow-800 mb-3">
                Some teams have zero points despite completed matches. This might happen if:
              </p>
              <ul className="text-sm text-yellow-800 list-disc list-inside mb-3 space-y-1">
                <li>The statistics calculation logic was recently updated</li>
                <li>Matches were imported or modified directly in the database</li>
                <li>There was an error during a previous match completion</li>
              </ul>
              <p className="text-sm font-semibold text-yellow-900">
                Click "Recalculate Stats" above to fix this and update all team statistics based on actual match results.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 sm:mb-6">
        <h2 className="text-lg sm:text-2xl font-bold text-gray-800 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 sm:w-6 sm:h-6" />
          Tournament Statistics
        </h2>
        <div className="grid grid-cols-2 sm:flex gap-2">
          <button
            onClick={handleRecalculate}
            disabled={isLoading || isRecalculating}
            className="flex items-center justify-center gap-2 px-3 sm:px-4 py-2.5 sm:py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Recalculate all statistics from matches"
          >
            <Calculator className={`w-4 h-4 ${isRecalculating ? 'animate-spin' : ''}`} />
            {isRecalculating ? 'Recalculating...' : 'Recalculate Stats'}
          </button>
          <button
            onClick={() => refreshData()}
            disabled={isLoading || isRecalculating}
            className="flex items-center justify-center gap-2 px-3 sm:px-4 py-2.5 sm:py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Manually refresh data"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Overall Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <Target className="w-6 h-6 sm:w-8 sm:h-8 text-blue-600 flex-shrink-0" />
            <div>
              <p className="text-sm text-gray-600">Total Matches</p>
              <p className="text-xl sm:text-2xl font-bold text-gray-800">{stats.totalMatches}</p>
            </div>
          </div>
        </div>
        <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <Award className="w-6 h-6 sm:w-8 sm:h-8 text-green-600 flex-shrink-0" />
            <div>
              <p className="text-sm text-gray-600">Completed</p>
              <p className="text-xl sm:text-2xl font-bold text-gray-800">{stats.completedMatches}</p>
            </div>
          </div>
        </div>
        <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <Users className="w-6 h-6 sm:w-8 sm:h-8 text-purple-600 flex-shrink-0" />
            <div>
              <p className="text-sm text-gray-600">Total Teams</p>
              <p className="text-xl sm:text-2xl font-bold text-gray-800">{teams.length}</p>
            </div>
          </div>
        </div>
        <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-lg p-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <TrendingUp className="w-6 h-6 sm:w-8 sm:h-8 text-yellow-600 flex-shrink-0" />
            <div>
              <p className="text-sm text-gray-600">Groups</p>
              <p className="text-xl sm:text-2xl font-bold text-gray-800">{groups.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Overall Best - Only show if there are completed matches */}
      {stats.completedMatches > 0 && stats.overallBestTeam && (
        <div className="mb-6 sm:mb-8 p-3 sm:p-6 bg-gradient-to-r from-yellow-100 to-orange-100 rounded-lg border-2 border-yellow-300">
          <h3 className="text-lg sm:text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Award className="w-6 h-6 text-yellow-600" />
            🏆 Overall Tournament Leader
          </h3>
          <div className="bg-white rounded-lg p-4">
            <div className="flex flex-wrap justify-between items-center gap-3">
              <div className="min-w-0">
                <h4 className="text-xl sm:text-2xl font-bold text-gray-800 break-words">{stats.overallBestTeam.name}</h4>
                <p className="text-gray-600">
                  {stats.overallBestTeam.players.map(p => p.name).join(' & ')}
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  {teamGroupLabel(stats.overallBestTeam, groups, pools)}
                </p>
              </div>
              <div className="text-right">
                <div className="text-2xl sm:text-3xl font-bold text-yellow-600">
                  {stats.overallBestTeam.stats.matchesWon} {stats.overallBestTeam.stats.matchesWon === 1 ? 'win' : 'wins'}
                </div>
                <div className="text-sm text-gray-600">
                  Sets {signed(setDiffOf(stats.overallBestTeam))} · Pts {signed(pointDiffOf(stats.overallBestTeam))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Leader of each pool - Only show if there are completed matches */}
      {stats.completedMatches > 0 && (
        <div className="mb-6 sm:mb-8">
          <h3 className="text-lg sm:text-xl font-bold text-gray-800 mb-4">Pool Leaders</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {standings.map(standing => {
              const bestTeam = stats.bestTeamByStanding[standing.id];
              return bestTeam ? (
                <div key={standing.id} className="border-2 border-gray-200 rounded-lg p-4 hover:shadow-lg transition">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                    <h4 className="font-bold text-gray-700">{standing.name}</h4>
                  </div>
                  <div className="bg-gray-50 rounded p-3">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="font-semibold text-gray-800">{bestTeam.name}</p>
                        <p className="text-xs text-gray-600">
                          {bestTeam.players.map(p => p.name).join(' & ')}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-blue-600">{bestTeam.stats.matchesWon}W–{bestTeam.stats.matchesLost}L</p>
                        <p className="text-xs text-gray-600">
                          Sets {signed(setDiffOf(bestTeam))} · Pts {signed(pointDiffOf(bestTeam))}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null;
            })}
          </div>
        </div>
      )}

      {/* Standings per pool */}
      <div className="mb-6 sm:mb-8">
        <h3 className="text-lg sm:text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
          <TrendingUp className="w-6 h-6 text-purple-600" />
          Standings by Group & Pool
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {standings.map(standing => {
            const stats = standingStats[standing.id];
            if (!stats) return null;

            return (
              <div key={standing.id} className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-lg p-4 border-2 border-purple-200">
                <h4 className="font-bold text-purple-900 mb-3 flex items-center justify-between gap-2">
                  <span className="min-w-0 break-words">
                    {standing.name}
                    {stats.teams.some(t => t.standingRank != null) && (
                      <span className="ml-2 align-middle text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-orange-100 text-orange-700">Manual</span>
                    )}
                  </span>
                  <button
                    onClick={() => setEditingStanding(standing)}
                    className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-purple-200 text-xs font-semibold text-purple-700 hover:bg-purple-100 transition"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    Edit
                  </button>
                </h4>


                {/* All Teams in Pool */}
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-gray-600 mb-2">Team Rankings</div>
                  {sortStanding(stats.teams, matches)
                    .map((team, index) => (
                      <div key={team.id} className="bg-white rounded-lg p-2 border border-gray-200 hover:shadow-md transition">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <span className={`font-bold text-sm flex-shrink-0 ${
                              index === 0 ? 'text-yellow-600' :
                              index === 1 ? 'text-gray-500' :
                              index === 2 ? 'text-orange-600' :
                              'text-gray-400'
                            }`}>
                              {index === 0 && '🥇'}
                              {index === 1 && '🥈'}
                              {index === 2 && '🥉'}
                              {index > 2 && `#${index + 1}`}
                            </span>
                            <span className="text-sm font-semibold text-gray-800 truncate">{team.name}</span>
                            {team.statsOverride && <span className="text-[10px] text-orange-600 flex-shrink-0" title="Edited by admin">✎</span>}
                          </div>
                          <div className="font-bold text-purple-700 flex-shrink-0 ml-2 tabular-nums">
                            <span className="text-green-600">{team.stats.matchesWon}W</span>
                            <span className="text-gray-400">–</span>
                            <span className="text-red-600">{team.stats.matchesLost}L</span>
                          </div>
                        </div>
                        <div className="flex justify-between items-center text-xs text-gray-600 ml-6">
                          <span className="truncate">{team.players.map((p: any) => p.name).join(' & ')}</span>
                          <span className="text-xs flex-shrink-0 ml-2 tabular-nums">
                            Sets {signed(setDiffOf(team))} · Pts {signed(pointDiffOf(team))}
                          </span>
                        </div>
                      </div>
                    ))}
                  {stats.teams.length === 0 && (
                    <div className="text-center py-4 text-gray-400 text-sm">
                      No teams in this pool
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Team Leaderboard */}
      <div className="mb-6 sm:mb-8">
        <h3 className="text-lg sm:text-xl font-bold text-gray-800 mb-4">Team Leaderboard</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-2 sm:px-4 py-3 text-left text-xs sm:text-sm font-semibold text-gray-700">#</th>
                <th className="px-2 sm:px-4 py-3 text-left text-xs sm:text-sm font-semibold text-gray-700">Team</th>
                <th className="hidden md:table-cell px-4 py-3 text-left text-sm font-semibold text-gray-700">Group</th>
                <th className="hidden sm:table-cell px-4 py-3 text-center text-sm font-semibold text-gray-700">Played</th>
                <th className="px-2 sm:px-4 py-3 text-center text-xs sm:text-sm font-semibold text-gray-700">W</th>
                <th className="px-2 sm:px-4 py-3 text-center text-xs sm:text-sm font-semibold text-gray-700">L</th>
                <th className="px-2 sm:px-4 py-3 text-center text-xs sm:text-sm font-semibold text-gray-700" title="Set difference">Sets ±</th>
                <th className="px-2 sm:px-4 py-3 text-center text-xs sm:text-sm font-semibold text-gray-700" title="Point difference">Pts ±</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {[...teamsWithStats]
                .sort(compareTeams)
                .map((team, index) => {
                  return (
                    <tr key={team.id} className="hover:bg-gray-50 transition">
                      <td className="px-2 sm:px-4 py-3">
                        <span className={`font-bold ${index < 3 ? 'text-yellow-600' : 'text-gray-600'}`}>
                          {index === 0 && '🥇'}
                          {index === 1 && '🥈'}
                          {index === 2 && '🥉'}
                          {index > 2 && `#${index + 1}`}
                        </span>
                      </td>
                      <td className="px-2 sm:px-4 py-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-800 break-words">{team.name}</p>
                          <p className="text-xs text-gray-500">
                            {team.players.map(p => p.name).join(' & ')}
                          </p>
                        </div>
                      </td>
                      <td className="hidden md:table-cell px-4 py-3 text-sm text-gray-600">
                        {teamGroupLabel(team, groups, pools)}
                      </td>
                      <td className="hidden sm:table-cell px-4 py-3 text-center text-sm">
                        {team.stats.matchesWon + team.stats.matchesLost}
                      </td>
                      <td className="px-2 sm:px-4 py-3 text-center text-sm font-semibold text-green-600">
                        {team.stats.matchesWon}
                      </td>
                      <td className="px-2 sm:px-4 py-3 text-center text-sm font-semibold text-red-600">
                        {team.stats.matchesLost}
                      </td>
                      <td className="px-2 sm:px-4 py-3 text-center text-sm text-gray-700 tabular-nums">
                        {signed(setDiffOf(team))}
                      </td>
                      <td className="px-2 sm:px-4 py-3 text-center text-base font-bold text-blue-600 tabular-nums">
                        {signed(pointDiffOf(team))}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
          {teamsWithStats.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              <Users className="w-16 h-16 mx-auto mb-4 text-gray-300" />
              <p>No teams data available</p>
            </div>
          )}
        </div>
      </div>

      {/* Courts with Completed Matches */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <h3 className="text-lg sm:text-xl font-bold text-gray-800">Court Activity & Completed Matches</h3>
          <div className="text-sm bg-blue-100 text-blue-800 px-3 py-1 rounded-lg font-semibold">
            Total Completed: {matches.filter(m => m.status === 'completed').length}
          </div>
        </div>

        {/* Show ALL completed matches in a single section */}
        {(() => {
          const allCompletedMatches = matches.filter(m => m.status === 'completed');
          if (allCompletedMatches.length > 0) {
            return (
              <div className="mb-6 bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-300 rounded-lg p-3 sm:p-6">
                <h4 className="text-lg font-bold text-blue-900 mb-4 flex items-center gap-2">
                  <Trophy className="w-6 h-6 text-yellow-500" />
                  All Completed Matches ({allCompletedMatches.length})
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[70vh] sm:max-h-[600px] overflow-y-auto">
                  {[...allCompletedMatches].reverse().map(match => {
                    const matchCourt = courts.find(c => c.id === match.courtId);
                    return (
                      <div key={match.id} className="bg-white rounded-lg p-4 border-2 border-blue-200 shadow-sm hover:shadow-md transition">
                        {/* Court info */}
                        {matchCourt && (
                          <div className="text-xs text-gray-500 mb-2 flex items-center justify-between">
                            <span>🏟️ {matchCourt.name}</span>
                            <span className="text-gray-400">Ref: {matchCourt.refereeName}</span>
                          </div>
                        )}
                        {!matchCourt && (
                          <div className="text-xs text-yellow-600 mb-2">
                            ⚠️ No court assigned
                          </div>
                        )}

                        {/* Match details */}
                        <div className="mb-3">
                          {isKnockout(match) && (
                            <div className="text-xs font-bold uppercase text-yellow-700 mb-1">🏆 {match.matchName || 'Knockout'}</div>
                          )}
                          <div className="text-sm font-semibold text-gray-800 mb-1">
                            {match.team1.name}
                          </div>
                          <div className="text-xs text-gray-500 mb-2">vs</div>
                          <div className="text-sm font-semibold text-gray-800">
                            {match.team2.name}
                          </div>
                        </div>

                        {/* Score */}
                        <div className="bg-blue-50 rounded-lg p-3 mb-2">
                          <div className="text-center mb-2">
                            <span className="text-xs text-gray-600">Sets Won</span>
                            <div className="text-2xl font-bold text-blue-600">
                              {match.score.team1} - {match.score.team2}
                            </div>
                          </div>

                          {/* Set by set scores */}
                          <div className="border-t border-blue-200 pt-2">
                            <div className="text-xs text-gray-600 mb-1">Set Scores:</div>
                            <div className="flex justify-center gap-3">
                              {match.sets.map((set) => (
                                <span key={`${match.id}-set-${set.setNumber}`} className="font-mono text-sm font-semibold text-gray-700">
                                  {set.score.team1}-{set.score.team2}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Winner */}
                        {match.winner && (
                          <div className="bg-green-50 rounded-lg p-2 text-center border border-green-200">
                            <div className="text-xs text-green-700 font-semibold flex items-center justify-center gap-1">
                              <Trophy className="w-4 h-4 text-yellow-500" />
                              Winner: {match.winner.name}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          }
          return (
            <div className="mb-6 bg-gray-50 rounded-lg p-8 sm:p-12 text-center border-2 border-gray-200">
              <div className="text-gray-400 text-lg">No completed matches yet</div>
            </div>
          );
        })()}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {courts.map(court => {
            const completedMatches = matches.filter(m => m.courtId === court.id && m.status === 'completed');
            const liveMatch = matches.find(m => m.courtId === court.id && m.status === 'live');
            const upcomingMatches = matches.filter(m => m.courtId === court.id && m.status === 'upcoming');

            return (
              <div key={court.id} className="bg-gradient-to-br from-gray-50 to-blue-50 rounded-lg p-4 border-2 border-gray-200">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-bold text-gray-800 text-lg">{court.name}</h4>
                  <div className="text-xs font-semibold px-2 py-1 rounded bg-purple-100 text-purple-700">
                    {completedMatches.length} Completed
                  </div>
                </div>

                <div className="text-xs text-gray-600 mb-3">
                  <p>Referee: <span className="font-semibold">{court.refereeName}</span></p>
                  <p className="mt-1">
                    <span className="text-green-600 font-semibold">{liveMatch ? '🔴 Live' : upcomingMatches.length > 0 ? `${upcomingMatches.length} Queued` : 'Idle'}</span>
                  </p>
                </div>

                {/* Completed Matches */}
                {completedMatches.length > 0 ? (
                  <div className="mt-3">
                    <div className="text-xs font-semibold text-blue-700 mb-2">
                      ✓ All Completed Matches ({completedMatches.length})
                    </div>
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {[...completedMatches]
                        .reverse()
                        .map(match => (
                          <div key={match.id} className="bg-white rounded-lg p-3 border border-blue-200 shadow-sm">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-semibold text-gray-700 truncate">
                                {match.team1.name} vs {match.team2.name}
                              </span>
                            </div>
                            <div className="flex flex-wrap justify-between items-center gap-x-2 mb-1">
                              <span className={`text-xs ${match.winner?.id === match.team1.id ? 'text-green-700 font-bold' : 'text-gray-600'}`}>
                                {match.team1.name}: {match.score.team1} sets
                              </span>
                              <span className={`text-xs ${match.winner?.id === match.team2.id ? 'text-green-700 font-bold' : 'text-gray-600'}`}>
                                {match.team2.name}: {match.score.team2} sets
                              </span>
                            </div>
                            {match.winner && (
                              <div className="text-xs text-center text-green-700 font-semibold mt-1 pt-1 border-t border-gray-200">
                                🏆 Winner: {match.winner.name}
                              </div>
                            )}
                            {/* Show set-by-set scores */}
                            <div className="mt-2 pt-2 border-t border-gray-100">
                              <div className="flex justify-between text-xs text-gray-500">
                                <span>Sets:</span>
                                <div className="flex gap-2">
                                  {match.sets.map((set) => (
                                    <span key={`${match.id}-set-${set.setNumber}`} className="font-mono">
                                      {set.score.team1}-{set.score.team2}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-6 text-gray-400 text-sm">
                    <p>No completed matches yet</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {editingStanding && (
        <StandingEditor
          standing={editingStanding}
          teams={sortStanding(standingStats[editingStanding.id]?.teams ?? [], matches)}
          onClose={() => setEditingStanding(null)}
        />
      )}
    </div>
  );
};
