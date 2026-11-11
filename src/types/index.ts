export type MatchStatus = 'upcoming' | 'live' | 'completed' | 'pending_approval';

export interface Player {
  id: string;
  name: string;
}

export interface TeamStats {
  matchesWon: number;
  matchesLost: number;
  points: number; // rally points scored (pool matches)
  pointsAgainst?: number; // rally points conceded
  setsWon?: number;
  setsLost?: number;
}

/** Admin-entered standings numbers, shown instead of the computed ones. */
export interface StatsOverride {
  matchesWon: number;
  matchesLost: number;
  setDiff?: number; // sets won minus sets lost
  pointDiff?: number; // points scored minus points conceded
}

export interface Team {
  id: string;
  name: string;
  players: Player[];
  groupId: string;
  poolId?: string | null; // Set when the team's group has pools
  stats: TeamStats; // Stats shown everywhere: the admin override if set, otherwise computed
  computedStats?: TeamStats; // Stats computed from completed pool matches
  statsOverride?: StatsOverride | null; // Admin-entered standings numbers
  standingRank?: number | null; // Admin-set position in its pool (1 = top); null = automatic
}

export type MatchStage = 'pool' | 'semifinal' | 'final';

export interface Set {
  setNumber: number; // 1, 2, or 3
  score: {
    team1: number; // Points scored (0-17)
    team2: number; // Points scored (0-17)
  };
  winner?: 'team1' | 'team2'; // Winner of this set (if completed)
  locked?: boolean; // true if set manually ended by referee
}

export interface ScoreEvent {
  setNumber: number; // Which set this point was scored in
  team: 'team1' | 'team2'; // Team that scored
  serveBefore: 'team1' | 'team2'; // Serve state before this point
  serveAfter: 'team1' | 'team2'; // Serve state after this point
  timestamp: number; // When the point was scored
}

export interface Match {
  id: string;
  team1: Team;
  team2: Team;
  score: {
    team1: number; // Sets won by team1 (0-2)
    team2: number; // Sets won by team2 (0-2)
  };
  sets: Set[]; // Array of all sets (current + completed)
  currentSetNumber: number; // Current set number (1, 2, or 3)
  servingTeam: 'team1' | 'team2'; // Which team is currently serving (rally scoring)
  team1Position: 'left' | 'right'; // Team 1 court position
  team2Position: 'left' | 'right'; // Team 2 court position
  history: ScoreEvent[]; // Score history for undo functionality
  winner?: Team;
  status: MatchStatus;
  courtId?: string;
  pendingApproval?: boolean;
  requestedBy?: string;
  queueOrder?: number; // For ordering matches in court queue
  scheduledTime?: string | null; // Planned start time from the fixture, e.g. "7:15 PM"
  stage?: MatchStage; // Only 'pool' matches count toward standings (default 'pool')
  matchName?: string | null; // e.g. "Semi-final 1", "Final"
  bracketSlot?: number | null; // Semi-final 1 or 2; final = 1
  pointsPerSet?: 15 | 21 | null; // Set length chosen by the admin; null = 15 for pool, 21 for knockout
  /**
   * Per set number: id of each team's player standing in the RIGHT service court at the start of that set.
   * Current positions are derived from the point history (a team's players swap when it wins a point while serving).
   */
  courtPositions?: Record<string, { team1?: string; team2?: string }> | null;
}

export interface Court {
  id: string;
  name: string;
  refereeId: string;
  refereeName: string;
  match?: Match; // Current active match (for backward compatibility)
  matches?: Match[]; // Queue of matches assigned to this court
}

export interface Group {
  id: string;
  name: string;
}

export interface Pool {
  id: string;
  name: string;
  groupId: string;
}

/**
 * A standings table: a pool, or a whole group when that group has no pools.
 * Teams are ranked against the other teams in the same standing.
 */
export interface Standing {
  id: string; // pool id, or group id for groups without pools
  groupId: string;
  name: string; // e.g. "Group A - Mens · Pool 1" or "Group C - Womens"
  shortName: string; // e.g. "Pool 1" or "Group C - Womens"
}

export interface Referee {
  id: string;
  name: string;
  courtId?: string;
  username: string;
  password: string;
}

export interface TournamentStats {
  totalMatches: number;
  completedMatches: number;
  bestPlayerByStanding: { [standingId: string]: { player: Player; wins: number } };
  bestTeamByStanding: { [standingId: string]: Team };
  teams: Team[]; // Teams with their database-persisted stats
  overallBestTeam?: Team;
  overallBestPlayer?: { player: Player; wins: number };
}

export interface ScoreAction {
  matchId: string;
  team: 'team1' | 'team2';
  timestamp: number;
}
