import { Team, TeamStats, Match, TournamentStats, Player, Group, Pool, Standing } from '../types';

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });

const isPoolMatch = (m: Match) => m.stage !== 'semifinal' && m.stage !== 'final';

/** Set difference (sets won − sets lost); an admin-entered value wins. */
export const setDiffOf = (team: Team): number =>
  team.statsOverride?.setDiff ?? (team.stats.setsWon ?? 0) - (team.stats.setsLost ?? 0);

/** Point difference (points scored − conceded); an admin-entered value wins. */
export const pointDiffOf = (team: Team): number =>
  team.statsOverride?.pointDiff ?? team.stats.points - (team.stats.pointsAgainst ?? 0);

/** Format a difference with a sign: +5, 0, −3. */
export const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0');

/**
 * Overall comparison (across pools, e.g. the overall leaderboard):
 * matches won, then set difference, then point difference, then points scored.
 */
export const compareTeams = (a: Team, b: Team) =>
  b.stats.matchesWon - a.stats.matchesWon ||
  setDiffOf(b) - setDiffOf(a) ||
  pointDiffOf(b) - pointDiffOf(a) ||
  b.stats.points - a.stats.points;

/** Head-to-head: -1 if a beat b in a completed pool match, 1 if b beat a, 0 if they haven't played. */
const headToHead = (a: Team, b: Team, matches: Match[]): number => {
  const m = matches.find(
    x => x.status === 'completed' && isPoolMatch(x) && x.winner &&
      ((x.team1.id === a.id && x.team2.id === b.id) || (x.team1.id === b.id && x.team2.id === a.id))
  );
  if (!m?.winner) return 0;
  return m.winner.id === a.id ? -1 : 1;
};

/** Split teams into groups with equal value of key (highest first). */
const partition = (teams: Team[], key: (t: Team) => number): Team[][] => {
  const values = [...new Set(teams.map(key))].sort((x, y) => y - x);
  return values.map(v => teams.filter(t => key(t) === v));
};

/**
 * Order teams tied on matches won, following the BWF group-stage rules:
 *  - two tied: the winner of the match between them goes above;
 *  - three or more tied: set difference, then point difference; whenever exactly two remain tied, head-to-head.
 * Anything still tied: points scored, then name (in place of drawing lots).
 */
const breakTie = (tied: Team[], matches: Match[]): Team[] => {
  if (tied.length <= 1) return tied;
  const fallback = (t: Team[]) => [...t].sort((a, b) => b.stats.points - a.stats.points || byName(a, b));
  if (tied.length === 2) {
    const h = headToHead(tied[0], tied[1], matches);
    if (h !== 0) return h < 0 ? tied : [tied[1], tied[0]];
    // They haven't played each other (yet): set difference, point difference, points scored, name
    return [...tied].sort(
      (a, b) => setDiffOf(b) - setDiffOf(a) || pointDiffOf(b) - pointDiffOf(a) || b.stats.points - a.stats.points || byName(a, b)
    );
  }
  for (const key of [setDiffOf, pointDiffOf]) {
    const parts = partition(tied, key);
    if (parts.length > 1) return parts.flatMap(part => breakTie(part, matches));
  }
  return fallback(tied);
};

/**
 * Sort the teams of one standings table (pool): admin-set positions first (standingRank 1, 2, …),
 * then everyone else by matches won, with ties broken by the BWF rules (see breakTie).
 * Pass the matches so head-to-head results can be used.
 */
export const sortStanding = (teams: Team[], matches: Match[] = []): Team[] => {
  const manual = teams.filter(t => t.standingRank != null).sort((a, b) => a.standingRank! - b.standingRank!);
  const auto = teams.filter(t => t.standingRank == null);
  return [...manual, ...partition(auto, t => t.stats.matchesWon).flatMap(tied => breakTie(tied, matches))];
};

/** Effective stats: computed from matches, with the admin's won/lost numbers when overridden. */
export const withOverride = (computed: TeamStats, override?: Team['statsOverride']): TeamStats =>
  override ? { ...computed, matchesWon: override.matchesWon, matchesLost: override.matchesLost } : computed;

/**
 * Doubles positions in the current set: which player of a team stands in the RIGHT service court.
 * Rally scoring: a team's players swap service courts only when that team wins a point while serving;
 * the receiving side never moves. So: start-of-set position, toggled once per point the team won on its own serve.
 */
export const rightCourtPlayerId = (match: Match, key: 'team1' | 'team2'): string | undefined => {
  const players = match[key].players;
  const setKey = String(match.currentSetNumber || 1);
  const startRight = match.courtPositions?.[setKey]?.[key] ?? players[0]?.id;
  const swaps = (match.history || []).filter(
    e => e.setNumber === (match.currentSetNumber || 1) && e.team === key && e.serveBefore === key
  ).length;
  if (swaps % 2 === 0) return startRight;
  return players.find(p => p.id !== startRight)?.id ?? startRight;
};

export const isKnockout = (match: Pick<Match, 'stage'>) => match.stage === 'semifinal' || match.stage === 'final';

/** Group of a match (both teams are always in the same group). */
export const matchGroupId = (match: Pick<Match, 'team1'>) => match.team1.groupId;

/** Knockout matches of one group: semi-finals by bracket slot (1, 2) and the final. */
export const getKnockout = (matches: Match[], groupId: string) => {
  const groupKnockouts = matches.filter(m => isKnockout(m) && matchGroupId(m) === groupId);
  const semis = groupKnockouts.filter(m => m.stage === 'semifinal');
  return {
    semi1: semis.find(m => m.bracketSlot === 1) ?? semis.find(m => m.bracketSlot == null),
    semi2: semis.find(m => m.bracketSlot === 2) ?? semis.filter(m => m.bracketSlot == null)[1],
    final: groupKnockouts.find(m => m.stage === 'final')
  };
};

/** True when a standings table has at least one pool-stage match (a knockout-only group has none). */
export const standingHasPoolMatches = (standingId: string, matches: Match[]) =>
  matches.some(m => !isKnockout(m) && standingIdOf(m.team1) === standingId);

/** The standings table a team is ranked in: its pool, or its group when the group has no pools. */
export const standingIdOf = (team: Pick<Team, 'groupId' | 'poolId'>): string => team.poolId || team.groupId;

export const sortGroups = (groups: Group[]): Group[] => [...groups].sort(byName);
export const sortPools = (pools: Pool[]): Pool[] => [...pools].sort(byName);
export const sortByName = <T extends { name: string }>(items: T[]): T[] => [...items].sort(byName);

/** All standings tables in display order: group by group, pool by pool. */
export const getStandings = (groups: Group[], pools: Pool[]): Standing[] =>
  sortGroups(groups).flatMap(group => {
    const groupPools = sortPools(pools.filter(p => p.groupId === group.id));
    if (groupPools.length === 0) {
      return [{ id: group.id, groupId: group.id, name: group.name, shortName: group.name }];
    }
    return groupPools.map(pool => ({
      id: pool.id,
      groupId: group.id,
      name: `${group.name} · ${pool.name}`,
      shortName: pool.name
    }));
  });

/** Label for a match: "Group A - Mens · Pool 1" for pool matches, "Group A - Mens · Semi-final 1" for knockouts. */
export const matchLabel = (match: Match, groups: Group[], pools: Pool[]): string => {
  if (isKnockout(match)) {
    const group = groups.find(g => g.id === matchGroupId(match));
    const name = match.matchName || (match.stage === 'final' ? 'Final' : 'Semi-final');
    return group ? `${group.name} · ${name}` : name;
  }
  return teamGroupLabel(match.team1, groups, pools);
};

/** Human label for where a team plays, e.g. "Group A - Mens · Pool 1". */
export const teamGroupLabel = (team: Pick<Team, 'groupId' | 'poolId'>, groups: Group[], pools: Pool[]): string => {
  const group = groups.find(g => g.id === team.groupId);
  const pool = team.poolId ? pools.find(p => p.id === team.poolId) : undefined;
  if (!group) return 'No group';
  return pool ? `${group.name} · ${pool.name}` : group.name;
};

export const calculations = {
  /**
   * Calculate statistics for all teams based on completed matches
   * Uses existing schema: stats.points stores total badminton points scored
   */
  calculateTeamStats: (teams: Team[], matches: Match[]): Team[] => {
    const updatedTeams = teams.map(team => ({
      ...team,
      stats: {
        matchesWon: 0,
        matchesLost: 0,
        points: 0, // Total badminton points scored across all sets
        pointsAgainst: 0,
        setsWon: 0,
        setsLost: 0
      }
    }));

    // Only pool matches count toward standings; semi-finals and finals don't
    const completedMatches = matches.filter(m => m.status === 'completed' && !isKnockout(m));

    completedMatches.forEach(match => {
      const { team1, team2, sets, winner } = match;

      // Calculate total badminton points scored by each team across all sets
      const team1PointsScored = sets.reduce((sum, set) => sum + set.score.team1, 0);
      const team2PointsScored = sets.reduce((sum, set) => sum + set.score.team2, 0);

      const team1Ref = updatedTeams.find(t => t.id === team1.id);
      const team2Ref = updatedTeams.find(t => t.id === team2.id);

      if (!team1Ref || !team2Ref) return;

      // Points scored / conceded and sets won / lost (sets with no points are ignored)
      team1Ref.stats.points += team1PointsScored;
      team2Ref.stats.points += team2PointsScored;
      team1Ref.stats.pointsAgainst! += team2PointsScored;
      team2Ref.stats.pointsAgainst! += team1PointsScored;
      sets.forEach(set => {
        if (set.score.team1 > set.score.team2) {
          team1Ref.stats.setsWon! += 1;
          team2Ref.stats.setsLost! += 1;
        } else if (set.score.team2 > set.score.team1) {
          team2Ref.stats.setsWon! += 1;
          team1Ref.stats.setsLost! += 1;
        }
      });

      // Update match wins/losses
      if (winner) {
        if (winner.id === team1Ref.id) {
          team1Ref.stats.matchesWon += 1;
          team2Ref.stats.matchesLost += 1;
        } else if (winner.id === team2Ref.id) {
          team2Ref.stats.matchesWon += 1;
          team1Ref.stats.matchesLost += 1;
        }
      }
    });

    return updatedTeams;
  },

  /**
   * Get the best team in one standings table (pool, or group without pools)
   * Ranking criteria: 1) Matches won, 2) Total points scored (tiebreaker)
   */
  getBestTeamInStanding: (teams: Team[], standingId: string, matches: Match[] = []): Team | undefined => {
    return sortStanding(teams.filter(team => standingIdOf(team) === standingId), matches)[0];
  },

  /**
   * Get overall best team across all groups
   * Ranking criteria: 1) Matches won, 2) Total points scored (tiebreaker)
   */
  getOverallBestTeam: (teams: Team[]): Team | undefined => {
    return [...teams].sort(compareTeams)[0];
  },

  // Calculate player wins
  calculatePlayerWins: (matches: Match[]): Map<string, number> => {
    const playerWins = new Map<string, number>();

    matches.forEach(match => {
      if (match.status === 'completed' && match.winner) {
        match.winner.players.forEach(player => {
          const currentWins = playerWins.get(player.id) || 0;
          playerWins.set(player.id, currentWins + 1);
        });
      }
    });

    return playerWins;
  },

  // Get best player overall
  getBestPlayer: (teams: Team[], matches: Match[]): { player: Player; wins: number } | undefined => {
    const playerWins = calculations.calculatePlayerWins(matches);
    
    let bestPlayer: Player | undefined;
    let maxWins = 0;

    teams.forEach(team => {
      team.players.forEach(player => {
        const wins = playerWins.get(player.id) || 0;
        if (wins > maxWins) {
          maxWins = wins;
          bestPlayer = player;
        }
      });
    });

    return bestPlayer ? { player: bestPlayer, wins: maxWins } : undefined;
  },

  // Get best player in one standings table
  getBestPlayerInStanding: (teams: Team[], matches: Match[], standingId: string): { player: Player; wins: number } | undefined => {
    const standingTeams = teams.filter(team => standingIdOf(team) === standingId);
    const playerWins = calculations.calculatePlayerWins(matches);
    
    let bestPlayer: Player | undefined;
    let maxWins = 0;

    standingTeams.forEach(team => {
      team.players.forEach(player => {
        const wins = playerWins.get(player.id) || 0;
        if (wins > maxWins) {
          maxWins = wins;
          bestPlayer = player;
        }
      });
    });

    return bestPlayer ? { player: bestPlayer, wins: maxWins } : undefined;
  },

  // Calculate full tournament statistics
  // NOTE: This now uses database-persisted stats instead of recalculating
  calculateTournamentStats: (teams: Team[], matches: Match[], standingIds: string[]): TournamentStats => {
    // Use teams as-is with their database stats (don't recalculate)
    const completedMatches = matches.filter(m => m.status === 'completed').length;

    const bestTeamByStanding: { [standingId: string]: Team } = {};
    const bestPlayerByStanding: { [standingId: string]: { player: Player; wins: number } } = {};

    standingIds.forEach(standingId => {
      const bestTeam = calculations.getBestTeamInStanding(teams, standingId, matches);
      if (bestTeam) {
        bestTeamByStanding[standingId] = bestTeam;
      }

      const bestPlayer = calculations.getBestPlayerInStanding(teams, matches, standingId);
      if (bestPlayer) {
        bestPlayerByStanding[standingId] = bestPlayer;
      }
    });

    return {
      totalMatches: matches.length,
      completedMatches,
      bestTeamByStanding,
      bestPlayerByStanding,
      teams, // Include teams with their database stats
      overallBestTeam: calculations.getOverallBestTeam(teams),
      overallBestPlayer: calculations.getBestPlayer(teams, matches)
    };
  },

  /**
   * Calculate average badminton points scored per match for a team
   */
  calculateAveragePoints: (team: Team, matches: Match[]): number => {
    const teamMatches = matches.filter(m => 
      m.status === 'completed' && (m.team1.id === team.id || m.team2.id === team.id)
    );

    if (teamMatches.length === 0) return 0;

    const totalPoints = teamMatches.reduce((sum, match) => {
      // Sum points from all sets for this team
      const teamPoints = match.sets.reduce((setSum, set) => {
        const points = match.team1.id === team.id ? set.score.team1 : set.score.team2;
        return setSum + points;
      }, 0);
      return sum + teamPoints;
    }, 0);

    return totalPoints / teamMatches.length;
  }
};
