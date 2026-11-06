import { supabase } from '../lib/supabase';
import { Team, TeamStats, StatsOverride, Match, Court, Referee, Group, Pool, ScoreAction } from '../types';

// Teams
export const getTeams = async (): Promise<Team[]> => {
  const { data, error } = await supabase.from('teams').select('*');
  if (error) throw error;
  
  // "stats" in the database is always computed from matches; the admin override (if any) is what gets shown
  const teams = (data || []).map(({ created_at: _createdAt, ...team }) => {
    const computedStats = team.stats || { matchesWon: 0, matchesLost: 0, points: 0 };
    return {
      ...team,
      poolId: team.poolId ?? null,
      statsOverride: team.statsOverride ?? null,
      standingRank: team.standingRank ?? null,
      computedStats,
      // Won/lost from the admin override if set (the store recomputes everything from matches on load)
      stats: team.statsOverride
        ? { ...computedStats, matchesWon: team.statsOverride.matchesWon, matchesLost: team.statsOverride.matchesLost }
        : computedStats
    };
  }) as Team[];
  
  return teams;
};

export const saveTeam = async (team: Team): Promise<void> => {
  // Only the team's details. Stats, overrides and ranks have their own functions below so
  // editing a team never overwrites them (new rows get the column default stats).
  // poolId must be null (not undefined) so it can be cleared.
  const teamData = {
    id: team.id,
    name: team.name,
    players: team.players,
    groupId: team.groupId,
    poolId: team.poolId ?? null
  };
  
  const { error } = await supabase.from('teams').upsert(teamData);
  if (error) {
    console.error('[SAVE_TEAM] Error:', error);
    throw error;
  }
  
};

/** Save stats computed from match results. */
export const saveTeamStats = async (teamId: string, stats: TeamStats): Promise<void> => {
  const { error } = await supabase.from('teams').update({ stats }).eq('id', teamId);
  if (error) throw error;
};

/** Set (or clear with null) the admin-entered stats for a team. */
export const saveTeamStatsOverride = async (teamId: string, statsOverride: StatsOverride | null): Promise<void> => {
  const { error } = await supabase.from('teams').update({ statsOverride }).eq('id', teamId);
  if (error) throw error;
};

/** Set (or clear with null) the admin-set position of a team in its pool. */
export const saveTeamStandingRank = async (teamId: string, standingRank: number | null): Promise<void> => {
  const { error } = await supabase.from('teams').update({ standingRank }).eq('id', teamId);
  if (error) throw error;
};

export const deleteTeam = async (id: string): Promise<void> => {
  const { error } = await supabase.from('teams').delete().eq('id', id);
  if (error) throw error;
};

// Matches
export const getMatches = async (): Promise<Match[]> => {
  // Queue position first (fixture order = chronological), then court, so every list shows matches in play order
  const { data, error } = await supabase
    .from('matches')
    .select('*')
    .order('queueOrder', { ascending: true, nullsFirst: false })
    .order('courtId', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
};

export const saveMatch = async (match: Match): Promise<void> => {
  
  try {
    // Create a clean copy without computed properties
    const matchData = {
      id: match.id,
      team1: match.team1,
      team2: match.team2,
      score: match.score,
      sets: match.sets || [{ setNumber: 1, score: { team1: 0, team2: 0 } }],
      currentSetNumber: match.currentSetNumber || 1,
      servingTeam: match.servingTeam || 'team1',
      team1Position: match.team1Position || 'left',
      team2Position: match.team2Position || 'right',
      winner: match.winner ?? null, // null clears the column (undefined is dropped by upsert)
      status: match.status,
      courtId: match.courtId ?? null, // Convert undefined to null for database
      pendingApproval: match.pendingApproval ?? false,
      requestedBy: match.requestedBy ?? null,
      queueOrder: match.queueOrder ?? null, // Convert undefined to null for database
      scheduledTime: match.scheduledTime ?? null,
      stage: match.stage ?? 'pool',
      matchName: match.matchName ?? null,
      bracketSlot: match.bracketSlot ?? null,
      courtPositions: match.courtPositions ?? {},
      history: match.history || [] // Save history array for undo tracking
    };
    
    
    const { error } = await supabase.from('matches').upsert(matchData);
    
    if (error) {
      console.error('[SAVE_MATCH] Supabase error:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      });
      throw error;
    }
    
  } catch (err) {
    console.error('[SAVE_MATCH] Unexpected error:', err);
    throw err;
  }
};

export const deleteMatch = async (id: string): Promise<void> => {
  const { error } = await supabase.from('matches').delete().eq('id', id);
  if (error) throw error;
};

// Courts
export const getCourts = async (): Promise<Court[]> => {
  const { data, error } = await supabase.from('courts').select('*');
  if (error) throw error;
  return data || [];
};

export const saveCourt = async (court: Court): Promise<void> => {
  // Create a clean copy without computed properties (matches, match)
  const courtData = {
    id: court.id,
    name: court.name,
    refereeId: court.refereeId,
    refereeName: court.refereeName
  };
  
  const { error } = await supabase.from('courts').upsert(courtData);
  if (error) {
    console.error('Error saving court:', error);
    throw error;
  }
};

export const deleteCourt = async (id: string): Promise<void> => {
  const { error } = await supabase.from('courts').delete().eq('id', id);
  if (error) throw error;
};

// Referees
export const getReferees = async (): Promise<Referee[]> => {
  const { data, error } = await supabase.from('referees').select('*');
  if (error) throw error;
  return data || [];
};

export const saveReferee = async (referee: Referee): Promise<void> => {
  const { error } = await supabase.from('referees').upsert(referee);
  if (error) throw error;
};

export const deleteReferee = async (id: string): Promise<void> => {
  const { error } = await supabase.from('referees').delete().eq('id', id);
  if (error) throw error;
};

export const authenticateReferee = async (username: string, password: string): Promise<Referee | null> => {
  const { data, error } = await supabase
    .from('referees')
    .select('*')
    .eq('username', username)
    .eq('password', password)
    .single();
  
  if (error || !data) return null;
  return data;
};

// Groups
export const getGroups = async (): Promise<Group[]> => {
  const { data, error } = await supabase.from('groups').select('id, name');
  if (error) throw error;
  return data || [];
};

export const saveGroup = async (group: Group): Promise<void> => {
  const { error } = await supabase.from('groups').upsert({ id: group.id, name: group.name });
  if (error) throw error;
};

export const deleteGroup = async (id: string): Promise<void> => {
  const { error } = await supabase.from('groups').delete().eq('id', id);
  if (error) throw error;
};

// Pools
export const getPools = async (): Promise<Pool[]> => {
  const { data, error } = await supabase.from('pools').select('id, name, groupId');
  if (error) throw error;
  return data || [];
};

export const savePool = async (pool: Pool): Promise<void> => {
  const { error } = await supabase.from('pools').upsert({ id: pool.id, name: pool.name, groupId: pool.groupId });
  if (error) throw error;
};

export const deletePool = async (id: string): Promise<void> => {
  const { error } = await supabase.from('pools').delete().eq('id', id);
  if (error) throw error;
};

// Score History
export const getScoreHistory = async (matchId: string): Promise<ScoreAction[]> => {
  const { data, error } = await supabase
    .from('score_history')
    .select('*')
    .eq('matchId', matchId)
    .order('timestamp', { ascending: false });
  if (error) throw error;
  return data || [];
};

export const saveScoreAction = async (action: ScoreAction): Promise<void> => {
  const { error } = await supabase.from('score_history').insert(action);
  if (error) throw error;
};

export const deleteLastScoreAction = async (matchId: string): Promise<void> => {
  const history = await getScoreHistory(matchId);
  if (history.length > 0) {
    const { error } = await supabase
      .from('score_history')
      .delete()
      .eq('timestamp', history[0].timestamp);
    if (error) throw error;
  }
};

const check = (result: { error: unknown }) => {
  if (result.error) throw result.error;
};

/**
 * Reset scores only.
 * Every match goes back to "upcoming" with 0-0 and no sets, history or winner; score history is cleared;
 * team stats go to zero and admin standing edits (overrides, manual positions) are removed.
 * Groups, pools, teams, matches (with their court and queue position), courts and referees are kept.
 */
export const resetScores = async (): Promise<void> => {
  check(await supabase.from('score_history').delete().neq('matchId', ''));
  check(await supabase
    .from('matches')
    .update({
      status: 'upcoming',
      score: { team1: 0, team2: 0 },
      sets: [{ setNumber: 1, score: { team1: 0, team2: 0 } }],
      currentSetNumber: 1,
      servingTeam: 'team1',
      team1Position: 'left',
      team2Position: 'right',
      history: [],
      winner: null,
      pendingApproval: false,
      requestedBy: null,
      courtPositions: {}
    })
    .neq('id', ''));
  check(await supabase
    .from('teams')
    .update({ stats: { matchesWon: 0, matchesLost: 0, points: 0 }, statsOverride: null, standingRank: null })
    .neq('id', ''));
};

/**
 * Reset everything: delete all data so the app starts empty.
 * Order respects foreign keys (matches/referees -> courts, teams -> pools -> groups).
 */
export const resetEverything = async (): Promise<void> => {
  check(await supabase.from('score_history').delete().neq('matchId', ''));
  check(await supabase.from('matches').delete().neq('id', ''));
  check(await supabase.from('referees').delete().neq('id', ''));
  check(await supabase.from('teams').delete().neq('id', ''));
  check(await supabase.from('pools').delete().neq('id', ''));
  check(await supabase.from('groups').delete().neq('id', ''));
  check(await supabase.from('courts').delete().neq('id', ''));
};
