import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Match } from '../types';
import { isShotPath, type ShotPath } from './shotPath';

/*
 * Match commentary: a time log of a match.
 *  - Saved in the match_events table: start, pause / resume, moments (a smash, a drop …), notes, set and match ends.
 *  - Points come from match.history (each point already has its time), so they are never stored twice.
 */

export type MatchEventType = 'start' | 'pause' | 'resume' | 'moment' | 'note' | 'set_end' | 'match_end';
type Side = 'team1' | 'team2';

export interface MatchEvent {
  id: string;
  match_id: string;
  type: MatchEventType;
  at: string; // ISO time it happened
  team: Side | null;
  player_id: string | null;
  player_name: string | null;
  kind: string | null;
  comment: string | null;
  set_number: number | null;
  score: { team1: number; team2: number } | null;
  sets_won: { team1: number; team2: number } | null;
  path: ShotPath | null; // moment: the shot's line (saved with team 1 at the left end)
  created_by: string | null;
}

export type NewMatchEvent = Partial<Omit<MatchEvent, 'id' | 'match_id' | 'type'>> & { type: MatchEventType };

/** Moments the referee can capture (who + what). */
export const MOMENT_KINDS: { id: string; label: string; icon: string }[] = [
  { id: 'smash', label: 'Smash', icon: '💥' },
  { id: 'drop', label: 'Drop shot', icon: '🪶' },
  { id: 'net', label: 'Net kill', icon: '🎯' },
  { id: 'rally', label: 'Long rally', icon: '🔁' },
  { id: 'defence', label: 'Great defence', icon: '🛡️' },
  { id: 'dive', label: 'Diving save', icon: '🤸' },
  { id: 'drive', label: 'Fast drive', icon: '⚡' },
  { id: 'serve', label: 'Ace serve', icon: '🏸' },
  { id: 'trick', label: 'Trick shot', icon: '🪄' },
  { id: 'line', label: 'On the line', icon: '📏' },
  { id: 'other', label: 'Other', icon: '⭐' }
];

/** Why a match was paused. */
export const PAUSE_REASONS: { id: string; label: string; icon: string }[] = [
  { id: 'injury', label: 'Injury', icon: '🩹' },
  { id: 'shuttle', label: 'Shuttle change', icon: '🏸' },
  { id: 'equipment', label: 'Racket / shoes', icon: '🎾' },
  { id: 'court', label: 'Court issue', icon: '💧' },
  { id: 'break', label: 'Drinks break', icon: '🥤' },
  { id: 'review', label: 'Line call / dispute', icon: '🧐' },
  { id: 'other', label: 'Other', icon: '⏸️' }
];

export const momentKind = (id?: string | null) => MOMENT_KINDS.find(k => k.id === id) ?? MOMENT_KINDS[MOMENT_KINDS.length - 1];
export const pauseReason = (id?: string | null) => PAUSE_REASONS.find(r => r.id === id) ?? PAUSE_REASONS[PAUSE_REASONS.length - 1];

/** The current set score and sets won, to save with an event. */
export const scoreSnapshot = (match: Match) => {
  const set = match.sets?.find(s => s.setNumber === match.currentSetNumber);
  return {
    set_number: match.currentSetNumber || 1,
    score: { team1: set?.score.team1 ?? 0, team2: set?.score.team2 ?? 0 },
    sets_won: { team1: match.score?.team1 ?? 0, team2: match.score?.team2 ?? 0 }
  };
};

/** Save one event. `at` defaults to now (the tap), not the time the save reaches the database. */
export const addMatchEvent = async (matchId: string, event: NewMatchEvent): Promise<MatchEvent> => {
  const { data, error } = await supabase
    .from('match_events')
    .insert({ ...event, match_id: matchId, at: event.at ?? new Date().toISOString() })
    .select()
    .single();
  if (error) throw error;
  return data as MatchEvent;
};

export const deleteMatchEvent = async (id: string): Promise<void> => {
  const { error } = await supabase.from('match_events').delete().eq('id', id);
  if (error) throw error;
};

/** All events of a match, oldest first, kept up to date live. */
export const useMatchEvents = (matchId: string | null | undefined) => {
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!matchId) return;
    const { data } = await supabase.from('match_events').select('*').eq('match_id', matchId).order('at', { ascending: true });
    if (data) setEvents(data as MatchEvent[]);
    setLoaded(true);
  }, [matchId]);

  useEffect(() => {
    setEvents([]);
    setLoaded(false);
    if (!matchId) return;
    load();
    const channel = supabase
      .channel(`match-events-${matchId}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'match_events', filter: `match_id=eq.${matchId}` }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [matchId, load]);

  /** Save and show straight away (the live update then confirms it). */
  const add = useCallback(
    async (event: NewMatchEvent) => {
      if (!matchId) return;
      const saved = await addMatchEvent(matchId, event);
      setEvents(list => (list.some(e => e.id === saved.id) ? list : [...list, saved].sort((a, b) => a.at.localeCompare(b.at))));
      return saved;
    },
    [matchId]
  );

  const remove = useCallback(async (id: string) => {
    await deleteMatchEvent(id);
    setEvents(list => list.filter(e => e.id !== id));
  }, []);

  return { events, loaded, add, remove };
};

/** Paused right now? (the last pause has no resume after it) */
export const pauseStateOf = (events: MatchEvent[]): MatchEvent | null => {
  const last = [...events].reverse().find(e => e.type === 'pause' || e.type === 'resume');
  return last?.type === 'pause' ? last : null;
};

/** "2m 05s" */
export const formatDuration = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${String(s % 60).padStart(2, '0')}s` : `${s}s`;
};

export const clockTime = (ms: number) =>
  new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' });

export interface CommentaryItem {
  id: string;
  at: number; // ms
  kind: 'point' | MatchEventType;
  icon: string;
  title: string;
  detail?: string;
  team?: Side;
  setNumber?: number;
  score?: { team1: number; team2: number };
  highlight: boolean; // shown in "Highlights"
  eventId?: string; // a saved event (the referee can remove it)
  /** Moments with a shot line: what to replay on the court. */
  replay?: { path: ShotPath; kind: string | null; label: string };
}

/** Everything that happened in a match, newest first. */
export const buildCommentary = (match: Match, events: MatchEvent[]): CommentaryItem[] => {
  const items: CommentaryItem[] = [];
  const name = (side?: Side | null) => (side ? match[side].name : '');

  // Points, with the running score of their set
  const running: Record<number, { team1: number; team2: number }> = {};
  (match.history || []).forEach((p, i) => {
    const s = (running[p.setNumber] ??= { team1: 0, team2: 0 });
    s[p.team] += 1;
    items.push({
      id: `point-${i}-${p.timestamp}`,
      at: p.timestamp,
      kind: 'point',
      icon: '🏸',
      title: `Point to ${name(p.team)}`,
      team: p.team,
      setNumber: p.setNumber,
      score: { ...s },
      highlight: false
    });
  });

  let lastPause: MatchEvent | null = null;
  for (const e of events) {
    const at = new Date(e.at).getTime();
    const base = { id: e.id, eventId: e.id, at, kind: e.type, team: e.team ?? undefined, setNumber: e.set_number ?? undefined, score: e.score ?? undefined };
    switch (e.type) {
      case 'start':
        items.push({ ...base, icon: '🟢', title: 'Match started', detail: `${match.team1.name} vs ${match.team2.name}`, highlight: true, score: undefined });
        break;
      case 'pause': {
        const r = pauseReason(e.kind);
        lastPause = e;
        items.push({ ...base, icon: '⏸️', title: `Match paused · ${r.icon} ${r.label}`, detail: e.comment ?? undefined, highlight: true });
        break;
      }
      case 'resume': {
        const took = lastPause ? at - new Date(lastPause.at).getTime() : 0;
        items.push({ ...base, icon: '▶️', title: 'Match resumed', detail: took > 0 ? `After a ${formatDuration(took)} pause` : undefined, highlight: true });
        lastPause = null;
        break;
      }
      case 'moment': {
        const k = momentKind(e.kind);
        const who = e.player_name || name(e.team);
        items.push({
          ...base,
          icon: k.icon,
          title: e.kind === 'rally' ? `${k.label} won by ${who}` : `${k.label} by ${who}`,
          detail: e.comment ?? undefined,
          highlight: true,
          replay: isShotPath(e.path) ? { path: e.path, kind: e.kind, label: `${k.icon} ${k.label} · ${e.player_name || name(e.team)}` } : undefined
        });
        break;
      }
      case 'note':
        items.push({ ...base, icon: '💬', title: e.comment || 'Note', highlight: true });
        break;
      case 'set_end':
        items.push({
          ...base,
          icon: '🏁',
          title: e.set_number ? `Set ${e.set_number} to ${name(e.team)}` : `Set to ${name(e.team)}`,
          highlight: true
        });
        break;
      case 'match_end':
        items.push({
          ...base,
          icon: '🏆',
          title: `${name(e.team)} win the match`,
          detail: e.sets_won ? `Sets ${e.sets_won.team1}–${e.sets_won.team2}` : undefined,
          highlight: true,
          score: undefined
        });
        break;
    }
  }

  /*
   * Start, set ends and match end for matches without those log entries (started before the commentary existed,
   * or finished from the admin screens): taken from the points' times and the set results.
   */
  const history = match.history || [];
  const has = (type: MatchEventType, set?: number) => events.some(e => e.type === type && (set == null || e.set_number === set));
  if (history.length > 0 && !has('start')) {
    items.unshift({
      id: 'derived-start',
      at: history[0].timestamp - 1,
      kind: 'start',
      icon: '🟢',
      title: 'Match started',
      detail: `${match.team1.name} vs ${match.team2.name}`,
      highlight: true
    });
  }
  const setsWon = { team1: 0, team2: 0 };
  for (const set of [...(match.sets || [])].sort((a, b) => a.setNumber - b.setNumber)) {
    if (!set.winner) continue;
    setsWon[set.winner] += 1;
    if (has('set_end', set.setNumber)) continue;
    const lastPoint = [...history].reverse().find(p => p.setNumber === set.setNumber);
    if (!lastPoint) continue; // no times known for this set
    items.push({
      id: `derived-set-${set.setNumber}`,
      at: lastPoint.timestamp,
      kind: 'set_end',
      icon: '🏁',
      title: `Set ${set.setNumber} to ${name(set.winner)}`,
      setNumber: set.setNumber,
      score: { ...set.score },
      team: set.winner,
      highlight: true
    });
  }
  if (match.status === 'completed' && match.winner && !has('match_end') && history.length > 0) {
    const side: Side = match.winner.id === match.team1.id ? 'team1' : 'team2';
    items.push({
      id: 'derived-match-end',
      at: history[history.length - 1].timestamp,
      kind: 'match_end',
      icon: '🏆',
      title: `${name(side)} win the match`,
      detail: `Sets ${match.score?.team1 ?? setsWon.team1}–${match.score?.team2 ?? setsWon.team2}`,
      team: side,
      highlight: true
    });
  }

  // Newest first; at the same moment the later-added item (e.g. the set end after its last point) goes on top
  return items.map((item, i) => ({ item, i })).sort((a, b) => b.item.at - a.item.at || b.i - a.i).map(x => x.item);
};
