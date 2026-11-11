import { create } from 'zustand';
import { Team, StatsOverride, Match, MatchStage, Court, Referee, Group, Pool, Set, ScoreEvent } from '../types';
import * as supabaseStorage from '../utils/supabaseStorage';
import { calculations, getKnockout, setRuleFor, setWinnerOf, standingIdOf, withOverride } from '../utils/calculations';

interface TournamentState {
  teams: Team[];
  matches: Match[];
  courts: Court[];
  referees: Referee[];
  groups: Group[];
  pools: Pool[];
  isLoading: boolean;
  isInitialized: boolean;

  // Actions
  initializeData: () => Promise<void>;
  refreshData: () => Promise<void>;
  
  // Team actions
  addTeam: (team: Team) => Promise<void>;
  updateTeam: (teamId: string, updates: Partial<Team>) => Promise<void>;
  deleteTeam: (teamId: string) => Promise<void>;

  // Match actions
  addMatch: (match: Match) => Promise<void>;
  updateMatch: (matchId: string, updates: Partial<Match>) => Promise<void>;
  deleteMatch: (matchId: string) => Promise<void>;
  assignMatchToCourt: (matchId: string, courtId: string) => Promise<void>;
  unassignMatchFromCourt: (matchId: string) => Promise<void>;
  reorderCourtMatches: (courtId: string, matchId: string, direction: 'up' | 'down') => Promise<void>;
  startMatch: (matchId: string) => Promise<void>;
  updateMatchScore: (matchId: string, team: 'team1' | 'team2', points: number) => Promise<void>;
  endSet: (matchId: string, winner: 'team1' | 'team2') => Promise<void>;
  finishMatch: (matchId: string) => Promise<void>;
  requestMatchApproval: (matchId: string, refereeName: string) => Promise<void>;
  approveMatchEnd: (matchId: string) => Promise<void>;
  rejectMatchEnd: (matchId: string) => Promise<void>;
  undoLastScore: (matchId: string) => Promise<void>;

  // Court actions (add/rename/delete throw on failure so the UI can show the message)
  addCourt: (court: Court) => Promise<void>;
  updateCourt: (courtId: string, updates: Partial<Court>) => Promise<void>;
  renameCourt: (courtId: string, name: string) => Promise<void>;
  deleteCourt: (courtId: string) => Promise<void>;

  // Group & pool actions (throw on failure so the UI can show the message)
  addGroup: (name: string) => Promise<void>;
  renameGroup: (groupId: string, name: string) => Promise<void>;
  deleteGroup: (groupId: string) => Promise<void>;
  addPool: (groupId: string, name: string) => Promise<void>;
  renamePool: (poolId: string, name: string) => Promise<void>;
  deletePool: (poolId: string) => Promise<void>;

  // Referee actions
  addReferee: (referee: Referee) => Promise<void>;
  updateReferee: (refereeId: string, updates: Partial<Referee>) => Promise<void>;
  deleteReferee: (refereeId: string) => Promise<void>;
  /** Put a referee on a court, or clear the court with refereeId null. Throws on failure. */
  assignRefereeToCourt: (refereeId: string | null, courtId: string) => Promise<void>;

  // Standings (admin edits; throw on failure)
  /** Save a pool table: entries in display order with their stats (null = use computed). manualOrder pins the order. */
  updateStanding: (standingId: string, entries: { teamId: string; stats: StatsOverride | null }[], manualOrder: boolean) => Promise<void>;
  /** Clear manual positions and stat overrides for a pool table. */
  resetStanding: (standingId: string) => Promise<void>;

  /** Referee court setup: swap which end each team plays from and/or set who serves. Throws on failure. */
  setMatchSetup: (matchId: string, setup: { swapSides?: boolean; servingTeam?: 'team1' | 'team2'; swapPlayers?: 'team1' | 'team2' }) => Promise<void>;

  // Results & knockouts (throw on failure)
  /** Admin enters/edits the result of a match that is not live. */
  setMatchResult: (matchId: string, sets: { team1: number; team2: number }[], winner: 'team1' | 'team2') => Promise<void>;
  createKnockoutMatch: (input: { groupId: string; stage: Exclude<MatchStage, 'pool'>; slot: number; team1Id: string; team2Id: string; name?: string; scheduledTime?: string | null }) => Promise<void>;
  createSemiFinals: (groupId: string, pairs: [string, string][]) => Promise<void>;
  createFinal: (groupId: string) => Promise<void>;

  // Utility
  /** Matches back to 0-0 / upcoming and team stats to zero; all setup data is kept. Throws on failure. */
  resetScores: (resetPassword: string) => Promise<void>;
  /** Delete all data (teams, groups, pools, courts, matches, referees). Throws on failure. */
  resetEverything: (resetPassword: string) => Promise<void>;
  recalculateAllStatistics: () => Promise<void>;
  getTeamStats: () => Team[];
}

/**
 * Recompute every team's stats (wins, losses, points scored) from the completed
 * matches in the database and save the teams whose stats changed.
 * Stats are always derived from match results, so they can never drift or be
 * counted twice (e.g. on a double click or a retried request).
 */
const syncTeamStats = async (): Promise<void> => {
  const [teams, matches] = await Promise.all([
    supabaseStorage.getTeams(),
    supabaseStorage.getMatches()
  ]);
  const updatedTeams = calculations.calculateTeamStats(teams, matches);

  // Only the computed "stats" column is written; admin overrides are left untouched
  await Promise.all(
    updatedTeams
      .filter(team => {
        const before = teams.find(t => t.id === team.id)?.computedStats;
        return JSON.stringify(before) !== JSON.stringify(team.stats);
      })
      .map(team => supabaseStorage.saveTeamStats(team.id, team.stats))
  );
};

/**
 * Mark a match as completed (winner = team with more sets won) and update team stats.
 * Throws if both teams have won the same number of sets, since there is no winner.
 */
const completeMatch = async (match: Match): Promise<void> => {
  if (match.score.team1 === match.score.team2) {
    throw new Error(
      `The match is tied at ${match.score.team1}-${match.score.team2} sets. End the current set first so there is a winner.`
    );
  }
  const winner = match.score.team1 > match.score.team2 ? match.team1 : match.team2;

  // Keep courtId so completed matches can be shown per court
  await supabaseStorage.saveMatch({
    ...match,
    status: 'completed',
    winner,
    pendingApproval: false,
    requestedBy: undefined
  });
  await syncTeamStats();
};

/**
 * Stats shown in the app are always computed from the completed pool matches (so they include sets and points
 * conceded and can never be stale), with the admin's won/lost override applied on top.
 */
const withComputedStats = (teams: Team[], matches: Match[]): Team[] =>
  calculations.calculateTeamStats(teams, matches).map(computed => {
    const team = teams.find(t => t.id === computed.id)!;
    return { ...team, computedStats: computed.stats, stats: withOverride(computed.stats, team.statsOverride) };
  });

/**
 * A court's referee is whoever has referee.courtId === court.id (the single source of truth, also used by the
 * referee panel). The courts.refereeId / refereeName columns are kept in sync on writes but never trusted on read.
 */
const courtReferee = (courtId: string, referees: Referee[]) => {
  const referee = referees.find(r => r.courtId === courtId);
  return { refereeId: referee?.id ?? '', refereeName: referee?.name ?? 'Unassigned' };
};

/**
 * Put a referee on a court (or none, with refereeId null): any other referee on that court is unassigned,
 * the referee leaves their previous court, and the affected courts' refereeId / refereeName columns are updated.
 */
const setCourtReferee = async (courtId: string, refereeId: string | null, referees: Referee[], courts: Court[]) => {
  const touchedCourts: string[] = [courtId];
  for (const r of referees) {
    const isTarget = r.id === refereeId;
    if (!isTarget && r.courtId === courtId) {
      await supabaseStorage.saveReferee({ ...r, courtId: undefined });
    }
    if (isTarget && r.courtId !== courtId) {
      if (r.courtId && !touchedCourts.includes(r.courtId)) touchedCourts.push(r.courtId);
      await supabaseStorage.saveReferee({ ...r, courtId });
    }
  }
  const assigned = referees.find(r => r.id === refereeId);
  for (const id of touchedCourts) {
    const court = courts.find(c => c.id === id);
    if (!court) continue;
    const onCourt = id === courtId ? assigned : undefined;
    await supabaseStorage.saveCourt({ ...court, refereeId: onCourt?.id ?? '', refereeName: onCourt?.name ?? 'Unassigned' });
  }
};

/*
 * Instant (optimistic) match updates for live scoring.
 * The new match is shown on screen straight away and saved in the background, one save at a time and in order.
 * While saves are pending, data loaded from the server is ignored (it may be older than what is on screen);
 * once the last save finishes, everything is reloaded from the server.
 */
let pendingWrites = 0;
let writeSeq = 0;
let writeChain: Promise<unknown> = Promise.resolve();

type StoreSet = (fn: (state: TournamentState) => Partial<TournamentState>) => void;

/** Put an updated match into the store (matches list and the courts that show it) without a server round trip. */
const applyMatchLocally = (set: StoreSet, updated: Match) =>
  set(state => ({
    matches: state.matches.map(m => (m.id === updated.id ? updated : m)),
    courts: state.courts.map(c => ({
      ...c,
      matches: c.matches?.map(m => (m.id === updated.id ? updated : m)),
      match: c.match?.id === updated.id ? updated : c.match
    }))
  }));

/** Show the match now, save it in the background. Rejects if the save fails (the screen is then reloaded from the server). */
const saveMatchOptimistic = (set: StoreSet, refresh: () => Promise<void>, updated: Match): Promise<void> => {
  applyMatchLocally(set, updated);
  pendingWrites++;
  writeSeq++;
  const save = writeChain.then(() => supabaseStorage.saveMatch(updated));
  writeChain = save.catch(() => undefined);
  return save.then(
    () => {
      pendingWrites--;
      if (pendingWrites === 0) void refresh();
    },
    error => {
      pendingWrites--;
      if (pendingWrites === 0) void refresh();
      throw error;
    }
  );
};

export const useTournamentStore = create<TournamentState>((set, get) => ({
  teams: [],
  matches: [],
  courts: [],
  referees: [],
  groups: [],
  pools: [],
  isLoading: false,
  isInitialized: false,

  initializeData: async () => {
    set({ isLoading: true });
    try {
      const [teams, matches, courts, referees, groups, pools] = await Promise.all([
        supabaseStorage.getTeams(),
        supabaseStorage.getMatches(),
        supabaseStorage.getCourts(),
        supabaseStorage.getReferees(),
        supabaseStorage.getGroups(),
        supabaseStorage.getPools()
      ]);

      // Populate courts with their assigned matches
      const courtsWithMatches = courts.map(court => ({
        ...court,
        matches: matches
          .filter(m => m.courtId === court.id && (m.status === 'upcoming' || m.status === 'live'))
          .sort((a, b) => (a.queueOrder ?? 999) - (b.queueOrder ?? 999)),
        match: matches.find(m => m.courtId === court.id && m.status === 'live'),
        ...courtReferee(court.id, referees)
      }));

      set({ teams: withComputedStats(teams, matches), matches, courts: courtsWithMatches, referees, groups, pools, isLoading: false, isInitialized: true });
    } catch (error) {
      console.error('Error initializing data:', error);
      set({ isLoading: false });
    }
  },

  refreshData: async () => {
    const seq = writeSeq;
    try {
      const [teams, matches, courts, referees, groups, pools] = await Promise.all([
        supabaseStorage.getTeams(),
        supabaseStorage.getMatches(),
        supabaseStorage.getCourts(),
        supabaseStorage.getReferees(),
        supabaseStorage.getGroups(),
        supabaseStorage.getPools()
      ]);


      // Populate courts with their assigned matches
      // A score was entered while this was loading: this data may be older than the screen, so drop it
      // (a fresh reload runs when the pending saves finish).
      if (pendingWrites > 0 || seq !== writeSeq) return;

      const courtsWithMatches = courts.map(court => ({
        ...court,
        matches: matches
          .filter(m => m.courtId === court.id && (m.status === 'upcoming' || m.status === 'live'))
          .sort((a, b) => (a.queueOrder ?? 999) - (b.queueOrder ?? 999)),
        match: matches.find(m => m.courtId === court.id && m.status === 'live'),
        ...courtReferee(court.id, referees)
      }));

      set({ teams: withComputedStats(teams, matches), matches, courts: courtsWithMatches, referees, groups, pools });
    } catch (error) {
      console.error('Error refreshing data:', error);
    }
  },

  addTeam: async (team) => {
    try {
      await supabaseStorage.saveTeam(team);
      await get().refreshData();
    } catch (error) {
      console.error('Error adding team:', error);
    }
  },

  updateTeam: async (teamId, updates) => {
    try {
      const team = get().teams.find(t => t.id === teamId);
      if (team) {
        await supabaseStorage.saveTeam({ ...team, ...updates });
        await get().refreshData();
      }
    } catch (error) {
      console.error('Error updating team:', error);
    }
  },

  deleteTeam: async (teamId) => {
    try {
      await supabaseStorage.deleteTeam(teamId);
      await get().refreshData();
    } catch (error) {
      console.error('Error deleting team:', error);
    }
  },

  addMatch: async (match) => {
    try {
      await supabaseStorage.saveMatch(match);
      await get().refreshData();
    } catch (error) {
      console.error('Error adding match:', error);
    }
  },

  updateMatch: async (matchId, updates) => {
    try {
      const match = get().matches.find(m => m.id === matchId);
      if (match) {
        await supabaseStorage.saveMatch({ ...match, ...updates });
        await get().refreshData();
      }
    } catch (error) {
      console.error('Error updating match:', error);
    }
  },

  deleteMatch: async (matchId) => {
    try {
      const wasCompleted = get().matches.find(m => m.id === matchId)?.status === 'completed';
      await supabaseStorage.deleteMatch(matchId);
      if (wasCompleted) {
        await syncTeamStats();
      }
      
      // Also remove match from court if assigned
      const courts = get().courts;
      for (const court of courts) {
        if (court.match?.id === matchId) {
          await supabaseStorage.saveCourt({ ...court, match: undefined });
        }
      }
      
      await get().refreshData();
    } catch (error) {
      console.error('Error deleting match:', error);
    }
  },

  assignMatchToCourt: async (matchId, courtId) => {
    try {
      const match = get().matches.find(m => m.id === matchId);
      const court = get().courts.find(c => c.id === courtId);
      
      if (!match) {
        console.error('Match not found:', matchId);
        return;
      }
      if (!court) {
        console.error('Court not found:', courtId);
        return;
      }

      // Calculate queue order (place at end of queue)
      const courtMatches = get().matches.filter(m => m.courtId === courtId && (m.status === 'upcoming' || m.status === 'live'));
      const maxOrder = Math.max(...courtMatches.map(m => m.queueOrder ?? 0), -1);
      
      
      // Update match with court assignment and queue order
      const updatedMatch = { ...match, courtId, queueOrder: maxOrder + 1 };
      await supabaseStorage.saveMatch(updatedMatch);
      
      await get().refreshData();
    } catch (error) {
      console.error('Error assigning match to court:', error);
    }
  },

  unassignMatchFromCourt: async (matchId) => {
    try {
      const match = get().matches.find(m => m.id === matchId);
      if (!match) {
        console.error('Match not found:', matchId);
        return;
      }

      // Clear court assignment from match - use null for database
      const updatedMatch = { 
        ...match, 
        courtId: null as any, // Set to null to clear from database
        queueOrder: null as any 
      };
      await supabaseStorage.saveMatch(updatedMatch);
      
      await get().refreshData();
    } catch (error) {
      console.error('Error unassigning match from court:', error);
    }
  },

  reorderCourtMatches: async (courtId, matchId, direction) => {
    try {
      const court = get().courts.find(c => c.id === courtId);
      if (!court || !court.matches) return;

      const matches = [...court.matches];
      const currentIndex = matches.findIndex(m => m.id === matchId);
      
      if (currentIndex === -1) return;
      
      // Calculate new position
      const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
      
      // Check bounds
      if (newIndex < 0 || newIndex >= matches.length) return;

      // Swap matches queue order
      const match1 = matches[currentIndex];
      const match2 = matches[newIndex];
      
      const updatedMatch1 = { ...match1, queueOrder: match2.queueOrder ?? newIndex };
      const updatedMatch2 = { ...match2, queueOrder: match1.queueOrder ?? currentIndex };
      
      await supabaseStorage.saveMatch(updatedMatch1);
      await supabaseStorage.saveMatch(updatedMatch2);
      
      await get().refreshData();
    } catch (error) {
      console.error('Error reordering matches:', error);
    }
  },

  startMatch: async (matchId) => {
    try {
      const match = get().matches.find(m => m.id === matchId);
      if (!match) return;

      // Update match status to 'live'
      const updatedMatch = { ...match, status: 'live' as const };
      await supabaseStorage.saveMatch(updatedMatch);

      // Update court with updated match
      if (match.courtId) {
        const court = get().courts.find(c => c.id === match.courtId);
        if (court) {
          await supabaseStorage.saveCourt({ ...court, match: updatedMatch });
        }
      }
      
      await get().refreshData();
    } catch (error) {
      console.error('Error starting match:', error);
    }
  },

  updateMatchScore: async (matchId, team, points) => {
    try {
      const match = get().matches.find(m => m.id === matchId);
      if (!match) return;

      // Get or create current set
      const currentSetIndex = match.sets.findIndex(s => s.setNumber === match.currentSetNumber);
      let currentSet: Set;
      
      if (currentSetIndex === -1) {
        // Create new set if it doesn't exist
        currentSet = {
          setNumber: match.currentSetNumber,
          score: { team1: 0, team2: 0 }
        };
      } else {
        currentSet = { ...match.sets[currentSetIndex] };
      }

      // Check if current set is locked (manually ended)
      if (currentSet.locked) {
        console.warn('Cannot score on a locked set');
        return;
      }
      // The set is already won (e.g. 15-12): no more points until it is ended
      if (setWinnerOf(currentSet.score, setRuleFor(match))) {
        console.warn('Set already won');
        return;
      }

      // Capture serve state BEFORE scoring
      const serveBefore = match.servingTeam;

      // Update current set score
      currentSet.score = { ...currentSet.score, [team]: currentSet.score[team] + points };
      
      let updatedMatch = { ...match };
      
      // Rally scoring: Point winner gets/keeps the serve
      updatedMatch.servingTeam = team;
      const serveAfter = team;

      // Record this scoring event in history for undo
      const scoreEvent: ScoreEvent = {
        setNumber: match.currentSetNumber,
        team,
        serveBefore,
        serveAfter,
        timestamp: Date.now()
      };
      
      const newHistory = [...(match.history || []), scoreEvent];
      updatedMatch.history = newHistory;
      
      // Update the set in the array (no auto-completion)
      const newSets = [...match.sets];
      if (currentSetIndex === -1) {
        newSets.push(currentSet);
      } else {
        newSets[currentSetIndex] = currentSet;
      }
      updatedMatch.sets = newSets;

      await saveMatchOptimistic(set, get().refreshData, updatedMatch);
    } catch (error) {
      console.error('Error updating match score:', error);
      throw error;
    }
  },

  endSet: async (matchId, winner: 'team1' | 'team2') => {
    try {
      await writeChain; // let pending point saves finish first
      const match = get().matches.find(m => m.id === matchId);
      if (!match) return;

      // Find current set
      const currentSetIndex = match.sets.findIndex(s => s.setNumber === match.currentSetNumber);
      if (currentSetIndex === -1) {
        console.error('Current set not found');
        return;
      }

      const currentSet = { ...match.sets[currentSetIndex] };
      
      // Check if already locked
      if (currentSet.locked) {
        console.warn('Set already ended');
        return;
      }

      // Mark set as complete with winner and locked
      currentSet.winner = winner;
      currentSet.locked = true;

      // Update sets array
      const newSets = [...match.sets];
      newSets[currentSetIndex] = currentSet;

      // Update match score (sets won)
      const newScore = { ...match.score };
      newScore[winner] = newScore[winner] + 1;

      // Check if match is won (best of 3 - need 2 sets)
      const matchWon = newScore.team1 === 2 || newScore.team2 === 2;

      let updatedMatch = { ...match, sets: newSets, score: newScore };

      if (matchWon) {
        // Match is over: mark completed and update team statistics
        await completeMatch(updatedMatch);
        await get().refreshData();
        return;
      } else {
        // Start new set - switch positions, set winner serves first
        const newTeam1Position = match.team1Position === 'left' ? 'right' : 'left';
        const newTeam2Position = match.team2Position === 'left' ? 'right' : 'left';
        
        // Create new empty set for next round
        const nextSetNumber = match.currentSetNumber + 1;
        newSets.push({
          setNumber: nextSetNumber,
          score: { team1: 0, team2: 0 }
        });
        
        updatedMatch = {
          ...updatedMatch,
          sets: newSets,
          currentSetNumber: nextSetNumber,
          team1Position: newTeam1Position,
          team2Position: newTeam2Position,
          servingTeam: winner // Previous set winner serves first in next set
        };
      }

      await supabaseStorage.saveMatch(updatedMatch);
      await get().refreshData();
    } catch (error) {
      console.error('Error ending set:', error);
      throw error;
    }
  },

  finishMatch: async (matchId) => {
    await writeChain; // let pending point saves finish first
    const match = get().matches.find(m => m.id === matchId);
    if (!match) return;
    // Throws if the match is tied on sets; callers show the message to the user
    await completeMatch(match);
    await get().refreshData();
  },

  requestMatchApproval: async (matchId, refereeName) => {
    try {
      const match = get().matches.find(m => m.id === matchId);
      if (!match) return;

      const updatedMatch = { 
        ...match, 
        pendingApproval: true,
        requestedBy: refereeName
      };
      
      await supabaseStorage.saveMatch(updatedMatch);
      await get().refreshData();
    } catch (error) {
      console.error('Error requesting match approval:', error);
    }
  },

  approveMatchEnd: async (matchId) => {
    const match = get().matches.find(m => m.id === matchId);
    if (!match) return;
    // Throws if the match is tied on sets; callers show the message to the user
    await completeMatch(match);
    await get().refreshData();
  },

  rejectMatchEnd: async (matchId) => {
    try {
      const match = get().matches.find(m => m.id === matchId);
      if (!match) return;

      const updatedMatch = { 
        ...match, 
        pendingApproval: false,
        requestedBy: undefined
      };
      
      await supabaseStorage.saveMatch(updatedMatch);
      await get().refreshData();
    } catch (error) {
      console.error('Error rejecting match end:', error);
    }
  },

  undoLastScore: async (matchId) => {
    try {
      const match = get().matches.find(m => m.id === matchId);
      if (!match) {
        console.warn('[UNDO] Match not found');
        return;
      }

      // Check if history exists and has events
      const history = match.history || [];
      if (history.length === 0) {
        console.warn('[UNDO] No history to undo');
        return;
      }

      // Pop the last event
      const lastEvent = history[history.length - 1];
      
      // Verify the event belongs to the current set
      if (lastEvent.setNumber !== match.currentSetNumber) {
        console.warn('[UNDO] Cannot undo from a previous set');
        return;
      }

      // Find the current set
      const currentSetIndex = match.sets.findIndex(s => s.setNumber === match.currentSetNumber);
      if (currentSetIndex === -1) {
        console.warn('[UNDO] Current set not found');
        return;
      }

      const currentSet = match.sets[currentSetIndex];

      // Check if set is locked
      if (currentSet.locked) {
        console.warn('[UNDO] Cannot undo in a locked set');
        return;
      }

      // Decrement the score for the team that scored
      const currentScore = currentSet.score[lastEvent.team];
      if (currentScore <= 0) {
        console.warn('[UNDO] Score cannot go negative');
        return;
      }

      
      // Create updated sets array with decremented score
      const updatedSets = [...match.sets];
      updatedSets[currentSetIndex] = {
        ...currentSet,
        score: {
          ...currentSet.score,
          [lastEvent.team]: currentScore - 1
        }
      };

      // Restore the serve state from before the point was scored
      const restoredServingTeam = lastEvent.serveBefore;

      // Remove the last event from history
      const updatedHistory = history.slice(0, -1);

      // Create updated match
      const updatedMatch: Match = {
        ...match,
        sets: updatedSets,
        history: updatedHistory,
        servingTeam: restoredServingTeam
      };

      // Show it now, save in the background
      await saveMatchOptimistic(set, get().refreshData, updatedMatch);

    } catch (error) {
      console.error('[UNDO] Error undoing last score:', error);
      throw error;
    }
  },

  addCourt: async (court) => {
    await supabaseStorage.saveCourt(court);
    await get().refreshData();
  },

  updateCourt: async (courtId, updates) => {
    try {
      const court = get().courts.find(c => c.id === courtId);
      if (court) {
        // Exclude computed properties before saving to Supabase
        const { matches, match, ...courtData } = { ...court, ...updates };
        await supabaseStorage.saveCourt(courtData as Court);
        await get().refreshData();
      }
    } catch (error) {
      console.error('Error updating court:', error);
    }
  },

  addReferee: async (referee) => {
    try {
      await supabaseStorage.saveReferee({ ...referee, courtId: undefined });
      if (referee.courtId) {
        await setCourtReferee(referee.courtId, referee.id, [...get().referees, { ...referee, courtId: undefined }], get().courts);
      }
      await get().refreshData();
    } catch (error) {
      console.error('Error adding referee:', error);
    }
  },

  updateReferee: async (refereeId, updates) => {
    try {
      const referee = get().referees.find(r => r.id === refereeId);
      if (!referee) return;

      const updatedReferee = { ...referee, ...updates };
      // Save the details, then move the court assignment through setCourtReferee so courts stay exclusive
      await supabaseStorage.saveReferee({ ...updatedReferee, courtId: referee.courtId });
      if (updatedReferee.courtId !== referee.courtId) {
        const others = get().referees.map(r => (r.id === refereeId ? { ...updatedReferee, courtId: referee.courtId } : r));
        if (updatedReferee.courtId) {
          await setCourtReferee(updatedReferee.courtId, refereeId, others, get().courts);
        } else if (referee.courtId) {
          await setCourtReferee(referee.courtId, null, others, get().courts);
        }
      }
      await get().refreshData();
    } catch (error) {
      console.error('Error updating referee:', error);
    }
  },

  deleteReferee: async (refereeId) => {
    try {
      await supabaseStorage.deleteReferee(refereeId);
      await get().refreshData();
    } catch (error) {
      console.error('Error deleting referee:', error);
    }
  },

  assignRefereeToCourt: async (refereeId, courtId) => {
    if (refereeId && !get().referees.some(r => r.id === refereeId)) throw new Error('Referee not found');
    if (!get().courts.some(c => c.id === courtId)) throw new Error('Court not found');
    await setCourtReferee(courtId, refereeId, get().referees, get().courts);
    await get().refreshData();
  },

  updateStanding: async (standingId, entries, manualOrder) => {
    const teams = get().teams;
    await Promise.all(entries.flatMap(({ teamId, stats }, index) => {
      const team = teams.find(t => t.id === teamId);
      if (!team || standingIdOf(team) !== standingId) return [];
      return [
        supabaseStorage.saveTeamStatsOverride(teamId, stats),
        supabaseStorage.saveTeamStandingRank(teamId, manualOrder ? index + 1 : null)
      ];
    }));
    await get().refreshData();
  },

  resetStanding: async (standingId) => {
    const standingTeams = get().teams.filter(t => standingIdOf(t) === standingId);
    await Promise.all(standingTeams.flatMap(t => [
      supabaseStorage.saveTeamStatsOverride(t.id, null),
      supabaseStorage.saveTeamStandingRank(t.id, null)
    ]));
    await get().refreshData();
  },

  setMatchSetup: async (matchId, { swapSides, servingTeam, swapPlayers }) => {
    const match = get().matches.find(m => m.id === matchId);
    if (!match) throw new Error('Match not found');
    if (match.status === 'completed') throw new Error('This match is already completed.');
    const team1Position = match.team1Position || 'left';

    // Swap a team's two players between its service courts: flip who starts the set in the right court,
    // which flips the current (derived) positions too.
    let courtPositions = match.courtPositions ?? {};
    if (swapPlayers) {
      const players = match[swapPlayers].players;
      if (players.length < 2) throw new Error('This team needs two players to swap positions.');
      const setKey = String(match.currentSetNumber || 1);
      const startRight = courtPositions[setKey]?.[swapPlayers] ?? players[0].id;
      const other = players.find(p => p.id !== startRight)?.id ?? players[1].id;
      courtPositions = { ...courtPositions, [setKey]: { ...courtPositions[setKey], [swapPlayers]: other } };
    }
    await saveMatchOptimistic(set, get().refreshData, {
      ...match,
      ...(swapSides
        ? { team1Position: team1Position === 'left' ? 'right' : 'left', team2Position: team1Position }
        : {}),
      ...(servingTeam ? { servingTeam } : {}),
      courtPositions
    });
  },

  setMatchResult: async (matchId, setScores, winnerKey) => {
    const match = get().matches.find(m => m.id === matchId);
    if (!match) throw new Error('Match not found');
    if (match.status === 'live') throw new Error('This match is live. Let the referee finish it, or edit it after it is completed.');
    const played = setScores.filter(s => s.team1 > 0 || s.team2 > 0);
    if (played.length === 0) throw new Error('Enter at least one set score.');
    if (played.some(s => s.team1 === s.team2)) throw new Error('A set cannot end in a tie.');

    const sets: Set[] = played.map((s, i) => ({
      setNumber: i + 1,
      score: { team1: s.team1, team2: s.team2 },
      winner: s.team1 > s.team2 ? 'team1' : 'team2',
      locked: true
    }));
    const updated: Match = {
      ...match,
      sets,
      score: {
        team1: sets.filter(s => s.winner === 'team1').length,
        team2: sets.filter(s => s.winner === 'team2').length
      },
      currentSetNumber: sets.length,
      winner: match[winnerKey],
      status: 'completed',
      pendingApproval: false,
      requestedBy: undefined
    };
    await supabaseStorage.saveMatch(updated);

    // A changed semi-final winner moves into the final, as long as the final hasn't started
    if (updated.stage === 'semifinal') {
      const { final } = getKnockout(get().matches, updated.team1.groupId);
      if (final && final.status === 'upcoming') {
        const side = updated.bracketSlot === 2 ? 'team2' : 'team1';
        if (final[side].id !== updated.winner!.id) {
          await supabaseStorage.saveMatch({ ...final, [side]: updated.winner! });
        }
      }
    }

    await syncTeamStats();
    await get().refreshData();
  },

  createKnockoutMatch: async ({ groupId, stage, slot, team1Id, team2Id, name, scheduledTime }) => {
    const teams = get().teams;
    const team1 = teams.find(t => t.id === team1Id);
    const team2 = teams.find(t => t.id === team2Id);
    if (!team1 || !team2) throw new Error('Select both teams');
    if (team1.id === team2.id) throw new Error('Select two different teams');
    if (team1.groupId !== groupId || team2.groupId !== groupId) throw new Error('Both teams must be in the same group');

    const existing = get().matches.find(m =>
      m.stage === stage && m.team1.groupId === groupId && (stage === 'final' || m.bracketSlot === slot)
    );
    if (existing) {
      throw new Error(`${existing.matchName || (stage === 'final' ? 'The final' : `Semi-final ${slot}`)} already exists for this group. Delete it first to recreate it.`);
    }

    await supabaseStorage.saveMatch({
      id: `match-${stage}-${groupId}-${slot}-${Date.now()}`,
      team1,
      team2,
      score: { team1: 0, team2: 0 },
      sets: [{ setNumber: 1, score: { team1: 0, team2: 0 } }],
      currentSetNumber: 1,
      servingTeam: 'team1',
      team1Position: 'left',
      team2Position: 'right',
      status: 'upcoming',
      history: [],
      stage,
      bracketSlot: slot,
      matchName: name?.trim() || (stage === 'final' ? 'Final' : `Semi-final ${slot}`),
      scheduledTime: scheduledTime?.trim() || null
    });
    await get().refreshData();
  },

  createSemiFinals: async (groupId, pairs) => {
    const ids = pairs.flat();
    if (ids.some((id, i) => ids.indexOf(id) !== i)) throw new Error('A team can only appear in one semi-final');
    const { semi1, semi2 } = getKnockout(get().matches, groupId);
    if (semi1 || semi2) throw new Error('Semi-finals already exist for this group. Delete them first to recreate them.');
    for (const [index, [team1Id, team2Id]] of pairs.entries()) {
      await get().createKnockoutMatch({ groupId, stage: 'semifinal', slot: index + 1, team1Id, team2Id });
    }
  },

  createFinal: async (groupId) => {
    const { semi1, semi2, final } = getKnockout(get().matches, groupId);
    if (final) throw new Error('The final already exists for this group.');
    if (!semi1?.winner || !semi2?.winner || semi1.status !== 'completed' || semi2.status !== 'completed') {
      throw new Error('Both semi-finals must be completed (and approved) before the final can be created.');
    }
    await get().createKnockoutMatch({ groupId, stage: 'final', slot: 1, team1Id: semi1.winner.id, team2Id: semi2.winner.id });
  },

  renameCourt: async (courtId, name) => {
    const court = get().courts.find(c => c.id === courtId);
    if (!court) throw new Error('Court not found');
    await supabaseStorage.saveCourt({ ...court, name: name.trim() });
    await get().refreshData();
  },

  deleteCourt: async (courtId) => {
    const court = get().courts.find(c => c.id === courtId);
    if (!court) throw new Error('Court not found');
    const active = get().matches.filter(m => m.courtId === courtId && m.status !== 'completed');
    if (active.length > 0) {
      throw new Error(`${court.name} still has ${active.length} queued or live match(es). Remove them from the court first.`);
    }
    // Referees on this court are unassigned by the database (on delete set null);
    // completed matches keep their scores but lose the court link.
    await supabaseStorage.deleteCourt(courtId);
    await get().refreshData();
  },

  addGroup: async (name) => {
    await supabaseStorage.saveGroup({ id: `group-${Date.now()}`, name: name.trim() });
    await get().refreshData();
  },

  renameGroup: async (groupId, name) => {
    await supabaseStorage.saveGroup({ id: groupId, name: name.trim() });
    await get().refreshData();
  },

  deleteGroup: async (groupId) => {
    const group = get().groups.find(g => g.id === groupId);
    const teamCount = get().teams.filter(t => t.groupId === groupId).length;
    if (teamCount > 0) {
      throw new Error(`${group?.name ?? 'This group'} still has ${teamCount} team(s). Move or delete them first.`);
    }
    await supabaseStorage.deleteGroup(groupId); // its pools are deleted with it
    await get().refreshData();
  },

  addPool: async (groupId, name) => {
    const group = get().groups.find(g => g.id === groupId);
    if (!group) throw new Error('Group not found');
    const isFirstPool = !get().pools.some(p => p.groupId === groupId);
    const teamsWithoutPool = get().teams.filter(t => t.groupId === groupId && !t.poolId);
    const pool: Pool = { id: `pool-${Date.now()}`, name: name.trim(), groupId };
    await supabaseStorage.savePool(pool);
    // When a group gets its first pool, put its existing teams in it so every team has a pool.
    if (isFirstPool && teamsWithoutPool.length > 0) {
      await Promise.all(teamsWithoutPool.map(t => supabaseStorage.saveTeam({ ...t, poolId: pool.id })));
    }
    await get().refreshData();
  },

  renamePool: async (poolId, name) => {
    const pool = get().pools.find(p => p.id === poolId);
    if (!pool) throw new Error('Pool not found');
    await supabaseStorage.savePool({ ...pool, name: name.trim() });
    await get().refreshData();
  },

  deletePool: async (poolId) => {
    const pool = get().pools.find(p => p.id === poolId);
    const teamCount = get().teams.filter(t => t.poolId === poolId).length;
    if (teamCount > 0) {
      throw new Error(`${pool?.name ?? 'This pool'} still has ${teamCount} team(s). Move or delete them first.`);
    }
    await supabaseStorage.deletePool(poolId);
    await get().refreshData();
  },

  resetScores: async resetPassword => {
    await supabaseStorage.resetScores(resetPassword);
    await get().refreshData();
  },

  resetEverything: async resetPassword => {
    await supabaseStorage.resetEverything(resetPassword);
    await get().refreshData();
  },

  recalculateAllStatistics: async () => {
    await syncTeamStats();
    await get().refreshData();
  },

  getTeamStats: () => {
    return calculations.calculateTeamStats(get().teams, get().matches);
  }
}));
