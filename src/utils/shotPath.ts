import type { Match } from '../types';
import { courtState, serviceCourtCenter } from '../components/CourtDiagram';

/*
 * A shot drawn on the court (or made up automatically): where the shuttle was hit and where it landed.
 * Points are 0–1 of the court diagram's width (x, along the court) and height (y, across it).
 *
 * Saved with team 1 at the LEFT end, so a moment still shows on the right side of the court after the
 * teams change ends. Turning the court 180° (x → 1−x, y → 1−y) is the same as swapping ends.
 */

export interface Pt {
  x: number;
  y: number;
}

export interface ShotPath {
  from: Pt;
  to: Pt;
  auto?: boolean; // made up (the referee didn't draw one)
}

type Side = 'team1' | 'team2';

const clamp = (n: number, lo = 0.02, hi = 0.98) => Math.min(hi, Math.max(lo, n));
const turn = (p: Pt): Pt => ({ x: 1 - p.x, y: 1 - p.y });

/** Diagram (as shown now) → saved (team 1 on the left), and back: the same 180° turn when team 1 is on the right. */
export const toSaved = (path: ShotPath, match: Match): ShotPath =>
  (match.team1Position || 'left') === 'right' ? { ...path, from: turn(path.from), to: turn(path.to) } : path;
export const toDisplay = toSaved;

/** Is this a usable saved path? */
export const isShotPath = (v: unknown): v is ShotPath => {
  const p = v as ShotPath | null;
  const ok = (q?: Pt) => !!q && Number.isFinite(q.x) && Number.isFinite(q.y);
  return !!p && typeof p === 'object' && ok(p.from) && ok(p.to);
};

/** Where a player stands right now (their service court), or the team's server / right-court player. */
export const playerSpot = (match: Match, team: Side, playerId?: string | null): Pt => {
  const { endOf, positions, server, serverPlayer } = courtState(match);
  const end = endOf(team);
  const { right } = positions(team);
  const id = playerId ?? (server === team ? serverPlayer?.id : right?.id);
  return serviceCourtCenter(end, id === right?.id);
};

/** How deep in the opponent's half each kind of shot lands: 0 = at the net, 1 = the back line. */
const DEPTH: Record<string, [number, number]> = {
  smash: [0.35, 0.75],
  drop: [0.06, 0.24],
  net: [0.04, 0.2],
  clear: [0.82, 0.96],
  drive: [0.45, 0.75],
  serve: [0.3, 0.42],
  line: [0.9, 0.98],
  defence: [0.55, 0.9],
  dive: [0.2, 0.6],
  rally: [0.4, 0.85],
  trick: [0.15, 0.6],
  other: [0.25, 0.8]
};

/**
 * A believable shot when the referee doesn't draw one: from the player's spot (a little jitter) to a spot in the
 * opponent's half that suits the shot (drops near the net, clears at the back, …). In diagram coordinates.
 */
export const autoPath = (match: Match, team: Side, playerId: string | null, kind: string | null): ShotPath => {
  const { endOf } = courtState(match);
  const mine = endOf(team);
  const start = playerSpot(match, team, playerId);
  const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
  const [d0, d1] = DEPTH[kind ?? 'other'] ?? DEPTH.other;
  const depth = rand(d0, d1);
  // The opponent's half is the other side of the net (x = 0.5)
  const x = mine === 'left' ? 0.5 + depth * 0.5 : 0.5 - depth * 0.5;
  // Serves go diagonally (to the other side of the centre line)
  const y = kind === 'serve' ? (start.y < 0.5 ? rand(0.58, 0.85) : rand(0.15, 0.42)) : rand(0.1, 0.9);
  return {
    from: { x: clamp(start.x + rand(-0.04, 0.04)), y: clamp(start.y + rand(-0.08, 0.08)) },
    to: { x: clamp(x), y: clamp(y) },
    auto: true
  };
};
